import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session) {
    redirect("/login");
  }
  return (
    <div className="min-h-screen bg-[#09090b]">
      <Sidebar />
      <div className="lg:pl-[260px]">
        <main className="mx-auto max-w-[1280px] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
