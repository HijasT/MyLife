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
    <div className="flex min-h-screen">
      <Sidebar userEmail={user.email ?? ""} hiddenModules={hiddenModules} />

      <main
        id="main-content"
        className="flex-1 min-h-screen pt-14 lg:pt-0 transition-all duration-300"
        style={{
          background: "var(--main-bg)",
          marginLeft: "var(--sidebar-offset, 0px)",
        }}
      >
        <div className="page-enter">{children}</div>
      </main>
    </div>
  );
}