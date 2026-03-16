"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MODULES } from "@/lib/modules";

const DEFAULT_HIDDEN: string[] = [];

export default function SettingsPage() {
  const supabase = createClient();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [initialDisplayName, setInitialDisplayName] = useState("");

  const [email, setEmail] = useState("");

  const [timezone, setTimezone] = useState("UTC");
  const [initialTimezone, setInitialTimezone] = useState("UTC");

  const [hiddenModules, setHiddenModules] = useState<string[]>(DEFAULT_HIDDEN);
  const [initialHiddenModules, setInitialHiddenModules] = useState<string[]>(DEFAULT_HIDDEN);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          setError("Session expired. Please log in again.");
          setLoading(false);
          return;
        }

        setUserId(user.id);
        setEmail(user.email ?? "");

        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("display_name, hidden_modules, timezone")
          .eq("id", user.id)
          .single();

        if (profileError) {
          setError("Failed to load profile.");
        }

        const safeHidden = Array.isArray(data?.hidden_modules)
          ? data.hidden_modules
          : [];

        setDisplayName(data?.display_name ?? "");
        setInitialDisplayName(data?.display_name ?? "");

        setTimezone(data?.timezone ?? "UTC");
        setInitialTimezone(data?.timezone ?? "UTC");

        setHiddenModules(safeHidden);
        setInitialHiddenModules(safeHidden);
      } catch {
        setError("Something went wrong while loading settings.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const hasChanges = useMemo(() => {
    return (
      displayName.trim() !== initialDisplayName ||
      timezone !== initialTimezone ||
      JSON.stringify(hiddenModules.sort()) !==
        JSON.stringify(initialHiddenModules.sort())
    );
  }, [displayName, timezone, hiddenModules, initialDisplayName, initialTimezone, initialHiddenModules]);

  const handleSave = async () => {
    if (!userId) return;
    if (!hasChanges) return;

    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim(),
          hidden_modules: hiddenModules,
          timezone,
        })
        .eq("id", userId);

      if (error) {
        setError("Failed to save changes.");
        return;
      }

      // update initial states
      setInitialDisplayName(displayName.trim());
      setInitialTimezone(timezone);
      setInitialHiddenModules(hiddenModules);

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Unexpected error while saving.");
    } finally {
      setSaving(false);
    }
  };

  function toggleModule(id: string) {
    setHiddenModules((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
    );
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading)
    return <div style={{ padding: 40, textAlign: "center" }}>Loading…</div>;

  return (
    <div className="p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="font-display text-3xl mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Settings
        </h1>
        <p
          className="text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          Manage your account and app preferences
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div
          className="mb-6 px-4 py-3 rounded-xl text-sm"
          style={{
            background: "rgba(244,63,94,0.1)",
            border: "1px solid rgba(244,63,94,0.3)",
            color: "#f43f5e",
          }}
        >
          {error}
        </div>
      )}

      {/* Profile */}
      <div className="rounded-2xl border overflow-hidden mb-6" style={{ background:"var(--card-bg)", borderColor:"var(--card-border)" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor:"var(--card-border)" }}>
          <h2 className="text-sm font-bold tracking-widest uppercase" style={{ color:"var(--text-muted)" }}>Profile</h2>
        </div>

        <div className="px-6 py-6 flex flex-col gap-5">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color:"var(--text-secondary)" }}>Display name</label>

            <div className="flex gap-3">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                className="flex-1 px-4 py-3 rounded-xl text-sm outline-none"
                style={{ background:"var(--main-bg2)", border:"1px solid var(--card-border)", color:"var(--text-primary)" }}
              />

              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="px-5 py-3 rounded-xl text-sm font-semibold bg-accent text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color:"var(--text-secondary)" }}>Email</label>
            <div className="px-4 py-3 rounded-xl text-sm" style={{ background:"var(--main-bg2)", border:"1px solid var(--card-border)", color:"var(--text-muted)" }}>
              {email}
            </div>
          </div>
        </div>
      </div>

      {/* Modules */}
      <div className="rounded-2xl border overflow-hidden mb-6" style={{ background:"var(--card-bg)", borderColor:"var(--card-border)" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor:"var(--card-border)" }}>
          <h2 className="text-sm font-bold uppercase" style={{ color:"var(--text-muted)" }}>Dashboard modules</h2>
        </div>

        <div className="px-6 py-4 flex flex-col gap-3">
          {MODULES.map(m => (
            <div key={m.id} className="flex items-center justify-between">
              <span>{m.label}</span>

              <button
                onClick={() => toggleModule(m.id)}
                className="w-10 h-5 rounded-full"
                style={{
                  background: hiddenModules.includes(m.id) ? "#ccc" : "#F5A623"
                }}
              />
            </div>
          ))}

          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="mt-2 px-5 py-3 rounded-xl text-sm font-semibold bg-accent text-white disabled:opacity-50 self-end"
          >
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save visibility"}
          </button>
        </div>
      </div>

      {/* Timezone */}
      <div className="rounded-2xl border overflow-hidden mb-6" style={{ background:"var(--card-bg)", borderColor:"var(--card-border)" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor:"var(--card-border)" }}>
          <h2 className="text-sm font-bold uppercase" style={{ color:"var(--text-muted)" }}>Timezone</h2>
        </div>

        <div className="px-6 py-6">
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm"
            style={{ background:"var(--main-bg2)", border:"1px solid var(--card-border)", color:"var(--text-primary)" }}
          >
            {["UTC","Asia/Dubai","Asia/Kolkata","Europe/London"].map(tz => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>

          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="mt-3 px-5 py-3 rounded-xl text-sm font-semibold bg-accent text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save timezone"}
          </button>
        </div>
      </div>

      {/* Sign out */}
      <div className="rounded-2xl border overflow-hidden">
        <div className="px-6 py-5">
          <button
            onClick={handleSignOut}
            className="px-5 py-3 rounded-xl text-sm font-semibold"
            style={{ color:"#f43f5e" }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}