"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { nowDubai, todayDubai } from "@/lib/timezone";
import { createClient } from "@/lib/supabase/client";
import { markSynced } from "@/hooks/useSyncStatus";

type BottleType = "Bottle" | "Decant" | "Sample";
type BottleStatus = "Wardrobe" | "Archive";
type GenderScale = 0 | 1 | 2 | 3 | 4;
type ArchiveReason = "sold" | "emptied" | "gifted";

type Bottle = {
  id: string;
  bottleSizeMl: number;
  bottleType: BottleType;
  status: BottleStatus;
};

type Purchase = {
  id: string;
  bottleId: string;
  date: string;
  ml: number;
  price: number;
  shopName: string;
  shopLink?: string;
};

type WearLog = {
  id: string;
  wornOn: string;
  occasion: string;
  sprays: number;
  weatherTag: string;
  compliment: boolean;
  performance: string;
};

type Perfume = {
  id: string;
  status: "wardrobe" | "wishlist" | "archive";
  brand: string;
  model: string;
  imageUrl: string;
  ratingStars: number | null;
  notesTags: string[];
  weatherTags: ("Cold" | "Neutral" | "Hot")[];
  genderScale: GenderScale;
  longevity: string;
  sillage: string;
  value: "Poor" | "Okay" | "Good" | "Excellent";
  cloneSimilar: string;
  occasionTags: string[];
  purchasePriority?: string;
  bottles: Bottle[];
  archiveReason?: string;
};

type BottleDraft = {
  bottleType: BottleType;
  sizeMl: string;
  price: string;
  date: string;
  shopCombined: string;
};

const OCCASION_OPTIONS = ["Casual", "Formal", "Party", "Date", "Travel"] as const;
const LONGEVITY_OPTIONS = ["Poor", "Weak", "Average", "Good", "Excellent"] as const;
const PROJECTION_OPTIONS = ["Soft", "Moderate", "Strong", "Loud"] as const;
const PERFORMANCE_OPTIONS = ["Poor", "Okay", "Good", "Excellent"] as const;
const WEATHER_OPTIONS = ["Hot", "Neutral", "Cold", "Rainy", "Indoor AC"] as const;
const WEAR_PERFORMANCE_OPTIONS = ["Weak", "Moderate", "Strong", "Excellent"] as const;

function safeNum(x: unknown, fb = 0) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fb;
}

function fmtMoney(a: number) {
  return `AED ${a.toFixed(2)}`;
}

function genderLabel(v: GenderScale) {
  return ["Masculine", "Lean masc.", "Unisex", "Lean fem.", "Feminine"][v];
}

function normalizeName(v: string) {
  return v.trim().toLowerCase().replace(/\s+/g, " ");
}

function joinShop(shopName?: string, shopLink?: string) {
  const name = (shopName || "").trim();
  const link = (shopLink || "").trim();
  if (name && link) return `${name} | ${link}`;
  return name || link || "";
}

function parseShopCombined(v: string) {
  const raw = v.trim();
  if (!raw) return { shopName: "Unknown", shopLink: null as string | null };
  const parts = raw.split("|").map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) return { shopName: parts[0], shopLink: parts.slice(1).join(" | ") || null };
  if (/^https?:\/\//i.test(raw)) return { shopName: "Unknown", shopLink: raw };
  return { shopName: raw, shopLink: null as string | null };
}

function isProbablyImageUrl(v: string) {
  return /^https?:\/\//i.test(v) && /(\.png|\.jpg|\.jpeg|\.webp|\.avif|\.gif)(\?.*)?$/i.test(v);
}

function useDarkMode() {
  const get = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const [isDark, setIsDark] = useState(get);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const obs = new MutationObserver(() => setIsDark(get()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToItem(row: any): Perfume {
  return {
    id: row.id,
    status: row.status ?? "wardrobe",
    brand: row.brand ?? "",
    model: row.model ?? "",
    imageUrl: row.image_url || "",
    ratingStars: row.rating_stars ?? null,
    notesTags: row.notes_tags ?? [],
    weatherTags: row.weather_tags ?? [],
    genderScale: (row.gender_scale ?? 2) as GenderScale,
    longevity: row.longevity ?? "",
    sillage: row.sillage ?? "",
    value: (row.value_rating ?? "Okay") as Perfume["value"],
    cloneSimilar: row.clone_similar ?? "",
    occasionTags: String(row.usage_type ?? "")
      .split(",")
      .map((x: string) => x.trim())
      .filter(Boolean),
    purchasePriority: row.purchase_priority ?? "Medium",
    bottles: (row.perfume_bottles ?? []).map(
      (b: any): Bottle => ({
        id: b.id,
        bottleSizeMl: b.bottle_size_ml ?? 100,
        bottleType: (b.bottle_type === "Full bottle" ? "Bottle" : b.bottle_type ?? "Bottle") as BottleType,
        status: (b.status === "In collection" ? "Wardrobe" : b.status ?? "Wardrobe") as BottleStatus,
      }),
    ),
    archiveReason: row.archive_reason ?? undefined,
  };
}

function Tag({ label }: { label: string }) {
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        background: "rgba(245,166,35,0.12)",
        color: "#d97706",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}

function Stars({ value, size = 16 }: { value: number | null; size?: number }) {
  const v = Math.round(value ?? 0);
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ fontSize: size, color: n <= v ? "#F5A623" : "#d1d5db" }}>
          ★
        </span>
      ))}
    </div>
  );
}

export default function PerfumeDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const router = useRouter();
  const isDark = useDarkMode();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [item, setItem] = useState<Perfume | null>(null);
  const [catalog, setCatalog] = useState<Perfume[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [wearLogs, setWearLogs] = useState<WearLog[]>([]);
  const [globalNotes, setGlobalNotes] = useState<string[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [isEdit, setIsEdit] = useState(false);
  const [noteManager, setNoteManager] = useState(false);
  const [weatherManager, setWeatherManager] = useState(false);
  const [toast, setToast] = useState("");
  const [photoMode, setPhotoMode] = useState<"url" | "upload">("url");
  const [photoInput, setPhotoInput] = useState("");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [showPhoto, setShowPhoto] = useState(false);
  const [showAddBottle, setShowAddBottle] = useState(false);
  const [showWearModal, setShowWearModal] = useState(false);
  const [brandView, setBrandView] = useState(false);
  const [editingBottleId, setEditingBottleId] = useState<string | null>(null);
  const [bottleDrafts, setBottleDrafts] = useState<Record<string, BottleDraft>>({});
  const [archiveTarget, setArchiveTarget] = useState<{ bottleId: string; purchaseId?: string } | null>(null);
  const [archiveReason, setArchiveReason] = useState<ArchiveReason>("Emptied");
  const [archiveComment, setArchiveComment] = useState("");
  const [removeTarget, setRemoveTarget] = useState<{ bottleId: string; purchaseId?: string } | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<{ bottleId: string } | null>(null);
  const [newBottle, setNewBottle] = useState({
    bottleType: "Bottle" as BottleType,
    sizeMl: "100",
    price: "",
    date: nowDubai().slice(0, 10),
    shopCombined: "",
  });
  const [wearForm, setWearForm] = useState({
    wornOn: todayDubai(),
    occasion: "Casual",
    sprays: "6",
    weatherTag: "Neutral",
    compliment: false,
    performance: "Moderate",
  });

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);
      const [itemRes, purRes, allRes, catalogRes, wearRes] = await Promise.all([
        supabase.from("perfumes").select("*, perfume_bottles(*)").eq("id", params.id).single(),
        supabase.from("perfume_purchases").select("*").eq("perfume_id", params.id).order("date", { ascending: false }),
        supabase.from("perfumes").select("notes_tags").eq("user_id", user.id),
        supabase.from("perfumes").select("*").eq("user_id", user.id).order("brand"),
        supabase.from("perfume_wear_logs").select("*").eq("perfume_id", params.id).order("worn_on", { ascending: false }),
      ]);
      if (itemRes.error) showToast(itemRes.error.message);
      if (purRes.error) showToast(purRes.error.message);
      if (catalogRes.error) showToast(catalogRes.error.message);
      if (wearRes.error) showToast(wearRes.error.message);
      if (itemRes.data) setItem(dbToItem(itemRes.data));
      if (catalogRes.data) setCatalog(catalogRes.data.map(dbToItem));
      if (purRes.data) {
        setPurchases(
          purRes.data.map((p: any) => ({
            id: p.id,
            bottleId: p.bottle_id ?? "none",
            date: p.date,
            ml: p.ml ?? 0,
            price: p.price ?? 0,
            shopName: p.shop_name ?? "Unknown",
            shopLink: p.shop_link ?? undefined,
          })),
        );
      }
      if (wearRes.data) {
        setWearLogs(
          wearRes.data.map((w: any) => ({
            id: w.id,
            wornOn: w.worn_on,
            occasion: w.occasion ?? "",
            sprays: w.sprays ?? 0,
            weatherTag: w.weather_tag ?? "",
            compliment: !!w.compliment,
            performance: w.performance ?? "",
          })),
        );
      }
      if (allRes.data) {
        setGlobalNotes(Array.from(new Set(allRes.data.flatMap((r: { notes_tags: string[] }) => r.notes_tags ?? []))).sort());
      }
      setLoading(false);
      markSynced();
    }
    load();
  }, [params.id, router, supabase]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  async function update(partial: Partial<Perfume>) {
    if (!item) return;
    setItem((prev) => (prev ? { ...prev, ...partial } : prev));
    const db: Record<string, unknown> = {};
    if (partial.ratingStars !== undefined) db.rating_stars = partial.ratingStars;
    if (partial.notesTags !== undefined) db.notes_tags = partial.notesTags;
    if (partial.weatherTags !== undefined) db.weather_tags = partial.weatherTags;
    if (partial.genderScale !== undefined) db.gender_scale = partial.genderScale;
    if (partial.longevity !== undefined) db.longevity = partial.longevity;
    if (partial.sillage !== undefined) db.sillage = partial.sillage;
    if (partial.value !== undefined) db.value_rating = partial.value;
    if (partial.cloneSimilar !== undefined) db.clone_similar = partial.cloneSimilar;
    if (partial.occasionTags !== undefined) db.usage_type = partial.occasionTags.join(", ");
    if (partial.imageUrl !== undefined) db.image_url = partial.imageUrl;
    if (partial.purchasePriority !== undefined) db.purchase_priority = partial.purchasePriority;
    if (!Object.keys(db).length) return;
    const { error } = await supabase.from("perfumes").update(db).eq("id", item.id);
    if (error) showToast(error.message);
  }

  async function updateBottle(bottleId: string, partial: Partial<Bottle>) {
    if (!item) return;
    setItem((prev) =>
      prev ? { ...prev, bottles: prev.bottles.map((b) => (b.id === bottleId ? { ...b, ...partial } : b)) } : prev,
    );
    const db: Record<string, unknown> = {};
    if (partial.bottleType !== undefined) db.bottle_type = partial.bottleType === "Bottle" ? "Full bottle" : partial.bottleType;
    if (partial.bottleSizeMl !== undefined) db.bottle_size_ml = partial.bottleSizeMl;
    if (partial.status !== undefined) db.status = partial.status;
    const { error } = await supabase.from("perfume_bottles").update(db).eq("id", bottleId);
    if (error) showToast(error.message);
  }

  async function updatePurchase(purchaseId: string, partial: Partial<Purchase>) {
    setPurchases((prev) => prev.map((p) => (p.id === purchaseId ? { ...p, ...partial } : p)));
    const db: Record<string, unknown> = {};
    if (partial.date !== undefined) db.date = partial.date;
    if (partial.ml !== undefined) db.ml = partial.ml;
    if (partial.price !== undefined) db.price = partial.price;
    if (partial.shopName !== undefined) db.shop_name = partial.shopName;
    if (partial.shopLink !== undefined) db.shop_link = partial.shopLink || null;
    const { error } = await supabase.from("perfume_purchases").update(db).eq("id", purchaseId);
    if (error) showToast(error.message);
  }

  async function removeBottle(bottleId: string, purchaseId?: string) {
    if (purchaseId) {
      const { error: pe } = await supabase.from("perfume_purchases").delete().eq("id", purchaseId);
      if (pe) {
        showToast(pe.message);
        return;
      }
      setPurchases((prev) => prev.filter((p) => p.id !== purchaseId));
    }
    const { error } = await supabase.from("perfume_bottles").delete().eq("id", bottleId);
    if (error) {
      showToast(error.message);
      return;
    }
    setItem((prev) => (prev ? { ...prev, bottles: prev.bottles.filter((b) => b.id !== bottleId) } : prev));
    setRemoveTarget(null);
    showToast("Bottle removed");
  }

  async function confirmArchiveBottle() {
    if (!archiveTarget) return;
    const { error } = await supabase
      .from("perfume_bottles")
      .update({
        status: "Archive",
        archive_reason: archiveReason,
        archive_comment: archiveComment.trim() || null,
        archived_at: nowDubai(),
      })
      .eq("id", archiveTarget.bottleId);
    if (error) {
      showToast(error.message);
      return;
    }
    setItem((prev) =>
      prev ? { ...prev, bottles: prev.bottles.map((b) => (b.id === archiveTarget.bottleId ? { ...b, status: "Archive" } : b)) } : prev,
    );
    setArchiveTarget(null);
    setArchiveComment("");
    showToast(`Bottle archived as ${archiveReason}`);
  }

  async function restoreBottleToWardrobe() {
    if (!restoreTarget) return;
    const { error } = await supabase
      .from("perfume_bottles")
      .update({
        status: "Wardrobe",
        archive_reason: null,
        archive_comment: null,
        archived_at: null,
        resale_price_aed: null,
      })
      .eq("id", restoreTarget.bottleId);
    if (error) {
      showToast(error.message);
      return;
    }
    setItem((prev) =>
      prev ? { ...prev, bottles: prev.bottles.map((b) => (b.id === restoreTarget.bottleId ? { ...b, status: "Wardrobe" } : b)) } : prev,
    );
    setRestoreTarget(null);
    showToast("Bottle moved to wardrobe");
  }

  async function uploadPhoto(file: File) {
    if (!userId || !item) return;
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${userId}/${item.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("aromatica").upload(path, file, { upsert: true });
    if (error) {
      showToast(error.message);
      return;
    }
    const { data } = supabase.storage.from("aromatica").getPublicUrl(path);
    await update({ imageUrl: data.publicUrl });
    setShowPhoto(false);
    setPhotoPreviewUrl("");
    showToast("Photo updated");
  }

  async function copyToClipboard() {
    if (!item) return;
    const text = `${item.brand} — ${item.model}\n⭐ ${item.ratingStars?.toFixed(1) ?? "n/a"}/5\n🌿 ${item.notesTags.join(", ") || "—"}\n🌦 ${item.weatherTags.join(", ") || "—"}\n💨 ${item.sillage} · ⏱ ${item.longevity}\n🏷 ${item.cloneSimilar || "—"}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard");
    } catch {
      showToast("Clipboard blocked");
    }
  }

  async function addBottle() {
    if (!userId || !item) return;
    const price = parseFloat(newBottle.price) || 0;
    if (price <= 0) {
      showToast("Bottle price in AED is required");
      return;
    }
    const size = parseFloat(newBottle.sizeMl) || 100;
    const parsedShop = parseShopCombined(newBottle.shopCombined);
    const { data: bd, error: bottleErr } = await supabase
      .from("perfume_bottles")
      .insert({
        perfume_id: item.id,
        user_id: userId,
        bottle_size_ml: size,
        bottle_type: newBottle.bottleType === "Bottle" ? "Full bottle" : newBottle.bottleType,
        status: "Wardrobe",
      })
      .select("*")
      .single();
    if (bottleErr || !bd) {
      showToast(bottleErr?.message || "Bottle save failed");
      return;
    }
    const { data: pur, error: purErr } = await supabase
      .from("perfume_purchases")
      .insert({
        perfume_id: item.id,
        bottle_id: bd.id,
        user_id: userId,
        date: newBottle.date,
        ml: size,
        price,
        currency: "AED",
        shop_name: parsedShop.shopName,
        shop_link: parsedShop.shopLink,
      })
      .select("*")
      .single();
    if (purErr || !pur) {
      await supabase.from("perfume_bottles").delete().eq("id", bd.id);
      showToast(purErr?.message || "Purchase save failed");
      return;
    }
    setPurchases((p) => [
      {
        id: pur.id,
        bottleId: pur.bottle_id,
        date: pur.date,
        ml: pur.ml,
        price: pur.price,
        shopName: pur.shop_name,
        shopLink: pur.shop_link ?? undefined,
      },
      ...p,
    ]);
    setItem((prev) =>
      prev
        ? {
            ...prev,
            bottles: [
              ...prev.bottles,
              {
                id: bd.id,
                bottleSizeMl: bd.bottle_size_ml,
                bottleType: bd.bottle_type === "Full bottle" ? "Bottle" : bd.bottle_type,
                status: bd.status === "In collection" ? "Wardrobe" : bd.status,
              },
            ],
          }
        : prev,
    );
    setShowAddBottle(false);
    setNewBottle({ bottleType: "Bottle", sizeMl: "100", price: "", date: nowDubai().slice(0, 10), shopCombined: "" });
    showToast("Bottle and purchase added");
  }

  async function copyToWishlist() {
    if (!item || !userId) return;
    const existing = catalog.find(
      (p) => p.status === "wishlist" && normalizeName(p.brand) === normalizeName(item.brand) && normalizeName(p.model) === normalizeName(item.model),
    );
    if (existing) {
      showToast("Wishlist entry already exists");
      router.push(`/dashboard/perfumes/${existing.id}`);
      return;
    }
    const { data, error } = await supabase
      .from("perfumes")
      .insert({
        user_id: userId,
        brand: item.brand,
        model: item.model,
        status: "wishlist",
        image_url: item.imageUrl,
        rating_stars: item.ratingStars,
        notes_tags: item.notesTags,
        weather_tags: item.weatherTags,
        gender_scale: item.genderScale,
        longevity: item.longevity,
        sillage: item.sillage,
        value_rating: item.value,
        usage_type: item.occasionTags.join(", "),
        clone_similar: item.cloneSimilar,
        purchase_priority: item.purchasePriority ?? "Medium",
      })
      .select("*")
      .single();
    if (error || !data) {
      showToast(error?.message || "Failed to copy");
      return;
    }
    showToast("Added to wishlist ✓");
    router.push(`/dashboard/perfumes/${data.id}`);
  }

  const priceStats = useMemo(() => {
    if (!purchases.length) return null;
    const totalSpent = purchases.reduce((s, p) => s + p.price, 0);
    const totalMl = purchases.reduce((s, p) => s + (p.ml || 0), 0);
    const price100ml = totalMl > 0 ? (totalSpent / totalMl) * 100 : 0;
    return { totalSpent, price100ml, purchaseCount: purchases.length };
  }, [purchases]);

  const sameBrandItems = useMemo(() => (item ? catalog.filter((x) => x.brand === item.brand) : []), [catalog, item]);

  const V = {
    bg: isDark ? "#0d0f14" : "#f9f8f5",
    card: isDark ? "#16191f" : "#ffffff",
    border: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
    text: isDark ? "#f0ede8" : "#1a1a1a",
    muted: isDark ? "#9ba3b2" : "#6b7280",
    faint: isDark ? "#5c6375" : "#9ca3af",
    inputBg: isDark ? "#1e2130" : "#f9fafb",
    accent: "#F5A623",
  };

  if (loading) {
    return <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", background: V.bg, color: V.text }}>Loading…</div>;
  }

  if (!item) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", background: V.bg, color: V.text }}>
        <Link href="/dashboard/perfumes">Back to Aromatica</Link>
      </div>
    );
  }

  const sectionStyle = {
    background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
    border: `1px solid ${V.border}`,
    borderRadius: 12,
    padding: "16px 18px",
    marginBottom: 14,
  };
  const labelStyle = {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: V.faint,
    marginBottom: 6,
    display: "block",
  };
  const valueStyle = { fontSize: 14, fontWeight: 600, color: V.text };
  const inputStyle = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 8,
    border: `1px solid ${V.border}`,
    background: V.inputBg,
    color: V.text,
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box" as const,
  };
  const btnStyle = {
    padding: "8px 16px",
    borderRadius: 10,
    border: `1px solid ${V.border}`,
    background: V.card,
    color: V.text,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  };
  const primaryBtnStyle = { ...btnStyle, background: V.accent, border: "none", color: "#fff", fontWeight: 700 };
  const dangerBtnStyle = { ...btnStyle, borderColor: "rgba(239,68,68,0.4)", color: "#ef4444" };

  function bottlePurchaseFor(id: string) {
    return purchases.find((p) => p.bottleId === id);
  }

  function openBottleEdit(bottle: Bottle) {
    const purchase = bottlePurchaseFor(bottle.id);
    setBottleDrafts((prev) => ({
      ...prev,
      [bottle.id]: {
        bottleType: bottle.bottleType,
        sizeMl: String(bottle.bottleSizeMl ?? 0),
        price: String(purchase?.price ?? ""),
        date: purchase?.date ?? nowDubai().slice(0, 10),
        shopCombined: joinShop(purchase?.shopName, purchase?.shopLink),
      },
    }));
    setEditingBottleId(bottle.id);
  }

  async function saveBottleEdit(bottle: Bottle) {
    const draft = bottleDrafts[bottle.id];
    if (!draft) return;
    const purchase = bottlePurchaseFor(bottle.id);
    const size = safeNum(draft.sizeMl, bottle.bottleSizeMl);
    const price = safeNum(draft.price, purchase?.price ?? 0);
    const parsedShop = parseShopCombined(draft.shopCombined);
    await updateBottle(bottle.id, { bottleType: draft.bottleType, bottleSizeMl: size });
    if (purchase) {
      await updatePurchase(purchase.id, {
        ml: size,
        price,
        date: draft.date,
        shopName: parsedShop.shopName,
        shopLink: parsedShop.shopLink ?? undefined,
      });
    }
    setEditingBottleId(null);
    showToast("Bottle updated");
  }

  function toggleOccasion(label: string) {
    if (!item) return;
    const current = item.occasionTags ?? [];
    const next = current.includes(label)
      ? current.filter((x) => x !== label)
      : [...current, label];
    update({ occasionTags: next });
  }

  return (
    <div style={{ background: V.bg, minHeight: "100vh", color: V.text, fontFamily: "system-ui,sans-serif" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: isDark ? "rgba(13,15,20,0.9)" : "rgba(249,248,245,0.9)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${V.border}`,
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Link href="/dashboard/perfumes" style={{ color: V.muted, textDecoration: "none", fontWeight: 700 }}>
          ← Aromatica
        </Link>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btnStyle} onClick={copyToClipboard}>Share</button>
          {item.status !== "wishlist" && <button style={btnStyle} onClick={copyToWishlist}>+ Wishlist</button>}
          <button style={isEdit ? primaryBtnStyle : btnStyle} onClick={() => setIsEdit((v) => !v)}>{isEdit ? "✓ Done" : "Edit"}</button>
        </div>
      </div>

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "28px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24, marginBottom: 28, alignItems: "start" }}>
          <div>
            {item.imageUrl ? (
              <img src={item.imageUrl} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 16, border: `1px solid ${V.border}` }} />
            ) : (
              <div style={{ width: "100%", aspectRatio: "1", borderRadius: 16, background: V.inputBg, display: "grid", placeItems: "center", fontSize: 64, border: `1px solid ${V.border}` }}>🌸</div>
            )}
            <button
              style={{ ...btnStyle, width: "100%", marginTop: 10 }}
              onClick={() => {
                setPhotoInput(item.imageUrl || "");
                setPhotoPreviewUrl(isProbablyImageUrl(item.imageUrl || "") ? item.imageUrl : "");
                setPhotoMode("url");
                setShowPhoto(true);
              }}
            >
              📷 Change photo
            </button>
          </div>
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <button onClick={() => setBrandView(true)} style={{ background: V.inputBg, color: V.faint, border: "none", padding: "4px 10px", borderRadius: 999, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}>{item.brand}</button>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: item.status === "wardrobe" ? "rgba(245,166,35,0.12)" : item.status === "wishlist" ? "rgba(99,102,241,0.1)" : "rgba(107,114,128,0.1)", color: item.status === "wardrobe" ? "#d97706" : item.status === "wishlist" ? "#6366f1" : "#6b7280" }}>{item.status}</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 12px" }}>{item.model}</h1>
            <div style={{ marginBottom: 16 }}><Stars value={item.ratingStars} size={20} /></div>
            {isEdit && (
              <div style={{ marginBottom: 16 }}>
                <span style={labelStyle}>Rating</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} onClick={() => update({ ratingStars: s })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, color: s <= (item.ratingStars ?? 0) ? "#F5A623" : V.border }}>
                      ★
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
              {priceStats && priceStats.totalSpent > 0 && <div style={{ background: V.inputBg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${V.border}` }}><span style={labelStyle}>Total spent</span><span style={{ fontSize: 13, fontWeight: 700 }}>{fmtMoney(priceStats.totalSpent)}</span></div>}
              {priceStats && priceStats.price100ml > 0 && <div style={{ background: V.inputBg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${V.border}` }}><span style={labelStyle}>Per 100ml</span><span style={{ fontSize: 13, fontWeight: 700, color: "#F5A623" }}>AED {priceStats.price100ml.toFixed(0)}</span></div>}
              <div style={{ background: V.inputBg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${V.border}` }}><span style={labelStyle}>Longevity</span>{isEdit ? <select style={inputStyle} value={item.longevity} onChange={(e) => update({ longevity: e.target.value })}>{LONGEVITY_OPTIONS.map((opt) => <option key={opt}>{opt}</option>)}</select> : <span style={valueStyle}>{item.longevity || "—"}</span>}</div>
              <div style={{ background: V.inputBg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${V.border}` }}><span style={labelStyle}>Projection</span>{isEdit ? <select style={inputStyle} value={item.sillage} onChange={(e) => update({ sillage: e.target.value })}>{PROJECTION_OPTIONS.map((opt) => <option key={opt}>{opt}</option>)}</select> : <span style={valueStyle}>{item.sillage || "—"}</span>}</div>
              <div style={{ background: V.inputBg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${V.border}` }}><span style={labelStyle}>Gender</span>{isEdit ? <select style={inputStyle} value={String(item.genderScale)} onChange={(e) => update({ genderScale: Number(e.target.value) as GenderScale })}>{[0,1,2,3,4].map((n) => <option key={n} value={n}>{genderLabel(n as GenderScale)}</option>)}</select> : <span style={valueStyle}>{genderLabel(item.genderScale)}</span>}</div>
              <div style={{ background: V.inputBg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${V.border}` }}><span style={labelStyle}>Performance</span>{isEdit ? <select style={inputStyle} value={item.value} onChange={(e) => update({ value: e.target.value as Perfume["value"] })}>{PERFORMANCE_OPTIONS.map((opt) => <option key={opt}>{opt}</option>)}</select> : <span style={valueStyle}>{item.value || "—"}</span>}</div>
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>Attributes</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <div><span style={labelStyle}>Occasion</span>{isEdit ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{OCCASION_OPTIONS.map((opt) => <button key={opt} onClick={() => toggleOccasion(opt)} style={{ padding: "8px 10px", borderRadius: 10, border: "none", cursor: "pointer", background: item.occasionTags.includes(opt) ? V.accent : V.inputBg, color: item.occasionTags.includes(opt) ? "#fff" : V.text, fontSize: 12, fontWeight: 700 }}>{opt}</button>)}</div> : <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{item.occasionTags.length ? item.occasionTags.map((o) => <span key={o} style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(245,166,35,0.12)", color: "#d97706", fontSize: 12, fontWeight: 700 }}>{o}</span>) : <span style={valueStyle}>—</span>}</div>}</div>
            <div><span style={labelStyle}>Similar / clone</span>{isEdit ? <input style={inputStyle} value={item.cloneSimilar} onChange={(e) => update({ cloneSimilar: e.target.value })} placeholder="Manual entry only" /> : <div style={valueStyle}>{item.cloneSimilar || "—"}</div>}</div>
            {item.status === "wishlist" && <div><span style={labelStyle}>Wishlist priority</span>{isEdit ? <select style={inputStyle} value={item.purchasePriority || "Medium"} onChange={(e) => update({ purchasePriority: e.target.value })}><option>Low</option><option>Medium</option><option>High</option><option>Must buy</option></select> : <div style={valueStyle}>{item.purchasePriority || "Medium"}</div>}</div>}
          </div>

          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>Note tags</div>
                <button style={btnStyle} onClick={() => setNoteManager(true)}>Manage</button>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {item.notesTags.length ? item.notesTags.map((n) => <Tag key={n} label={n} />) : <span style={valueStyle}>—</span>}
              </div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>Weather</div>
                <button style={btnStyle} onClick={() => setWeatherManager(true)}>Manage</button>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {item.weatherTags.length ? item.weatherTags.map((w) => <Tag key={w} label={w} />) : <span style={valueStyle}>—</span>}
              </div>
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Wear log</div>
              <div style={{ fontSize: 12, color: V.muted }}>Your actual usage history. Far more useful than pretending memory is enough.</div>
            </div>
            <button style={primaryBtnStyle} onClick={() => setShowWearModal(true)}>+ Log a wear</button>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {wearLogs.slice(0, 8).map((w) => (
              <div key={w.id} style={{ border: `1px solid ${V.border}`, borderRadius: 12, padding: 12, background: V.inputBg }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{w.wornOn}</div>
                  <div style={{ fontSize: 12, color: V.muted }}>{w.sprays} sprays · {w.weatherTag || "—"} · {w.performance || "—"}</div>
                </div>
                <div style={{ fontSize: 12, color: V.muted, marginTop: 4 }}>{w.occasion || "No occasion"}{w.compliment ? " · Compliment" : ""}</div>
              </div>
            ))}
            {!wearLogs.length && <div style={{ fontSize: 13, color: V.muted }}>No wear logs yet.</div>}
          </div>


      
        <div style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Bottle & purchase</div>
              <div style={{ fontSize: 12, color: V.muted }}>Read only by default. Edit a bottle only when you actually want to change something, because chaos is not a workflow.</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {editingBottleId && <button style={btnStyle} onClick={() => setEditingBottleId(null)}>Stop editing</button>}
              <button style={primaryBtnStyle} onClick={() => setShowAddBottle(true)}>+ Add bottle</button>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {item.bottles.length === 0 && <div style={{ fontSize: 13, color: V.muted }}>No bottles added yet.</div>}
            {item.bottles.map((bottle) => {
              const purchase = bottlePurchaseFor(bottle.id);
              const draft = bottleDrafts[bottle.id];
              const editing = editingBottleId === bottle.id && !!draft;
              return (
                <div key={bottle.id} style={{ border: `1px solid ${V.border}`, borderRadius: 12, padding: 14, background: V.inputBg }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, padding: "4px 10px", borderRadius: 999, background: bottle.status === "Wardrobe" ? "rgba(245,166,35,0.12)" : "rgba(107,114,128,0.12)", color: bottle.status === "Wardrobe" ? "#d97706" : "#6b7280" }}>{bottle.status}</span>
                        {!editing ? (
                          <span style={{ fontSize: 14, fontWeight: 700 }}>{bottle.bottleType} · {bottle.bottleSizeMl} ml</span>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%", maxWidth: 380 }}>
                            <select style={inputStyle} value={draft.bottleType} onChange={(e) => setBottleDrafts((prev) => ({ ...prev, [bottle.id]: { ...prev[bottle.id], bottleType: e.target.value as BottleType } }))}>
                              <option>Bottle</option>
                              <option>Decant</option>
                              <option>Sample</option>
                            </select>
                            <input style={inputStyle} value={draft.sizeMl} onChange={(e) => setBottleDrafts((prev) => ({ ...prev, [bottle.id]: { ...prev[bottle.id], sizeMl: e.target.value } }))} placeholder="Size in ml" />
                          </div>
                        )}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
                        <div><span style={labelStyle}>Price</span>{editing ? <input style={inputStyle} type="number" value={draft.price} onChange={(e) => setBottleDrafts((prev) => ({ ...prev, [bottle.id]: { ...prev[bottle.id], price: e.target.value } }))} /> : <div style={valueStyle}>{purchase ? fmtMoney(purchase.price) : "—"}</div>}</div>
                        <div><span style={labelStyle}>Purchase date</span>{editing ? <input style={inputStyle} type="date" value={draft.date} onChange={(e) => setBottleDrafts((prev) => ({ ...prev, [bottle.id]: { ...prev[bottle.id], date: e.target.value } }))} /> : <div style={valueStyle}>{purchase?.date || "—"}</div>}</div>
                        <div style={{ gridColumn: "1/-1" }}><span style={labelStyle}>Shop / link</span>{editing ? <input style={inputStyle} value={draft.shopCombined} onChange={(e) => setBottleDrafts((prev) => ({ ...prev, [bottle.id]: { ...prev[bottle.id], shopCombined: e.target.value } }))} placeholder="Shop name | https://link" /> : <div style={valueStyle}>{purchase?.shopLink ? <a href={purchase.shopLink} target="_blank" rel="noreferrer" style={{ color: V.text }}>{joinShop(purchase.shopName, purchase.shopLink)}</a> : (purchase ? joinShop(purchase.shopName, purchase.shopLink) : "—")}</div>}</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 8, minWidth: 128 }}>
                      {!editing ? (
                        <button style={btnStyle} onClick={() => openBottleEdit(bottle)}>Edit</button>
                      ) : (
                        <>
                          <button style={primaryBtnStyle} onClick={() => saveBottleEdit(bottle)}>Save</button>
                          <button style={btnStyle} onClick={() => setEditingBottleId(null)}>Cancel</button>
                        </>
                      )}
                      {bottle.status === "Wardrobe" ? (
                        <button style={btnStyle} onClick={() => { setArchiveTarget({ bottleId: bottle.id, purchaseId: purchase?.id }); setArchiveReason("emptied"); setArchiveComment(""); }}>Archive</button>
                      ) : (
                        <button style={btnStyle} onClick={() => setRestoreTarget({ bottleId: bottle.id })}>Wardrobe</button>
                      )}
                      <button style={dangerBtnStyle} onClick={() => setRemoveTarget({ bottleId: bottle.id, purchaseId: purchase?.id })}>Remove</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        </div>
      </div>

      {noteManager && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, padding: 22, width: "min(500px,100%)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>Manage note tags</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={inputStyle} value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="New tag…" />
              <button style={primaryBtnStyle} onClick={() => { const v = noteInput.trim(); if (v && !globalNotes.includes(v)) { setGlobalNotes((p) => [...p, v].sort()); setNoteInput(""); showToast("Tag added"); } }}>Add</button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}><button style={primaryBtnStyle} onClick={() => setNoteManager(false)}>Done</button></div>
          </div>
        </div>
      )}

      {weatherManager && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, padding: 22, width: "min(400px,100%)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>Weather</div>
            <div style={{ display: "flex", gap: 10 }}>{(["Cold", "Neutral", "Hot"] as const).map((w) => <button key={w} onClick={() => update({ weatherTags: item.weatherTags.includes(w) ? item.weatherTags.filter((x) => x !== w) : [...item.weatherTags, w] as ("Cold"|"Neutral"|"Hot")[] })} style={{ flex: 1, padding: "10px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none", background: item.weatherTags.includes(w) ? V.accent : V.inputBg, color: item.weatherTags.includes(w) ? "#fff" : V.text }}>{w}</button>)}</div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}><button style={primaryBtnStyle} onClick={() => setWeatherManager(false)}>Done</button></div>
          </div>
        </div>
      )}

      {showPhoto && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, padding: 22, width: "min(520px,100%)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>Change photo</div>
            <div style={{ display: "flex", gap: 0, marginBottom: 14, borderRadius: 10, overflow: "hidden", border: `1px solid ${V.border}` }}>
              {(["upload", "url"] as const).map((m) => (
                <button key={m} onClick={() => setPhotoMode(m)} style={{ flex: 1, padding: "9px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none", background: photoMode === m ? V.accent : V.inputBg, color: photoMode === m ? "#fff" : V.muted }}>
                  {m === "upload" ? "📱 Upload" : "🔗 URL"}
                </button>
              ))}
            </div>
            {photoMode === "upload" ? (
              <div>
                <input type="file" accept="image/*" style={{ fontSize: 13, color: V.muted, width: "100%" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}><button style={btnStyle} onClick={() => setShowPhoto(false)}>Cancel</button></div>
              </div>
            ) : (
              <div>
                <span style={labelStyle}>Direct image URL</span>
                <input style={inputStyle} value={photoInput} onChange={(e) => { const v = e.target.value; setPhotoInput(v); setPhotoPreviewUrl(isProbablyImageUrl(v) ? v : ""); }} placeholder="Direct image URL" />
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button style={btnStyle} onClick={() => { if (isProbablyImageUrl(photoInput.trim())) { setPhotoPreviewUrl(photoInput.trim()); } else { setPhotoPreviewUrl(""); showToast("Paste a direct image URL to preview it"); } }}>Preview</button>
                </div>
                {photoPreviewUrl && <div style={{ marginTop: 12 }}><img src={photoPreviewUrl} alt="Preview" style={{ width: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 12, border: `1px solid ${V.border}`, background: V.inputBg }} /></div>}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                  <button style={btnStyle} onClick={() => { setPhotoPreviewUrl(""); setShowPhoto(false); }}>Cancel</button>
                  <button style={primaryBtnStyle} disabled={!photoPreviewUrl} onClick={async () => { await update({ imageUrl: photoPreviewUrl.trim() }); setShowPhoto(false); setPhotoPreviewUrl(""); showToast("Photo updated"); }}>Save</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showAddBottle && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 16, width: "min(620px,100%)" }}>
            <div style={{ padding: "18px 20px", borderBottom: `1px solid ${V.border}` }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Add bottle</div>
              <div style={{ fontSize: 12, color: V.muted }}>One purchase creates one bottle. Sensible data modeling, rare but beautiful.</div>
            </div>
            <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label><span style={labelStyle}>Bottle type</span><select style={inputStyle} value={newBottle.bottleType} onChange={(e) => setNewBottle((p) => ({ ...p, bottleType: e.target.value as BottleType }))}><option>Bottle</option><option>Decant</option><option>Sample</option></select></label>
              <label><span style={labelStyle}>Size (ml)</span><input style={inputStyle} value={newBottle.sizeMl} onChange={(e) => setNewBottle((p) => ({ ...p, sizeMl: e.target.value }))} /></label>
              <label><span style={labelStyle}>Bottle price (AED)</span><input style={inputStyle} type="number" value={newBottle.price} onChange={(e) => setNewBottle((p) => ({ ...p, price: e.target.value }))} placeholder="0" /></label>
              <label><span style={labelStyle}>Purchase date</span><input style={inputStyle} type="date" value={newBottle.date} onChange={(e) => setNewBottle((p) => ({ ...p, date: e.target.value }))} /></label>
              <label style={{ gridColumn: "1/-1" }}><span style={labelStyle}>Shop / link</span><input style={inputStyle} value={newBottle.shopCombined} onChange={(e) => setNewBottle((p) => ({ ...p, shopCombined: e.target.value }))} placeholder="Shop name | https://link" /></label>
            </div>
            <div style={{ padding: "0 20px 20px", display: "flex", justifyContent: "flex-end", gap: 8 }}><button style={btnStyle} onClick={() => setShowAddBottle(false)}>Cancel</button><button style={primaryBtnStyle} onClick={addBottle}>Add</button></div>
          </div>
        </div>
      )}

      {showWearModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 18, padding: 20, width: "min(520px,100%)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Log a wear</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label><span style={labelStyle}>Date</span><input style={inputStyle} type="date" value={wearForm.wornOn} onChange={(e) => setWearForm((f) => ({ ...f, wornOn: e.target.value }))} /></label>
              <label><span style={labelStyle}>Occasion</span><select style={inputStyle} value={wearForm.occasion} onChange={(e) => setWearForm((f) => ({ ...f, occasion: e.target.value }))}>{OCCASION_OPTIONS.map((opt) => <option key={opt}>{opt}</option>)}</select></label>
              <label><span style={labelStyle}>Sprays</span><input style={inputStyle} value={wearForm.sprays} onChange={(e) => setWearForm((f) => ({ ...f, sprays: e.target.value }))} /></label>
              <label><span style={labelStyle}>Weather</span><select style={inputStyle} value={wearForm.weatherTag} onChange={(e) => setWearForm((f) => ({ ...f, weatherTag: e.target.value }))}>{WEATHER_OPTIONS.map((opt) => <option key={opt}>{opt}</option>)}</select></label>
              <label style={{ gridColumn: "1/-1" }}><span style={labelStyle}>Performance</span><select style={inputStyle} value={wearForm.performance} onChange={(e) => setWearForm((f) => ({ ...f, performance: e.target.value }))}>{WEAR_PERFORMANCE_OPTIONS.map((opt) => <option key={opt}>{opt}</option>)}</select></label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, gridColumn: "1/-1", fontSize: 13 }}><input type="checkbox" checked={wearForm.compliment} onChange={(e) => setWearForm((f) => ({ ...f, compliment: e.target.checked }))} /> Got a compliment</label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button style={btnStyle} onClick={() => setShowWearModal(false)}>Cancel</button>
              <button style={primaryBtnStyle} onClick={async () => {
                if (!userId || !item) return;
                const { data, error } = await supabase.from("perfume_wear_logs").insert({ user_id: userId, perfume_id: item.id, worn_on: wearForm.wornOn, occasion: wearForm.occasion || null, sprays: safeNum(wearForm.sprays, 0), weather_tag: wearForm.weatherTag || null, compliment: wearForm.compliment, performance: wearForm.performance || null }).select("*").single();
                if (error || !data) { showToast(error?.message || "Wear log failed"); return; }
                setWearLogs((prev) => [{ id: data.id, wornOn: data.worn_on, occasion: data.occasion ?? "", sprays: data.sprays ?? 0, weatherTag: data.weather_tag ?? "", compliment: !!data.compliment, performance: data.performance ?? "" }, ...prev]);
                setShowWearModal(false);
                showToast("Wear logged");
              }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {archiveTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 110, display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 18, padding: 20, width: "min(520px,100%)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Archive bottle</div>
            <div style={{ display: "grid", gap: 12 }}>
              <label><span style={labelStyle}>Reason</span><select style={inputStyle} value={archiveReason} onChange={(e) => setArchiveReason(e.target.value as ArchiveReason)}><option value="sold">Sold</option><option value="emptied">Emptied</option><option value="gifted">Gifted</option></select></label>
              <label><span style={labelStyle}>Comment</span><textarea style={{ ...inputStyle, minHeight: 90, resize: "vertical" as const }} value={archiveComment} onChange={(e) => setArchiveComment(e.target.value)} placeholder="Optional comment" /></label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}><button style={btnStyle} onClick={() => setArchiveTarget(null)}>Cancel</button><button style={primaryBtnStyle} onClick={confirmArchiveBottle}>Save</button></div>
          </div>
        </div>
      )}

      {removeTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 110, display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 18, padding: 20, width: "min(460px,100%)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Remove bottle?</div>
            <div style={{ fontSize: 13, color: V.muted, marginBottom: 14 }}>This removes the bottle and its purchase record. No browser pop-up nonsense this time.</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button style={btnStyle} onClick={() => setRemoveTarget(null)}>Cancel</button><button style={dangerBtnStyle} onClick={() => removeBottle(removeTarget.bottleId, removeTarget.purchaseId)}>Remove</button></div>
          </div>
        </div>
      )}

      {restoreTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 110, display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ background: V.card, border: `1px solid ${V.border}`, borderRadius: 18, padding: 20, width: "min(460px,100%)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Move bottle to wardrobe?</div>
            <div style={{ fontSize: 13, color: V.muted, marginBottom: 14 }}>This will restore the bottle to wardrobe and clear its archive metadata.</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button style={btnStyle} onClick={() => setRestoreTarget(null)}>Cancel</button><button style={primaryBtnStyle} onClick={restoreBottleToWardrobe}>Confirm</button></div>
          </div>
        </div>
      )}

      {brandView && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 120, display: "grid", placeItems: "center", padding: 16 }} onClick={() => setBrandView(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(720px,100%)", background: V.card, border: `1px solid ${V.border}`, borderRadius: 18, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><div><div style={{ fontSize: 20, fontWeight: 800 }}>{item.brand}</div><div style={{ fontSize: 12, color: V.muted }}>Brand page with your lineup and priorities.</div></div><button style={btnStyle} onClick={() => setBrandView(false)}>Close</button></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>{sameBrandItems.map((s) => <button key={s.id} onClick={() => router.push(`/dashboard/perfumes/${s.id}`)} style={{ textAlign: "left", border: `1px solid ${V.border}`, background: V.inputBg, borderRadius: 12, padding: 12, cursor: "pointer" }}><div style={{ fontSize: 14, fontWeight: 800 }}>{s.model}</div><div style={{ fontSize: 12, color: V.muted }}>{s.status}{s.status === "wishlist" ? ` · ${s.purchasePriority || "Medium"}` : ""}</div></button>)}</div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "fixed", bottom: 20, right: 16, background: isDark ? "#1a3a2a" : "#f0fdf4", color: "#16a34a", border: "1px solid rgba(22,163,74,0.3)", padding: "12px 18px", borderRadius: 12, fontSize: 13, fontWeight: 700, zIndex: 200 }}>{toast}</div>}
    </div>
  );
}
