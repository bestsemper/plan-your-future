"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "../actions";

export default function Sidebar({ user }: { user: { computingId: string, displayName: string } | null }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const navLinks = [
    { href: "/", label: "Dashboard" },
    { href: "/plan", label: "Plan Builder" },
    { href: "/forum", label: "Forum" },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  useEffect(() => {
    const onOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  if (pathname === '/login') {
    return null;
  }

  return (
    <>
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-uva-blue text-white border-b border-white/15 px-4 flex items-center justify-between">
        <Link href="/" className="min-w-0 block">
          <div className="w-[190px]">
            <img src="/uva-logo.svg" alt="University of Virginia Logo" className="h-6 w-full" />
            <span className="text-[10px] tracking-[0.24em] font-semibold border-t border-white/20 pt-0.5 block text-uva-orange leading-none">
              HOO'S PLAN
            </span>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => setMobileNavOpen((prev) => !prev)}
          aria-label="Toggle navigation"
          className="p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {mobileNavOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </header>

      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`md:hidden fixed top-14 bottom-0 left-0 z-50 w-72 bg-uva-blue text-white px-6 py-6 flex flex-col justify-between transform transition-transform duration-200 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div>
          <nav className="space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileNavOpen(false)}
                className={`block px-4 py-2.5 transition-colors font-medium rounded-xl border ${
                  isActive(link.href)
                    ? "bg-white text-uva-blue border-black/15"
                    : "text-white/75 hover:text-white border-transparent"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="pt-4 flex flex-col gap-2 border-t border-white/20">
          {user ? (
            <>
              <Link
                href="/profile"
                onClick={() => setMobileNavOpen(false)}
                className="w-full text-left rounded-lg px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
              >
                Profile
              </Link>
              <form action={logout}>
                <button
                  type="submit"
                  className="w-full text-left rounded-lg px-3 py-2 text-sm font-medium text-white hover:bg-white/10 cursor-pointer"
                >
                  Sign Out
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="mt-1 flex items-center justify-center w-full text-sm text-uva-blue bg-white hover:bg-white/90 py-2.5 rounded-xl transition-colors font-bold shadow-sm border border-black/10">
              Sign In
            </Link>
          )}
        </div>
      </aside>

      <aside className="hidden md:flex w-64 h-screen bg-uva-blue text-white flex-col justify-between sticky top-0 shrink-0 px-6 py-6">
        <div>
          <Link href="/" className="block mb-8">
            <img src="/uva-logo.svg" alt="University of Virginia Logo" className="block mb-3 w-full" />
            <span className="text-sm tracking-widest font-semibold border-t border-white/20 pt-2 block text-uva-orange">HOO'S PLAN</span>
          </Link>
          <nav className="space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`block px-4 py-2.5 transition-colors font-medium rounded-xl border ${
                  isActive(link.href)
                    ? "bg-white text-uva-blue border-black/15"
                    : "text-white/75 hover:text-white border-transparent"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="pt-4 flex flex-col gap-2 border-t border-white/20">
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="w-full flex items-center space-x-3 rounded-xl hover:bg-black/20 p-2.5 transition-colors border border-transparent hover:border-white/10 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-uva-orange flex items-center justify-center text-white font-bold uppercase">
                  {user.displayName.charAt(0)}
                </div>
                <div className="flex-1 overflow-hidden text-left">
                  <p className="text-sm font-medium text-white truncate">{user.displayName}</p>
                  <p className="text-xs text-white/70 truncate">{user.computingId}</p>
                </div>
              </button>

              {menuOpen && (
                <div className="absolute left-0 right-0 bottom-full mb-2 rounded-xl border border-panel-border bg-panel-bg shadow-lg p-1.5 z-20">
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm font-medium text-text-primary hover:bg-hover-bg"
                  >
                    Profile
                  </Link>
                  <form action={logout}>
                    <button
                      type="submit"
                      className="w-full text-left rounded-lg px-3 py-2 text-sm font-medium text-text-primary hover:bg-hover-bg cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <Link href="/login" className="mt-1 flex items-center justify-center w-full text-sm text-uva-blue bg-white hover:bg-white/90 py-2.5 rounded-xl transition-colors font-bold shadow-sm border border-black/10">
              Sign In
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
