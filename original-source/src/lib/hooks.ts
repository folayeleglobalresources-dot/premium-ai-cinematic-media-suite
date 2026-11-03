"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJSON } from "./api";
import { parseCube, type Lut3D } from "./cube";
import { BUILTIN_LOOKS } from "./looks";
import { DEFAULT_GRADE, DEFAULT_SETTINGS, mergeGrade, type AppSettings, type Grade, type Look } from "./types";

const LS_KEY = "obsidian.settings";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let local: Partial<AppSettings> = {};
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) local = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    setSettings((prev) => ({ ...prev, ...local }));
    fetchJSON<AppSettings>("/api/settings")
      .then((s) => {
        setSettings((prev) => ({ ...prev, ...s }));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(settings));
      localStorage.setItem("obsidian.accent", settings.accent);
      document.documentElement.setAttribute("data-accent", settings.accent);
      document.documentElement.toggleAttribute("data-reduce-motion", settings.reduceMotion);
    } catch {
      /* ignore */
    }
  }, [settings, loaded]);

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        fetchJSON("/api/settings", { method: "PUT", body: JSON.stringify(next) }).catch(() => null);
      }, 500);
      return next;
    });
  }, []);

  return { settings, update, loaded };
}

export type LookRowDTO = {
  id: number;
  name: string;
  category: string;
  description: string;
  grade: Record<string, number>;
  lutSize: number;
  swatch: string[];
};

export function useLooks() {
  const [custom, setCustom] = useState<Look[]>([]);
  const cubeCache = useRef(new Map<string, Lut3D>());

  const refresh = useCallback(async () => {
    try {
      const rows = await fetchJSON<LookRowDTO[]>("/api/looks");
      setCustom(
        rows.map((r) => ({
          id: `db:${r.id}`,
          name: r.name,
          category: r.category,
          description: r.description,
          grade: r.grade as Partial<Grade>,
          swatch: [r.swatch[0] ?? "#222", r.swatch[1] ?? "#888", r.swatch[2] ?? "#eee"],
          cubeText: r.lutSize > 0 ? `/api/looks/${r.id}/cube` : null,
        })),
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const all = useMemo(() => [...BUILTIN_LOOKS, ...custom], [custom]);

  const resolve = useCallback(
    (id: string | null | undefined): Look | undefined => (id ? all.find((l) => l.id === id) : undefined),
    [all],
  );

  const gradeFor = useCallback(
    (id: string | null | undefined, base: Grade = DEFAULT_GRADE): Grade => mergeGrade(base, resolve(id)?.grade),
    [resolve],
  );

  /** Load the 3D LUT for a look (if it has one). */
  const lutFor = useCallback(
    async (id: string | null | undefined): Promise<Lut3D | null> => {
      const look = resolve(id);
      if (!look?.cubeText) return null;
      const cached = cubeCache.current.get(look.id);
      if (cached) return cached;
      try {
        const text = await fetch(look.cubeText).then((r) => r.text());
        const lut = parseCube(text);
        cubeCache.current.set(look.id, lut);
        return lut;
      } catch {
        return null;
      }
    },
    [resolve],
  );

  const saveLook = useCallback(
    async (input: { name: string; category?: string; description?: string; grade?: Partial<Grade>; cubeText?: string; lutSize?: number; swatch?: string[] }) => {
      await fetchJSON("/api/looks", { method: "POST", body: JSON.stringify(input) });
      await refresh();
    },
    [refresh],
  );

  const deleteLook = useCallback(
    async (id: string) => {
      if (!id.startsWith("db:")) return;
      await fetchJSON(`/api/looks?id=${id.slice(3)}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  return { looks: all, custom, resolve, gradeFor, lutFor, saveLook, deleteLook, refresh };
}

export function useLocalState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setState(JSON.parse(raw) as T);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [key, state, ready]);
  return [state, setState] as const;
}
