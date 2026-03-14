"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleGoogleLogin = async () => {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
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
              { icon: "🪔", text: "Perfume collection tracker" },
              { icon: "📅", text: "Product expiry alerts" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3">
                <span className="text-lg">{item.icon}</span>
                <span className="text-sidebar-text text-sm">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-sidebar-text text-xs">
          Your data. Your app. Always private.
        </p>
      </div>

      {/* Right — login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-10 text-center">
            <span className="font-display text-3xl text-white tracking-tight">
              My<span className="text-accent italic">Life</span>
            </span>
          </div>

          <h1 className="text-2xl font-display text-white mb-2">Welcome back</h1>
          <p className="text-sidebar-text text-sm mb-10">
            Sign in to access your personal dashboard
          </p>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800 font-medium text-sm py-3.5 px-6 rounded-xl transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <svg className="animate-spin h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
                <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
              </svg>
            )}
            {loading ? "Signing in…" : "Continue with Google"}
          </button>

          <p className="text-center text-sidebar-text text-xs mt-8">
            Personal use only · No ads · No tracking
          </p>
        </div>
      </div>
    </div>
  );
}
