import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";

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
    <div
      className="min-h-screen"
      style={{ ["--sidebar-width" as string]: "240px" }}
    >
      <Sidebar userEmail={user.email ?? ""} hiddenModules={hiddenModules} />

      <main
        id="main-content"
        className="min-h-screen min-w-0 pt-14 lg:pt-0"
        style={{
          background: "var(--main-bg)",
        }}
      >
        {/* Desktop: content should shift and resize with sidebar */}
        <div
          className="hidden lg:block"
          style={{
            marginLeft: "var(--sidebar-width)",
            width: "calc(100% - var(--sidebar-width))",
            transition: "margin-left 0.3s ease, width 0.3s ease",
          }}
        >
          <div className="page-enter min-h-screen">{children}</div>
        </div>

        {/* Mobile: sidebar is overlay only, content stays full width */}
        <div className="lg:hidden">
          <div className="page-enter min-h-screen">{children}</div>
        </div>
      </main>
    </div>
  );
}