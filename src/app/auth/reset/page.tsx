"use client";

import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const router = useRouter();
  const supabase = await createClient();

  // Supabase puts the session in the URL hash after redirect
  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        // Session is ready — user can now set new password
      }
    });
  }, []);

  const handleReset = async () => {
    if (!password) { setError("Enter a new password"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setDone(true);
      setTimeout(() => router.push("/dashboard"), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <img src="/logo.png" alt="MyLife" className="h-10 w-10 rounded-xl object-contain" />
          <span className="font-display text-2xl text-white tracking-tight">
            My<span className="text-accent italic">Life</span>
          </span>
        </div>

        {done ? (
          <div className="bg-green-900/30 border border-green-500/30 rounded-xl p-5">
            <p className="text-green-400 font-medium">✓ Password updated!</p>
            <p className="text-sidebar-text text-sm mt-1">Redirecting to dashboard…</p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-display text-white mb-2">Set new password</h1>
            <p className="text-sidebar-text text-sm mb-8">Choose a strong password for your account.</p>

            <div className="flex flex-col gap-3 mb-4">
              <input
                type="password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-sidebar-hover border border-sidebar-border text-white placeholder-sidebar-text text-sm px-4 py-3 rounded-xl outline-none focus:border-accent transition-colors"
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleReset()}
                className="w-full bg-sidebar-hover border border-sidebar-border text-white placeholder-sidebar-text text-sm px-4 py-3 rounded-xl outline-none focus:border-accent transition-colors"
              />
            </div>

            {error && <p className="text-red-400 text-xs mb-4">{error}</p>}

            <button
              onClick={handleReset}
              disabled={loading || !password || !confirm}
              className="w-full bg-accent hover:bg-amber-500 text-white font-medium text-sm py-3.5 px-6 rounded-xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Saving…" : "Update password"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
