import Link from "next/link";
import { Inter, Orbitron } from "next/font/google";
import AppShell from "@/components/AppShell";
import Logo from "@/components/Logo";
import { APP_ENV } from "@/lib/format";
import "./globals.css";

// Files in public/ are served under the GitHub Pages sub-path, so app metadata links need it too
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

const DEV = APP_ENV === "dev";

// Fonts are downloaded at build time and served with the site (no request to Google from the browser)
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Orbitron({ subsets: ["latin"], weight: ["500", "700", "800"], variable: "--font-display", display: "swap" });

export const metadata = {
  title: DEV ? "Starcall (dev)" : "Starcall",
  robots: DEV ? { index: false, follow: false } : undefined,
  description: "Make the call, then find out if you were right. Research US, Hong Kong and Singapore stocks, make a call, and see if you were right.",
  applicationName: "Starcall",
  manifest: `${BASE}/manifest.webmanifest`,
  icons: {
    icon: [{ url: `${BASE}/icons/icon.svg`, type: "image/svg+xml" }, { url: `${BASE}/icons/favicon-32.png`, sizes: "32x32" }, { url: `${BASE}/icons/icon-192.png`, sizes: "192x192" }],
    apple: `${BASE}/icons/apple-touch-icon.png`,
  },
  appleWebApp: { capable: true, title: "Starcall", statusBarStyle: "black-translucent" },
};

export const viewport = {
  themeColor: "#05060f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // use the full screen on phones with a notch when opened as an app
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            <Logo />
            <span className="wordmark">Star<span>call</span></span>
            {DEV && <span className="dev-badge" title="Test site: changes here aren't live yet">DEV</span>}
          </Link>
          <nav>
            <AppShell />
            <Link href="/">Stocks</Link>
            <Link href="/calls/">My calls</Link>
            <Link href="/options/">Options</Link>
          </nav>
        </header>
        <main className="container">{children}</main>
        <footer className="footer">
          Practice journal for learning. Not investment advice. Prices refresh about every 15 minutes in market hours (may be delayed); company data daily. Sources: Yahoo Finance, Google News, Seeking Alpha, Nasdaq.
        </footer>
      </body>
    </html>
  );
}
