import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import OnboardingModal from "./components/OnboardingModal";
import { Suspense } from "react";
import { ThemeProvider } from "next-themes";
import AttachedPlanModalProvider from "./components/AttachedPlan";
import TutorialProvider from "./components/TutorialProvider";
import AppShell from "./components/AppShell";
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
  title: "Hoos' Plan",
  description: "UVA academic course planner and forum",
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
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TutorialProvider isAuthenticated={Boolean(user)}>
            <AttachedPlanModalProvider>
              <AppShell user={user}>{children}</AppShell>
              <Suspense><OnboardingModal /></Suspense>
            </AttachedPlanModalProvider>
          </TutorialProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
