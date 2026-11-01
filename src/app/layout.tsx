import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { SiteHeader } from "@/components/site-header";
import { AuthProvider } from "@/components/auth-provider";
import { SITE_URL } from "@/lib/site";

// Set the theme class before paint to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION =
  "CivicPulse is an AI-powered civic grievance platform for Bengaluru, grounded in real open grievance data. Report a road, water, streetlight or waste issue with a photo — a multi-agent AI pipeline triages it, routes it to the responsible agency, the community verifies it, and AI confirms the fix.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "CivicPulse — Report, track & resolve civic issues with AI",
    template: "%s · CivicPulse",
  },
  description: DESCRIPTION,
  applicationName: "CivicPulse",
  manifest: "/manifest.webmanifest",
  keywords: [
    "civic issues",
    "Bengaluru",
    "BBMP",
    "pothole reporting",
    "civic tech",
    "AI",
    "Gemini",
    "community",
    "smart city",
    "public infrastructure",
    "complaint",
  ],
  authors: [{ name: "CivicPulse" }],
  creator: "CivicPulse",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "CivicPulse",
    title: "CivicPulse — Report, track & resolve civic issues with AI",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "CivicPulse — Report, track & resolve civic issues with AI",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col overflow-x-hidden bg-bg text-fg">
        <AuthProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          {/* Disclosure: the leaderboard accounts and their reports are demo seed data. */}
          <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted">
            Demo notice: the leaderboard and its users&rsquo; citizen reports are seed data created to
            show how the platform works. Their photos are real public photos from Wikimedia Commons,
            credited on each report. All grievance records, statistics and work orders come from
            official open data.
          </footer>
        </AuthProvider>
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: "var(--color-bg)",
              color: "var(--color-fg)",
              border: "1px solid var(--color-border)",
              fontSize: "14px",
            },
          }}
        />
      </body>
    </html>
  );
}
