"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MODULES } from "@/lib/modules";

const DEFAULT_HIDDEN: string[] = [];

const FALLBACK_TIMEZONES = [
  "UTC",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Riyadh",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Bangkok",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
  "Australia/Melbourne",
];

type BannerState = {
  type: "success" | "error";
  message: string;
} | null;

export default function SettingsPage() {
  const supabase = await createClient();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [initialDisplayName, setInitialDisplayName] = useState("");

  const [email, setEmail] = useState("");

  const [timezone, setTimezone] = useState("UTC");
  const [initialTimezone, setInitialTimezone] = useState("UTC");

  const [hiddenModules, setHiddenModules] = useState<string[]>(DEFAULT_HIDDEN);
  const [initialHiddenModules, setInitialHiddenModules] =
    useState<string[]>(DEFAULT_HIDDEN);

  const [loading, setLoading] = useState(true);

  const [profileSaving, setProfileSaving] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [timezoneSaving, setTimezoneSaving] = useState(false);
  const [setPasswordSaving, setSetPasswordSaving] = useState(false);
  const [changePasswordSaving, setChangePasswordSaving] = useState(false);

  const [banner, setBanner] = useState<BannerState>(null);

  const [setPassword, setSetPassword] = useState("");
  const [setPasswordRepeat, setSetPasswordRepeat] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordRepeat, setNewPasswordRepeat] = useState("");

  const [timezoneSearch, setTimezoneSearch] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setBanner(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          setBanner({
            type: "error",
            message: "Session expired. Please log in again.",
          });
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
          setBanner({
            type: "error",
            message: "Failed to load profile.",
          });
        }

        const safeHidden = Array.isArray(data?.hidden_modules)
          ? data.hidden_modules
          : [];

        setDisplayName(data?.display_name ?? "");
        setInitialDisplayName(data?.display_name ?? "");

        setTimezone(data?.timezone ?? "UTC");
        setInitialTimezone(data?.timezone ?? "UTC");

        setHiddenModules(safeHidden);
        setInitialHiddenModules([...safeHidden]);
      } catch {
        setBanner({
          type: "error",
          message: "Something went wrong while loading settings.",
        });
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [supabase]);

  const timezoneOptions = useMemo(() => {
    let zones: string[] = [];

    try {
      const intlWithSupported = Intl as unknown as {
        supportedValuesOf?: (key: string) => string[];
      };

      if (typeof intlWithSupported.supportedValuesOf === "function") {
        zones = intlWithSupported.supportedValuesOf("timeZone");
      }
    } catch {
      zones = [];
    }

    const merged = [...new Set([...(zones || []), ...FALLBACK_TIMEZONES])];

    return merged
      .filter((tz) =>
        tz.toLowerCase().includes(timezoneSearch.trim().toLowerCase())
      )
      .sort((a, b) => a.localeCompare(b));
  }, [timezoneSearch]);

  const profileChanged = useMemo(() => {
    return displayName.trim() !== initialDisplayName;
  }, [displayName, initialDisplayName]);

  const timezoneChanged = useMemo(() => {
    return timezone !== initialTimezone;
  }, [timezone, initialTimezone]);

  const visibilityChanged = useMemo(() => {
    const current = [...hiddenModules].sort();
    const initial = [...initialHiddenModules].sort();
    return JSON.stringify(current) !== JSON.stringify(initial);
  }, [hiddenModules, initialHiddenModules]);

  function showBanner(type: "success" | "error", message: string) {
    setBanner({ type, message });
    window.clearTimeout((showBanner as unknown as { timer?: number }).timer);
    (showBanner as unknown as { timer?: number }).timer = window.setTimeout(() => {
      setBanner(null);
    }, 3500);
  }

  async function saveProfile() {
    if (!userId || !profileChanged) return;

    setProfileSaving(true);
    setBanner(null);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim(),
        })
        .eq("id", userId);

      if (error) {
        showBanner("error", "Failed to save display name.");
        return;
      }

      setInitialDisplayName(displayName.trim());
      showBanner("success", "Profile updated.");
    } catch {
      showBanner("error", "Unexpected error while saving profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveVisibility() {
    if (!userId || !visibilityChanged) return;

    setVisibilitySaving(true);
    setBanner(null);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          hidden_modules: hiddenModules,
        })
        .eq("id", userId);

      if (error) {
        showBanner("error", "Failed to save dashboard visibility.");
        return;
      }

      setInitialHiddenModules([...hiddenModules]);
      showBanner("success", "Dashboard module visibility updated.");
    } catch {
      showBanner("error", "Unexpected error while saving module visibility.");
    } finally {
      setVisibilitySaving(false);
    }
  }

  async function saveTimezone() {
    if (!userId || !timezoneChanged) return;

    setTimezoneSaving(true);
    setBanner(null);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          timezone,
        })
        .eq("id", userId);

      if (error) {
        showBanner("error", "Failed to save timezone.");
        return;
      }

      setInitialTimezone(timezone);
      showBanner("success", "Timezone updated.");
    } catch {
      showBanner("error", "Unexpected error while saving timezone.");
    } finally {
      setTimezoneSaving(false);
    }
  }

  function validatePasswordFields(password: string, repeat: string) {
    if (!password || !repeat) return "Please fill all password fields.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== repeat) return "Passwords do not match.";
    return null;
  }

  async function handleSetPassword() {
    const validationError = validatePasswordFields(
      setPassword,
      setPasswordRepeat
    );

    if (validationError) {
      showBanner("error", validationError);
      return;
    }

    setSetPasswordSaving(true);
    setBanner(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: setPassword,
      });

      if (error) {
        showBanner(
          "error",
          error.message || "Failed to add password login."
        );
        return;
      }

      setSetPassword("");
      setSetPasswordRepeat("");
      showBanner(
        "success",
        "Password login added. You can now log in with email and password too."
      );
    } catch {
      showBanner("error", "Unexpected error while setting password.");
    } finally {
      setSetPasswordSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!email) {
      showBanner("error", "Missing account email.");
      return;
    }

    if (!currentPassword) {
      showBanner("error", "Please enter your current password.");
      return;
    }

    const validationError = validatePasswordFields(
      newPassword,
      newPasswordRepeat
    );

    if (validationError) {
      showBanner("error", validationError);
      return;
    }

    if (currentPassword === newPassword) {
      showBanner("error", "New password must be different from current password.");
      return;
    }

    setChangePasswordSaving(true);
    setBanner(null);

    try {
      const verify = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });

      if (verify.error) {
        showBanner("error", "Current password is incorrect.");
        return;
      }

      const update = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (update.error) {
        showBanner(
          "error",
          update.error.message || "Failed to change password."
        );
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordRepeat("");

      showBanner("success", "Password changed successfully.");
    } catch {
      showBanner("error", "Unexpected error while changing password.");
    } finally {
      setChangePasswordSaving(false);
    }
  }

  function toggleModule(id: string) {
    setHiddenModules((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const sectionStyle = {
    background: "var(--card-bg)",
    borderColor: "var(--card-border)",
  } as const;

  const inputStyle = {
    background: "var(--main-bg2)",
    border: "1px solid var(--card-border)",
    color: "var(--text-primary)",
  } as const;

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading…</div>;
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1
          className="font-display text-3xl mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Settings
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Manage your account and app preferences
        </p>
      </div>

      {banner && (
        <div
          className="mb-6 px-4 py-3 rounded-xl text-sm"
          style={{
            background:
              banner.type === "error"
                ? "rgba(244,63,94,0.1)"
                : "rgba(34,197,94,0.1)",
            border:
              banner.type === "error"
                ? "1px solid rgba(244,63,94,0.3)"
                : "1px solid rgba(34,197,94,0.3)",
            color: banner.type === "error" ? "#f43f5e" : "#22c55e",
          }}
        >
          {banner.message}
        </div>
      )}

      <div
        className="rounded-2xl border overflow-hidden mb-6"
        style={sectionStyle}
      >
        <div
          className="px-6 py-4 border-b"
          style={{ borderColor: "var(--card-border)" }}
        >
          <h2
            className="text-sm font-bold tracking-widest uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Profile
          </h2>
        </div>

        <div className="px-6 py-6 flex flex-col gap-5">
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Display name
            </label>

            <div className="flex gap-3 flex-col sm:flex-row">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                className="flex-1 px-4 py-3 rounded-xl text-sm outline-none"
                style={inputStyle}
              />

              <button
                onClick={saveProfile}
                disabled={profileSaving || !profileChanged}
                className="px-5 py-3 rounded-xl text-sm font-semibold bg-accent text-white disabled:opacity-50"
              >
                {profileSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
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

      <div
        className="rounded-2xl border overflow-hidden mb-6"
        style={sectionStyle}
      >
        <div
          className="px-6 py-4 border-b"
          style={{ borderColor: "var(--card-border)" }}
        >
          <h2
            className="text-sm font-bold tracking-widest uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Password access
          </h2>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Add password login for email access, or change your current password.
          </p>
        </div>

        <div className="px-6 py-6 flex flex-col gap-8">
          <div>
            <h3
              className="text-sm font-semibold mb-3"
              style={{ color: "var(--text-primary)" }}
            >
              Add / set password
            </h3>
            <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
              Useful if you currently rely on magic link and want email + password
              login too.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="password"
                value={setPassword}
                onChange={(e) => setSetPassword(e.target.value)}
                placeholder="New password"
                className="px-4 py-3 rounded-xl text-sm outline-none"
                style={inputStyle}
              />
              <input
                type="password"
                value={setPasswordRepeat}
                onChange={(e) => setSetPasswordRepeat(e.target.value)}
                placeholder="Repeat new password"
                className="px-4 py-3 rounded-xl text-sm outline-none"
                style={inputStyle}
              />
            </div>

            <button
              onClick={handleSetPassword}
              disabled={setPasswordSaving}
              className="mt-4 px-5 py-3 rounded-xl text-sm font-semibold bg-accent text-white disabled:opacity-50"
            >
              {setPasswordSaving ? "Saving…" : "Add password login"}
            </button>
          </div>

          <div
            className="pt-6 border-t"
            style={{ borderColor: "var(--card-border)" }}
          >
            <h3
              className="text-sm font-semibold mb-3"
              style={{ color: "var(--text-primary)" }}
            >
              Change password
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="md:col-span-2 px-4 py-3 rounded-xl text-sm outline-none"
                style={inputStyle}
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                className="px-4 py-3 rounded-xl text-sm outline-none"
                style={inputStyle}
              />
              <input
                type="password"
                value={newPasswordRepeat}
                onChange={(e) => setNewPasswordRepeat(e.target.value)}
                placeholder="Repeat new password"
                className="px-4 py-3 rounded-xl text-sm outline-none"
                style={inputStyle}
              />
            </div>

            <button
              onClick={handleChangePassword}
              disabled={changePasswordSaving}
              className="mt-4 px-5 py-3 rounded-xl text-sm font-semibold bg-accent text-white disabled:opacity-50"
            >
              {changePasswordSaving ? "Saving…" : "Change password"}
            </button>
          </div>
        </div>
      </div>

      <div
        className="rounded-2xl border overflow-hidden mb-6"
        style={sectionStyle}
      >
        <div
          className="px-6 py-4 border-b"
          style={{ borderColor: "var(--card-border)" }}
        >
          <h2
            className="text-sm font-bold tracking-widest uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Dashboard modules
          </h2>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Hide modules from the dashboard overview. Hidden modules still work
            from the sidebar.
          </p>
        </div>

        <div className="px-6 py-4 flex flex-col gap-3">
          {MODULES.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {m.label}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {m.description}
                </p>
              </div>

              <button
                onClick={() => toggleModule(m.id)}
                className="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
                style={{
                  background: hiddenModules.includes(m.id)
                    ? "var(--card-border)"
                    : "#F5A623",
                }}
                aria-label={`Toggle ${m.label}`}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                  style={{
                    left: hiddenModules.includes(m.id) ? "2px" : "22px",
                  }}
                />
              </button>
            </div>
          ))}

          <button
            onClick={saveVisibility}
            disabled={visibilitySaving || !visibilityChanged}
            className="mt-2 px-5 py-3 rounded-xl text-sm font-semibold bg-accent text-white disabled:opacity-50 self-end"
          >
            {visibilitySaving ? "Saving…" : "Save visibility"}
          </button>
        </div>
      </div>

      <div
        className="rounded-2xl border overflow-hidden mb-6"
        style={sectionStyle}
      >
        <div
          className="px-6 py-4 border-b"
          style={{ borderColor: "var(--card-border)" }}
        >
          <h2
            className="text-sm font-bold tracking-widest uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Timezone
          </h2>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Affects how dates and times are displayed throughout the app.
          </p>
        </div>

        <div className="px-6 py-6">
          <input
            type="text"
            value={timezoneSearch}
            onChange={(e) => setTimezoneSearch(e.target.value)}
            placeholder="Search timezone…"
            className="w-full px-4 py-3 rounded-xl text-sm outline-none mb-3"
            style={inputStyle}
          />

          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={inputStyle}
            size={Math.min(12, Math.max(6, timezoneOptions.length))}
          >
            {timezoneOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </select>

          <button
            onClick={saveTimezone}
            disabled={timezoneSaving || !timezoneChanged}
            className="mt-3 px-5 py-3 rounded-xl text-sm font-semibold bg-accent text-white disabled:opacity-50"
          >
            {timezoneSaving ? "Saving…" : "Save timezone"}
          </button>
        </div>
      </div>

      <div
        className="rounded-2xl border overflow-hidden mb-6"
        style={sectionStyle}
      >
        <div
          className="px-6 py-4 border-b"
          style={{ borderColor: "var(--card-border)" }}
        >
          <h2
            className="text-sm font-bold tracking-widest uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            About
          </h2>
        </div>

        <div className="px-6 py-5 flex flex-col gap-3">
          {[
            { label: "App", value: "MyLife Dashboard" },
            { label: "Version", value: "Phase 3" },
            { label: "Database", value: "Supabase PostgreSQL" },
            { label: "Auth", value: "Supabase Auth" },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                {row.label}
              </span>
              <span
                className="text-sm font-medium text-right"
                style={{ color: "var(--text-primary)" }}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="rounded-2xl border overflow-hidden"
        style={sectionStyle}
      >
        <div className="px-6 py-5">
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