"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "reset";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Invalid email or password. Try resetting your password below.");
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  const handleReset = async () => {
    if (!email) { setError("Enter your email first"); return; }
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setResetSent(true);
    }
  };

  return (
    <div className="min-h-screen bg-sidebar flex">
      {/* Left — branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-14 border-r border-sidebar-border">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <img src="/logo.png" alt="MyLife" className="h-10 w-10 rounded-xl object-contain" />
            <span className="font-display text-2xl text-white tracking-tight">
              My<span className="text-accent italic">Life</span>
            </span>
          </div>
          <p className="text-sidebar-text text-xs mt-1">The Super App for your Every Day</p>
        </div>
        <div>
          <p className="text-4xl font-display text-white leading-snug mb-6">
            Everything you track,<br />
            <span className="text-accent italic">beautifully organised.</span>
          </p>
          <div className="flex flex-col gap-3">
            {[
              { icon: "💳", text: "Due tracker & payments" },
              { icon: "📈", text: "Portfolio with live prices" },
              { icon: "🌸", text: "Aromatica — perfume collection" },
              { icon: "🗓️", text: "Calendar & work hours" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3">
                <span className="text-lg">{item.icon}</span>
                <span className="text-sidebar-text text-sm">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-sidebar-text text-xs">Your data. Your app. Always private.</p>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-10 text-center">
            <div className="flex items-center justify-center gap-3">
              <img src="/logo.png" alt="MyLife" className="h-10 w-10 rounded-xl object-contain" />
              <span className="font-display text-3xl text-white tracking-tight">
                My<span className="text-accent italic">Life</span>
              </span>
            </div>
          </div>

          {mode === "login" ? (
            <>
              <h1 className="text-2xl font-display text-white mb-2">Welcome back</h1>
              <p className="text-sidebar-text text-sm mb-8">Sign in to your dashboard</p>

              <div className="flex flex-col gap-3 mb-4">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  className="w-full bg-sidebar-hover border border-sidebar-border text-white placeholder-sidebar-text text-sm px-4 py-3 rounded-xl outline-none focus:border-accent transition-colors"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  className="w-full bg-sidebar-hover border border-sidebar-border text-white placeholder-sidebar-text text-sm px-4 py-3 rounded-xl outline-none focus:border-accent transition-colors"
                />
              </div>

              {error && <p className="text-red-400 text-xs mb-4">{error}</p>}

              <button
                onClick={handleLogin}
                disabled={loading || !email || !password}
                className="w-full bg-accent hover:bg-amber-500 text-white font-medium text-sm py-3.5 px-6 rounded-xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>

              <button
                onClick={() => { setMode("reset"); setError(""); setResetSent(false); }}
                className="w-full text-sidebar-text hover:text-white text-xs py-2 transition-colors"
              >
                Forgot password? Reset it →
              </button>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-display text-white mb-2">Reset password</h1>
              <p className="text-sidebar-text text-sm mb-8">
                Enter your email and we&apos;ll send a reset link.
              </p>

              {resetSent ? (
                <div className="bg-green-900/30 border border-green-500/30 rounded-xl p-4 mb-6">
                  <p className="text-green-400 text-sm font-medium">✓ Reset link sent!</p>
                  <p className="text-sidebar-text text-xs mt-1">
                    Check your email at <strong className="text-white">{email}</strong> and click the link to set a new password.
                  </p>
                </div>
              ) : (
                <>
                  <input
                    type="email"
                    placeholder="Your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleReset()}
                    className="w-full bg-sidebar-hover border border-sidebar-border text-white placeholder-sidebar-text text-sm px-4 py-3 rounded-xl outline-none focus:border-accent transition-colors mb-4"
                  />
                  {error && <p className="text-red-400 text-xs mb-4">{error}</p>}
                  <button
                    onClick={handleReset}
                    disabled={loading || !email}
                    className="w-full bg-accent hover:bg-amber-500 text-white font-medium text-sm py-3.5 px-6 rounded-xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                  >
                    {loading ? "Sending…" : "Send reset link"}
                  </button>
                </>
              )}

              <button
                onClick={() => { setMode("login"); setError(""); }}
                className="w-full text-sidebar-text hover:text-white text-xs py-2 transition-colors"
              >
                ← Back to sign in
              </button>
            </>
          )}

          <p className="text-center text-sidebar-text text-xs mt-8">
            Personal use only · No ads · No tracking
          </p>
        </div>
      </div>
    </div>
  );
}
