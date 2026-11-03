import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { CommandPalette, Rail } from "@/components/shell";

export const metadata: Metadata = {
  title: "LUMIÈRE — Cinematic Studio",
  description: "A premium cinematic media studio in the browser: professional capture, cinematic editing, color grading, broadcast tools, and an intelligent director.",
  manifest: "/manifest.webmanifest",
  applicationName: "LUMIÈRE",
  appleWebApp: { capable: true, title: "LUMIÈRE", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#07070a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-accent="gold" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Manrope:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      </head>
      <body className="grain min-h-screen antialiased">
        <div className="flex min-h-screen">
          <Rail />
          <main className="min-w-0 flex-1 pb-16 md:pb-0">{children}</main>
        </div>
        <CommandPalette />
      </body>
    </html>
  );
}
