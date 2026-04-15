import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import HelpButton from "./components/HelpButton";
import { ThemeProvider } from "next-themes";
import AttachedPlanModalProvider from "./components/AttachedPlan";
import TutorialProvider from "./components/TutorialProvider";
import { getCurrentUser } from "./actions";
import { headers } from "next/headers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hoos Plan",
  description: "UVA 4-year course planner and forum",
  icons: {
    icon: "/favicon.svg",
  },
};

const AUTH_PATHS = ['/login', '/create-account', '/verify-email', '/reset-password'];

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '';
  const isAuthPage = AUTH_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));

  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} antialiased flex bg-uva-blue text-text-primary`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TutorialProvider isAuthenticated={Boolean(user)}>
            <AttachedPlanModalProvider>
              {!isAuthPage && <Sidebar user={user} />}
              <main id="app-main-content" className={`relative z-10 flex-1 bg-uva-blue overflow-visible flex flex-col h-[100svh] p-3 lg:h-screen ${isAuthPage ? '' : 'pt-14 lg:pt-3'}`}>
                <div className="h-full w-full rounded-3xl bg-background border border-black/15 overflow-visible">
                  <div id="app-scroll-container" className="h-full overflow-y-auto overflow-x-visible p-8">
                    {children}
                  </div>
                </div>
              </main>
              {!isAuthPage && <HelpButton />}
            </AttachedPlanModalProvider>
          </TutorialProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
