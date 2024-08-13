import { Suspense } from "react";
const packageJsonFile = require("../package.json");
import "./globals.css";

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="scroll-smooth group">
      <body className="relative min-h-screen bg-bg antialiased font-base">
        <Suspense>{children}</Suspense>
      </body>
    </html>
  );
}

export const viewport = {
  themeColor: "#ffffff",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  colorScheme: "light dark",
};

export const metadata = {
  title: "K Trader",
  description: packageJsonFile.description,
  manifest: "/manifest.json",
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
