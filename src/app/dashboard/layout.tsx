import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("hidden_modules")
    .eq("id", user.id)
    .single();

  const hiddenModules: string[] = profile?.hidden_modules ?? [];

  return (
    <div className="flex h-full min-h-screen">
      <Sidebar userEmail={user.email ?? ""} hiddenModules={hiddenModules} />
      {/* main content — uses CSS var set by sidebar JS for smooth resize */}
      <main className="flex-1 min-h-screen lg:ml-[240px] pt-14 lg:pt-0 transition-all duration-300"
        id="main-content"
        style={{ background: "var(--main-bg)" }}>
        <div className="page-enter">{children}</div>
      </main>
    </div>
  );
}
