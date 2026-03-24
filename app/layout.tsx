import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import { ThemeProvider } from "./components/ThemeProvider";
import AttachedPlanModalProvider from "./forum/AttachedPlanModalProvider";
import { getCurrentUser } from "./actions";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} antialiased flex bg-uva-blue text-text-primary`}>
        <ThemeProvider>
          <AttachedPlanModalProvider>
            <Sidebar user={user} />
            <main id="app-main-content" className="relative z-10 flex-1 bg-uva-blue overflow-visible flex flex-col h-[100svh] p-3 pt-[4.25rem] lg:h-screen lg:pt-3">
              <div className="h-full w-full rounded-3xl bg-background border border-black/15 border-l-0 overflow-visible">
                <div id="app-scroll-container" className="h-full overflow-y-auto overflow-x-visible p-8">
                  {children}
                </div>
              </div>
            </main>
          </AttachedPlanModalProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
