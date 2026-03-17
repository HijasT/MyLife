import { redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import { ThemeProvider } from "@/components/ThemeProvider";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MyLife — Personal Dashboard",
  description: "The Super App for your Every Day",
  manifest: "/manifest.json",
  applicationName: "MyLife",
};

export const viewport: Viewport = {
  themeColor: "#0E1015",
  width: "device-width",
  initialScale: 1,
};

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("hidden_modules")
    .eq("id", user.id)
    .single();

  const hiddenModules: string[] = Array.isArray(profile?.hidden_modules)
    ? profile.hidden_modules
    : [];

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${dmSans.variable} ${playfair.variable}`}
    >
      <body
        className="font-sans antialiased"
        style={{
          background: "var(--main-bg)",
          color: "var(--text-primary)",
        }}
      >
        <ThemeProvider>
          <div
            className="flex min-h-screen"
            style={{ ["--sidebar-width" as string]: "240px" }}
          >
            {/* Sidebar */}
            <Sidebar
              userEmail={user.email ?? ""}
              hiddenModules={hiddenModules}
            />

            {/* Main Content */}
            <main
              id="main-content"
              className="flex-1 min-h-screen pt-14 lg:pt-0 transition-[margin-left] duration-300"
              style={{
                marginLeft: "var(--sidebar-width)",
              }}
            >
              <div className="page-enter">{children}</div>
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
