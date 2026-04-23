"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

const AUTH_PATHS = ['/login', '/create-account', '/verify-email', '/reset-password'];

export default function AppShell({
  user,
  children,
}: {
  user: { computingId: string; displayName: string } | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <>
      {!isAuthPage && <Sidebar user={user} />}
      <main
        id="app-main-content"
        className={`relative z-10 flex-1 bg-uva-blue overflow-visible flex flex-col h-[100svh] p-3 lg:h-screen ${isAuthPage ? '' : 'pt-14 lg:pt-3 lg:pl-0'}`}
      >
        <div className="h-full w-full rounded-3xl bg-background border border-black/15 overflow-visible">
          <div id="app-scroll-container" className="h-full overflow-y-auto overflow-x-visible p-8">
            {children}
          </div>
        </div>
      </main>
    </>
  );
}
