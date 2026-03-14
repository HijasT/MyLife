"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();
      setDisplayName(data?.display_name ?? "");
      setLoading(false);
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() })
      .eq("id", user.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl mb-1" style={{ color: "var(--text-primary)" }}>
          Settings
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Manage your account preferences
        </p>
      </div>

      {/* Profile section */}
      <div className="rounded-2xl border overflow-hidden mb-6"
        style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: "var(--card-border)" }}>
          <h2 className="text-sm font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
            Profile
          </h2>
        </div>

        <div className="px-6 py-6 flex flex-col gap-5">
          {/* Display name */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Display name
            </label>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              This is how you'll be greeted on the dashboard. E.g. "Hijas"
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                placeholder="Enter your name"
                className="flex-1 px-4 py-3 rounded-xl text-sm outline-none transition-colors"
                style={{
                  background: "var(--main-bg2)",
                  border: "1px solid var(--card-border)",
                  color: "var(--text-primary)",
                }}
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-3 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-amber-500 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
              </button>
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Email
            </label>
            <div
              className="px-4 py-3 rounded-xl text-sm"
              style={{
                background: "var(--main-bg2)",
                border: "1px solid var(--card-border)",
                color: "var(--text-muted)",
              }}
            >
              {email}
            </div>
          </div>
        </div>
      </div>

      {/* App info */}
      <div className="rounded-2xl border overflow-hidden mb-6"
        style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: "var(--card-border)" }}>
          <h2 className="text-sm font-bold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
            About
          </h2>
        </div>
        <div className="px-6 py-5 flex flex-col gap-3">
          {[
            { label: "App", value: "MyLife Dashboard" },
            { label: "Phase", value: "2 — Perfumes active" },
            { label: "Database", value: "Supabase PostgreSQL" },
            { label: "Hosting", value: "Vercel" },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>{row.label}</span>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sign out */}
      <div className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}>
        <div className="px-6 py-5">
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            Sign out of your account on this device.
          </p>
          <button
            onClick={handleSignOut}
            className="px-5 py-3 rounded-xl text-sm font-semibold transition-colors"
            style={{
              background: "rgba(244,63,94,0.1)",
              border: "1px solid rgba(244,63,94,0.3)",
              color: "#f43f5e",
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
