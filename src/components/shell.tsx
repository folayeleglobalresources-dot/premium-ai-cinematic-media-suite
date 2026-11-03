"use client";

import { Aperture, Archive, Clapperboard, Command, Feather, Film, Radio, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "./ui";

const NAV = [
  { href: "/", label: "Atelier", numeral: "I", icon: Sparkles },
  { href: "/capture", label: "Capture", numeral: "II", icon: Aperture },
  { href: "/live", label: "Broadcast", numeral: "III", icon: Radio },
  { href: "/editor", label: "Montage", numeral: "IV", icon: Film },
  { href: "/library", label: "Vault", numeral: "V", icon: Archive },
  { href: "/script", label: "Writers' Room", numeral: "VI", icon: Feather },
  { href: "/director", label: "AI Director", numeral: "VII", icon: Clapperboard },
];

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-label="Lumière">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="40" y2="40">
          <stop offset="0" stopColor="#f3dfb1" />
          <stop offset="0.5" stopColor="#d8b57a" />
          <stop offset="1" stopColor="#8a6a3e" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="18.5" stroke="url(#lg)" strokeWidth="1" />
      {Array.from({ length: 7 }).map((_, i) => {
        const a = (i / 7) * Math.PI * 2;
        const x1 = 20 + Math.cos(a) * 6, y1 = 20 + Math.sin(a) * 6;
        const x2 = 20 + Math.cos(a + 1.2) * 16, y2 = 20 + Math.sin(a + 1.2) * 16;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#lg)" strokeWidth="0.9" />;
      })}
      <circle cx="20" cy="20" r="3" fill="url(#lg)" />
    </svg>
  );
}

export function Rail() {
  const path = usePathname();
  if (path?.startsWith("/editor/")) return <RailInner path={path} compact />;
  return <RailInner path={path ?? "/"} />;
}

function RailInner({ path, compact }: { path: string; compact?: boolean }) {
  return (
    <nav className={cn("sticky top-0 z-40 flex h-screen shrink-0 flex-col items-center border-r border-line bg-ink-2/80 py-4 backdrop-blur-xl", compact ? "w-[60px]" : "w-[76px]")}>
      <Link href="/" className="mb-6 transition hover:rotate-[30deg] hover:scale-105" style={{ transitionDuration: "900ms" }}>
        <Logo size={compact ? 30 : 36} />
      </Link>
      <div className="flex flex-1 flex-col items-center gap-1.5">
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "group relative flex h-[54px] w-[54px] flex-col items-center justify-center gap-0.5 rounded-xl transition",
                active ? "bg-gold/[0.08] text-gold-hi" : "text-mist hover:bg-white/[0.03] hover:text-ivory",
              )}
            >
              {active && <span className="absolute -left-[11px] top-1/2 h-7 w-[2px] -translate-y-1/2 rounded-full bg-gold shadow-[0_0_12px_rgba(216,181,122,0.9)]" />}
              <span className="font-display text-[10px] italic leading-none opacity-70">{n.numeral}</span>
              <Icon size={18} strokeWidth={1.25} />
              <span className="pointer-events-none absolute left-[64px] top-1/2 z-50 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-full border border-line-2 bg-ink-3/95 px-3 py-1 font-display text-[15px] italic text-ivory opacity-0 shadow-xl transition group-hover:translate-x-0 group-hover:opacity-100">
                {n.label}
              </span>
            </Link>
          );
        })}
      </div>
      <button
        onClick={() => window.dispatchEvent(new Event("lumiere:palette"))}
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-line text-mist transition hover:border-gold/50 hover:text-gold"
        title="Command palette (⌘K)"
      >
        <Command size={15} strokeWidth={1.5} />
      </button>
      {!compact && <div className="vertical-word select-none font-display text-[13px] tracking-[0.5em] text-gold/25">LUMIÈRE · MMXXVI</div>}
    </nav>
  );
}

interface Cmd {
  id: string;
  label: string;
  hint: string;
  run: () => void | Promise<void>;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("lumiere:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("lumiere:palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setIdx(0);
    setTimeout(() => input.current?.focus(), 30);
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d: { projects: { id: string; name: string }[] }) => setProjects(d.projects.slice(0, 8)))
      .catch(() => null);
  }, [open]);

  const cmds = useMemo<Cmd[]>(() => {
    const go = (href: string) => () => router.push(href);
    const base: Cmd[] = [
      {
        id: "new",
        label: "New production",
        hint: "Create a project",
        run: async () => {
          const r = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Untitled Production" }) });
          const d = (await r.json()) as { project: { id: string } };
          router.push(`/editor/${d.project.id}`);
        },
      },
      ...NAV.map((n) => ({ id: n.href, label: `Go to ${n.label}`, hint: n.numeral, run: go(n.href) })),
      ...projects.map((p) => ({ id: p.id, label: p.name, hint: "Open project", run: go(`/editor/${p.id}`) })),
    ];
    const s = q.toLowerCase().trim();
    return s ? base.filter((c) => c.label.toLowerCase().includes(s)) : base;
  }, [q, projects, router]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center bg-black/60 pt-[14vh] backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
      <div className="lux-glass animate-rise w-full max-w-xl overflow-hidden rounded-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <Search size={16} className="text-gold" strokeWidth={1.5} />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setIdx((i) => Math.min(cmds.length - 1, i + 1));
              if (e.key === "ArrowUp") setIdx((i) => Math.max(0, i - 1));
              if (e.key === "Enter" && cmds[idx]) {
                void cmds[idx].run();
                setOpen(false);
              }
            }}
            placeholder="Search commands, rooms and productions…"
            className="flex-1 bg-transparent font-display text-xl italic text-ivory outline-none placeholder:text-smoke"
          />
        </div>
        <div className="max-h-[50vh] overflow-auto p-2 scroll-thin">
          {cmds.map((c, i) => (
            <button
              key={c.id}
              onMouseEnter={() => setIdx(i)}
              onClick={() => {
                void c.run();
                setOpen(false);
              }}
              className={cn("flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-left text-[13px] transition", i === idx ? "bg-gold/10 text-gold-hi" : "text-ivory/80")}
            >
              <span className="flex items-center gap-3">
                <Clapperboard size={14} strokeWidth={1.4} className="opacity-60" />
                {c.label}
              </span>
              <span className="text-[10.5px] uppercase tracking-[0.2em] text-smoke">{c.hint}</span>
            </button>
          ))}
          {!cmds.length && <div className="px-4 py-6 text-center text-[12px] text-smoke">No matches.</div>}
        </div>
      </div>
    </div>
  );
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; text: string; tone: string }[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; tone: string }>).detail;
      const id = ++n;
      setItems((s) => [...s.slice(-3), { id, ...d }]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 4600);
    };
    window.addEventListener("lumiere:toast", on);
    return () => window.removeEventListener("lumiere:toast", on);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[99] flex flex-col items-end gap-2">
      {items.map((t) => (
        <div key={t.id} className={cn("lux-glass animate-rise pointer-events-auto max-w-sm rounded-xl px-4 py-3 text-[12.5px] shadow-2xl", t.tone === "error" ? "border-ruby/50 text-[#ffb4bf]" : t.tone === "success" ? "border-gold/40 text-gold-hi" : "text-ivory")}>
          <span className="mr-2 inline-block h-1.5 w-1.5 -translate-y-px rotate-45 bg-current align-middle" />
          {t.text}
        </div>
      ))}
    </div>
  );
}

export { toast };
