"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async () => {
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("Invalid email or password");
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-sidebar flex">
      {/* Left — branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-14 border-r border-sidebar-border">
        <div>
          <span className="font-display text-2xl text-white tracking-tight">
            My<span className="text-accent italic">Life</span>
          </span>
        </div>
        <div>
          <p className="text-4xl font-display text-white leading-snug mb-6">
            Everything you track,<br />
            <span className="text-accent italic">beautifully organised.</span>
          </p>
          <div className="flex flex-col gap-3">
            {[
              { icon: "💳", text: "Expenses & budget in sync" },
              { icon: "📈", text: "Portfolio with live prices" },
              { icon: "🌸", text: "Perfume collection tracker" },
              { icon: "📅", text: "Product expiry alerts" },
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

      {/* Right — login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-10 text-center">
            <span className="font-display text-3xl text-white tracking-tight">
              My<span className="text-accent italic">Life</span>
            </span>
          </div>

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

          {error && (
            <p className="text-red-400 text-xs mb-4">{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || !email || !password}
            className="w-full bg-accent hover:bg-amber-500 text-white font-medium text-sm py-3.5 px-6 rounded-xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <p className="text-center text-sidebar-text text-xs mt-8">
            Personal use only · No ads · No tracking
          </p>
        </div>
      </div>
    </div>
  );
}