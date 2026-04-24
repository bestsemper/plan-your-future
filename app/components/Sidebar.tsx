"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
export default function Sidebar({ user }: { user: { computingId: string, displayName: string } | null }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navLinks = [
    {
      href: "/",
      label: "Dashboard",
      icon: <Icon name="dashboard" color="currentColor" width={18} height={18} />,
    },
    {
      href: "/plan",
      label: "Plan Builder",
      icon: <Icon name="calendar" color="currentColor" width={18} height={18} />,
    },
    {
      href: "/forum",
      label: "Forum",
      icon: <Icon name="forum" color="currentColor" width={18} height={18} />,
    },
    {
      href: "/courses",
      label: "Course Search",
      icon: <Icon name="search" color="currentColor" width={18} height={18} />,
    },
    {
      href: "/prerequisites",
      label: "Prerequisites",
      icon: <Icon name="prerequisites" color="currentColor" width={18} height={18} />,
    },
  ];

  const tutorialTargetByHref: Record<string, string> = {
    '/': 'nav-dashboard',
    '/plan': 'nav-plan',
    '/forum': 'nav-forum',
    '/courses': 'nav-courses',
    '/prerequisites': 'nav-prerequisites',
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <>
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-uva-blue text-white px-4 flex items-center justify-between">
        <Link href="/" className="min-w-0 block">
          <div className="w-[190px]">
            <img src="/uva-logo.svg" alt="University of Virginia Logo" className="h-6 w-full" />
            <span className="text-[10px] tracking-[0.24em] font-semibold border-t border-white/20 pt-0.5 block text-uva-orange leading-none">
              HOO'S PLAN
            </span>
          </div>
        </Link>
        {!isLoginPage && (
          <button
            type="button"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            aria-label="Toggle navigation"
            className="w-10 h-10 flex items-center justify-center rounded-xl text-white/75 hover:text-white hover:bg-black/20 border border-transparent hover:border-white/10 transition-colors cursor-pointer"
          >
            <Icon 
              name={mobileNavOpen ? "x" : "menu"}
              color="currentColor"
              width={20}
              height={20}
            />
          </button>
        )}
      </header>

      {!isLoginPage && mobileNavOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="lg:hidden fixed top-14 bottom-0 inset-x-0 z-[60] bg-transparent touch-none"
            onPointerDown={(event) => event.preventDefault()}
            onTouchMove={(event) => event.preventDefault()}
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="pointer-events-none lg:hidden fixed top-14 bottom-3 left-3 right-3 z-[60] rounded-3xl bg-black/35" />
        </>
      )}

      {!isLoginPage && (
      <aside
        id="mobile-sidebar-panel"
        className={`lg:hidden fixed top-14 bottom-0 left-0 z-[70] w-72 bg-uva-blue text-white p-4 flex flex-col transform transition-transform duration-200 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex-1">
          <nav className="space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                data-tutorial-target={tutorialTargetByHref[link.href]}
                onClick={() => setMobileNavOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors font-medium rounded-2xl border ${
                  isActive(link.href)
                    ? "bg-white text-slate-900 border-black/15"
                    : "text-white/75 hover:text-white hover:bg-black/20 border-transparent hover:border-white/10"
                }`}
              >
                {link.icon}
                {link.label}
              </Link>
            ))}
{/* Help & Tutorial hidden on mobile */}
          </nav>
        </div>

        <div className="flex flex-col gap-2 pt-4">
          {user ? (
            <Link
              href="/profile"
              onClick={() => setMobileNavOpen(false)}
              data-tutorial-target="account-menu-profile"
              className={`flex items-center gap-3 px-4 py-2.5 transition-colors font-medium rounded-2xl border ${
                isActive('/profile')
                  ? "bg-white text-slate-900 border-black/15"
                  : "text-white/75 hover:text-white hover:bg-black/20 border-transparent hover:border-white/10"
              }`}
            >
              <Icon name="settings" color="currentColor" width={18} height={18} />
              Settings
            </Link>
          ) : (
            <Link href="/login" className="flex items-center justify-center w-full text-sm text-uva-blue bg-white hover:bg-white/90 py-2.5 rounded-2xl transition-colors font-bold shadow-sm border border-black/10">
              Sign In
            </Link>
          )}
          <Link
            href="/about"
            onClick={() => setMobileNavOpen(false)}
            className={`flex items-center gap-3 px-4 py-2.5 transition-colors font-medium rounded-2xl border ${
              isActive('/about')
                ? "bg-white text-slate-900 border-black/15"
                : "text-white/75 hover:text-white hover:bg-black/20 border-transparent hover:border-white/10"
            }`}
          >
            <Icon name="help-circle" color="currentColor" width={18} height={18} />
            Help
          </Link>
        </div>
      </aside>
      )}

      {!isLoginPage && (
      <aside className="hidden lg:flex w-64 h-screen bg-uva-blue text-white flex-col sticky top-0 shrink-0 px-6 py-6">
        <div className="flex-1">
          <Link href="/" className="block mb-8">
            <img src="/uva-logo.svg" alt="University of Virginia Logo" className="block mb-3 w-full" />
            <span className="text-sm tracking-widest font-semibold border-t border-white/20 pt-2 block text-uva-orange">HOO'S PLAN</span>
          </Link>
          <nav className="space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                data-tutorial-target={tutorialTargetByHref[link.href]}
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors font-medium rounded-2xl border ${
                  isActive(link.href)
                    ? "bg-white text-slate-900 border-black/15"
                    : "text-white/75 hover:text-white hover:bg-black/20 border-transparent hover:border-white/10"
                }`}
              >
                {link.icon}
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-2 pt-4">
          {user ? (
            <Link
              href="/profile"
              data-tutorial-target="account-menu-profile"
              className={`flex items-center gap-3 px-4 py-2.5 transition-colors font-medium rounded-2xl border ${
                isActive('/profile')
                  ? "bg-white text-slate-900 border-black/15"
                  : "text-white/75 hover:text-white hover:bg-black/20 border-transparent hover:border-white/10"
              }`}
            >
              <Icon name="settings" color="currentColor" width={18} height={18} />
              Settings
            </Link>
          ) : (
            <Link href="/login" className="flex items-center justify-center w-full text-sm text-uva-blue bg-white hover:bg-white/90 py-2.5 rounded-2xl transition-colors font-bold shadow-sm border border-black/10">
              Sign In
            </Link>
          )}
          <Link
            href="/about"
            className={`flex items-center gap-3 px-4 py-2.5 transition-colors font-medium rounded-2xl border ${
              isActive('/about')
                ? "bg-white text-slate-900 border-black/15"
                : "text-white/75 hover:text-white hover:bg-black/20 border-transparent hover:border-white/10"
            }`}
          >
            <Icon name="help-circle" color="currentColor" width={18} height={18} />
            Help
          </Link>
        </div>
      </aside>
      )}
    </>
  );
}
