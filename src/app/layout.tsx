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
  "CivicPulse is an AI-powered hyperlocal civic platform for Delhi. Report potholes, water leaks, broken streetlights and waste with a photo — a multi-agent AI pipeline triages it, routes it to the right authority, the community verifies it, and AI confirms the fix.";

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
    "Delhi",
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
    images: [
      {
        url: "/delhi_vector_map.png",
        width: 1536,
        height: 1024,
        alt: "Map of reported civic issues across Delhi",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CivicPulse — Report, track & resolve civic issues with AI",
    description: DESCRIPTION,
    images: ["/delhi_vector_map.png"],
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
