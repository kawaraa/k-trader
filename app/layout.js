import { Suspense } from "react";
import packageJsonFile from "../package.json";
import { StateProvider } from "./state";
import "./globals.css";

export default function RootLayout({ children }) {
  return (
    <html dir="auto" translate="no" lang="en" className="scroll-smooth group">
      <body
        // className="relative min-h-screen bg-bg antialiased font-base"
        className="antialiased bg-neutral-50 text-slate-700 selection:bg-teal-300 dark:bg-black dark:text-gray-300 dark:selection:bg-pink-500 dark:selection:text-white"
      >
        <Suspense>
          <StateProvider>
            {/* <Navigation /> */}

            <main className="min-h-screen pt-10 pb-24 px-1 sm:px-2 md:px-4 print:min-h-fit" dir="auto">
              {children}
            </main>

            {/* <Footer /> */}
          </StateProvider>
        </Suspense>
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
