import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { CommandPalette, Rail, Toaster } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "LUMIÈRE — The Cinematic Studio",
  description:
    "Capture, broadcast, edit, grade and deliver cinema from any computer. Pro camera monitoring, WHIP live streaming, a GPU colour engine and an AI Director.",
  applicationName: "LUMIÈRE",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "LUMIÈRE", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#070708",
  colorScheme: "dark",
};

const FONTS =
  "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cinzel:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Italiana&family=JetBrains+Mono:wght@400;500&family=Manrope:wght@300;400;500;600;700;800&family=Monoton&family=Playfair+Display:ital,wght@0,500;1,500&display=swap";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body className="grain min-h-screen antialiased">
        <div className="flex min-h-screen">
          <Rail />
          <main className="relative min-w-0 flex-1">{children}</main>
        </div>
        <CommandPalette />
        <Toaster />
      </body>
    </html>
  );
}
