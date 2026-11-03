"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const items = [
  { href: "/", label: "Atelier", key: "atelier", icon: "M4 20V9l8-6 8 6v11h-5v-6H9v6H4z" },
  { href: "/studio", label: "Studio", key: "studio", icon: "M3 7h4l2-2h6l2 2h4v12H3V7zm9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" },
  { href: "/editor", label: "Cutting Room", key: "editor", icon: "M3 5h18v4H3V5zm0 6h10v4H3v-4zm12 0h6v4h-6v-4zM3 17h18v2H3v-2z" },
  { href: "/library", label: "Vault", key: "library", icon: "M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z" },
  { href: "/director", label: "Director", key: "director", icon: "M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z" },
  { href: "/settings", label: "Configure", key: "settings", icon: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.5 4l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6a8 8 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a8 8 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.7 1l.4 2.6h4l.4-2.6a8 8 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5a8 8 0 0 0 0-2z" },
];

export function Spine() {
  const pathname = usePathname();
  const [health, setHealth] = useState<"ok" | "down" | "checking">("checking");
  const [clock, setClock] = useState("");

  useEffect(() => {
    let alive = true;
    const check = () =>
      fetch("/api/health")
        .then((r) => r.json())
        .then((j) => alive && setHealth(j.ok ? "ok" : "down"))
        .catch(() => alive && setHealth("down"));
    check();
    const t = setInterval(check, 30000);
    const c = setInterval(() => {
      const d = new Date();
      setClock(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`);
    }, 1000);
    return () => {
      alive = false;
      clearInterval(t);
      clearInterval(c);
    };
  }, []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Desktop spine */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-[72px] z-50 flex-col items-center justify-between py-5 border-r border-white/[0.06] bg-[#0a0a0e]/90 backdrop-blur-xl">
        <Link href="/" className="group relative flex items-center justify-center w-11 h-11">
          <span className="absolute inset-0 border border-gold/40 rotate-45 transition-transform duration-700 group-hover:rotate-[135deg]" />
          <span className="display text-[20px] text-gold-bright leading-none">O</span>
        </Link>

        <nav className="flex flex-col items-center gap-1">
          {items.map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.key}
                href={it.href}
                title={it.label}
                className={`group relative flex items-center justify-center w-12 h-12 transition-colors ${active ? "text-gold-bright" : "text-muted hover:text-ivory"}`}
              >
                <span
                  className={`absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 transition-all ${active ? "bg-gold shadow-[0_0_12px_rgba(var(--accent-rgb),0.9)]" : "bg-transparent"}`}
                />
                <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="currentColor" aria-hidden>
                  <path d={it.icon} />
                </svg>
                <span className="pointer-events-none absolute left-[64px] px-3 py-1.5 glass-strong text-[10px] tracking-[0.25em] uppercase font-mono text-ivory opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0 whitespace-nowrap">
                  {it.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col items-center gap-3">
          <div className="readout text-[9px] text-muted [writing-mode:vertical-rl] rotate-180 tracking-[0.3em]">{clock}</div>
          <div className="relative flex items-center justify-center" title={health === "ok" ? "Engine online" : health === "down" ? "Engine offline" : "Checking"}>
            <span className={`w-1.5 h-1.5 rounded-full ${health === "ok" ? "bg-emerald-400 shadow-[0_0_10px_#34d399]" : health === "down" ? "bg-crimson" : "bg-muted"}`} />
          </div>
        </div>
      </aside>

      {/* Mobile bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch justify-around border-t border-white/[0.08] bg-[#0a0a0e]/95 backdrop-blur-xl h-16">
        {items.map((it) => {
          const active = isActive(it.href);
          return (
            <Link key={it.key} href={it.href} className={`flex flex-col items-center justify-center gap-1 flex-1 ${active ? "text-gold-bright" : "text-muted"}`}>
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
                <path d={it.icon} />
              </svg>
              <span className="text-[8px] tracking-[0.2em] uppercase font-mono">{it.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
