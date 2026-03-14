import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex h-full min-h-screen">
      <Sidebar userEmail={user.email ?? ""} />
      <main className="ml-[240px] flex-1 min-h-screen" style={{ background: "var(--main-bg)" }}>
        <div className="page-enter">{children}</div>
      </main>
    </div>
  );
}
