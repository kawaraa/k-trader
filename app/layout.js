import { cookies } from "next/headers";
const packageJsonFile = require("../package.json");
import "./globals.css";

export const metadata = {
  title: "K Trader",
  description: packageJsonFile.description,
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
