import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-full min-h-screen">
      <Sidebar userEmail={user.email ?? ""} />
      {/* lg: offset for sidebar. mobile: offset for top bar (h-14 = 56px) */}
      <main className="flex-1 min-h-screen lg:ml-[240px] pt-14 lg:pt-0" style={{ background: "var(--main-bg)" }}>
        <div className="page-enter">{children}</div>
      </main>
    </div>
  );
}
