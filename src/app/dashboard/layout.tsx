import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, user } = await getAuthenticatedUser();

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
        {/* Single render — the sidebar offset is applied via CSS at the lg
            breakpoint (.dashboard-main), so the page mounts once instead of
            twice (no duplicate data-fetch effects). */}
        <div className="dashboard-main">
          <div className="page-enter min-h-screen">{children}</div>
        </div>
      </main>
    </div>
  );
}
