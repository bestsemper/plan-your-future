import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import { ThemeProvider } from "./components/ThemeProvider";
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
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased flex bg-uva-blue text-text-primary`}>
        <ThemeProvider>
          <Sidebar user={user} />
          <main className="flex-1 h-screen bg-uva-blue overflow-hidden flex flex-col py-3 pr-3">
            <div className="h-full w-full rounded-3xl bg-background border border-black/15 overflow-hidden">
              <div className="h-full overflow-auto p-8">
                {children}
              </div>
            </div>
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
