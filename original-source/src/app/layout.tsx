import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Spine } from "@/components/shell/Spine";

export const metadata: Metadata = {
  title: "OBSIDIAN — Cinema Studio",
  description:
    "A premium cinema studio in the browser: live camera with professional monitoring, broadcast-grade streaming, cinematic color grading, timeline editing and an intelligent director.",
  manifest: "/manifest.webmanifest",
  applicationName: "Obsidian Cinema Studio",
  appleWebApp: { capable: true, title: "Obsidian", statusBarStyle: "black-translucent" },
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
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Manrope:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var a=localStorage.getItem('obsidian.accent');if(a)document.documentElement.setAttribute('data-accent',a);}catch(e){}`,
          }}
        />
      </head>
      <body className="grain min-h-screen antialiased">
        <Spine />
        <main className="min-h-screen md:pl-[72px] pb-16 md:pb-0">{children}</main>
      </body>
    </html>
  );
}
