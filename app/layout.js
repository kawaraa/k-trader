import { cookies } from "next/headers";
const packageJsonFile = require("../package.json");
import "./globals.css";

export const metadata = {
  title: "K Trader",
  description: packageJsonFile.description,
  manifest: "/manifest.json",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  icons: {
    shortcut: { type: "image/ico", sizes: "48x48", url: "/favicon.ico" },
    icon: { type: "image/png", sizes: "16x16", url: "/favicon-16x16.png" },
    apple: { type: "image/png", sizes: "180x180", url: "/apple-touch-icon.png" },
    other: [
      { rel: "icon", type: "image/png", sizes: "32x32", url: "/favicon-32x32.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", url: "/android-chrome-192x192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", url: "/android-chrome-512x512.png" },
    ],
  },
};

export default function RootLayout({ children }) {
  const cookieStore = cookies();
  const themeMode = cookieStore.get("themeMode")?.value || "auto";

  return (
    <html lang="en" className={`scroll-smooth group ${themeMode} `}>
      <body className="no-select relative min-h-screen bg-bg antialiased font-base">{children}</body>
    </html>
  );
}

export const viewport = {
  themeColor: "#ffffff",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
  colorScheme: "light dark",
};
