import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session) {
    // Allow Firebase marker to pass through so client can re-mint JWT
    // (fixes refresh bug where IndexedDB has Firebase user but httpOnly JWT missing)
    const fbMarker = cookies().get("clipforge_fb")?.value;
    if (!fbMarker) {
      redirect("/login");
    }
    // If fbMarker exists, render layout anyway — AuthProvider will sync JWT client-side
    // and subsequent server requests will have a valid JWT.
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
