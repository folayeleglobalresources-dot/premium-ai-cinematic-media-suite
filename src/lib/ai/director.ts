import { getLook, LOOKS, matchLooks } from "../looks";
import { FORMAT_PRESETS, type MotionPreset, type TitlePreset, type TransitionType } from "../types";

export type Target = "all" | "selected";

export type GradeNumericKey =
  | "exposure" | "contrast" | "saturation" | "vibrance" | "temperature" | "tint" | "highlights" | "shadows"
  | "hue" | "fade" | "vignette" | "grain" | "sharpen" | "halation" | "bloom" | "chromatic";

export type DirectorAction =
  | { type: "applyLook"; look: string; amount?: number; target?: Target }
  | { type: "adjustGrade"; patch: Partial<Record<GradeNumericKey, number>>; mode?: "add" | "set"; target?: Target }
  | { type: "mono"; on: boolean; target?: Target }
  | { type: "resetGrade"; target?: Target }
  | { type: "setFormat"; preset: string }
  | { type: "letterbox"; ratio: number | null }
  | { type: "finishing"; grain?: number; vignette?: number }
  | { type: "addTitle"; text: string; subtitle?: string; preset: TitlePreset; at: "start" | "end" | "playhead"; duration?: number }
  | { type: "transitions"; transition: TransitionType; duration: number; target?: Target }
  | { type: "speed"; speed: number; target?: Target }
  | { type: "motion"; motion: MotionPreset; target?: Target }
  | { type: "volume"; gainDb: number; track?: "dialogue" | "music" | "all"; mute?: boolean }
  | { type: "fades"; fadeIn: number; fadeOut: number }
  | { type: "removeSilences"; aggressiveness?: number }
  | { type: "beatSync" }
  | { type: "detectScenes" }
  | { type: "autoColor"; target?: Target }
  | { type: "matchColor" }
  | { type: "smartReframe" }
  | { type: "trimTo"; seconds: number }
  | { type: "autoEdit"; style: "trailer" | "montage" | "social" | "documentary"; seconds?: number }
  | { type: "captions"; visible?: boolean; style?: "cinema" | "social" | "broadcast" }
  | { type: "marker"; label: string }
  | { type: "deliver"; preset: string }
  | { type: "undo" };

export interface DirectorContext {
  projectName: string;
  aspect: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  clipCount: number;
  videoClips: number;
  audioClips: number;
  titleCount: number;
  selectedCount: number;
  looks: string[];
  hasMusic: boolean;
  letterbox: number | null;
  captions: number;
  transitions: number;
}

export interface DirectorReply {
  reply: string;
  actions: DirectorAction[];
  suggestions: string[];
  engine: string;
}

export const DELIVER_PRESETS = [
  { id: "master", label: "Cinema Master", detail: "Project resolution · 40 Mbps · highest quality", mbps: 40, scale: 1, format: null as string | null },
  { id: "youtube", label: "YouTube 4K", detail: "3840×2160 · 35 Mbps", mbps: 35, scale: 0, format: "uhd" },
  { id: "youtube-hd", label: "YouTube / Vimeo HD", detail: "1920×1080 · 12 Mbps", mbps: 12, scale: 0, format: "hd" },
  { id: "vertical", label: "TikTok · Reels · Shorts", detail: "1080×1920 · 10 Mbps", mbps: 10, scale: 0, format: "vertical" },
  { id: "instagram", label: "Instagram Feed", detail: "1080×1350 · 8 Mbps", mbps: 8, scale: 0, format: "portrait" },
  { id: "square", label: "Square Social", detail: "1080×1080 · 8 Mbps", mbps: 8, scale: 0, format: "square" },
  { id: "review", label: "Client Review", detail: "Half resolution · 5 Mbps · fast", mbps: 5, scale: 0.5, format: null },
];

/* ───────────────────────── helpers ───────────────────────── */

const PROTECT = ["black and white", "teal and orange", "rock and roll", "salt and pepper", "fade in and out", "in and out", "back and forth"];

function intensity(s: string): number {
  if (/\b(slightly|a little|a bit|a touch|subtle|subtly|gently|touch of|hint of|mild)\b/.test(s)) return 0.5;
  if (/\b(much|very|really|way|a lot|lots|strong|strongly|heavy|heavily|extreme|extremely|massively|super|dramatic(ally)?)\b/.test(s)) return 1.6;
  return 1;
}

function percent(s: string): number | null {
  const m = s.match(/(\d{1,3})\s?%/);
  return m ? Math.min(150, Number(m[1])) / 100 : null;
}

function seconds(s: string): number | null {
  const m = s.match(/(\d+(?:\.\d+)?)\s*(seconds?|secs?|s\b|minutes?|mins?|m\b)/);
  if (!m) return null;
  const v = Number(m[1]);
  return /^m/.test(m[2]) ? v * 60 : v;
}

function target(s: string): Target {
  return /\b(this|selected|selection|current clip|this clip|this shot|these)\b/.test(s) ? "selected" : "all";
}

function titleText(raw: string, clause: string): string | null {
  const q = raw.match(/["“”'‘’]([^"“”'‘’]{1,80})["“”'‘’]/);
  if (q) return q[1].trim();
  const m = clause.match(/\b(?:saying|says|that says|reading|reads|called|named|titled|with the text|with text|text)\s+(.{2,60})$/);
  if (m) return m[1].replace(/\b(at the (start|end|beginning)|to the (start|end)|on screen|please)\b/g, "").trim();
  return null;
}

function capFirst(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cap(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ───────────────────────── core NLU ───────────────────────── */

export function localDirector(input: string, ctx: DirectorContext): DirectorReply {
  const raw = input.trim();
  let text = ` ${raw.toLowerCase()} `;
  for (const p of PROTECT) text = text.split(p).join(p.replace(/ /g, "_"));
  const clauses = text
    .split(/\s*(?:,|;|\.(?!\d)|\bthen\b|\band then\b|\bafter that\b|\balso\b|\bplus\b|\band\b)\s*/)
    .map((c) => c.replace(/_/g, " ").trim())
    .filter(Boolean);
  const actions: DirectorAction[] = [];
  const notes: string[] = [];
  const whole = text.replace(/_/g, " ");

  const isQuestion = /^\s*(what|which|how|should|could|recommend|suggest|any ideas|ideas|advice|help me choose)\b/.test(raw.toLowerCase()) && !/\b(make|apply|add|give|set|do)\b.*\b(it|this|them)\b/.test(whole);

  if (/^\s*(hi|hello|hey|yo|good (morning|evening|afternoon))\b/.test(raw.toLowerCase()) && raw.length < 25) {
    return {
      reply: `Good to have you in the suite. I'm your AI Director — I can grade, cut, title, reframe and deliver "${ctx.projectName}". Tell me the feeling you want, or reference a film you love.`,
      actions: [],
      suggestions: baseSuggestions(ctx),
      engine: "lumiere-local",
    };
  }

  if (/\b(what can you do|help|capabilities|how do (i|you) use)\b/.test(whole) && raw.length < 60) {
    return {
      reply:
        "I direct in plain language. Grade (\"make it feel like Blade Runner 2049\", \"warmer, crush the blacks\"), cut (\"remove the silences\", \"cut to the beat\", \"detect scenes\"), restructure (\"build a 30 second trailer\", \"make it vertical for TikTok\"), finish (\"add a 2.39 letterbox and film grain\", \"title it 'The Last Light'\") and deliver (\"export for YouTube 4K\"). Chain as many instructions as you like in one sentence.",
      actions: [],
      suggestions: baseSuggestions(ctx),
      engine: "lumiere-local",
    };
  }

  if (isQuestion) {
    const recs = matchLooks(whole).slice(0, 3);
    const list = (recs.length ? recs.map((r) => r.look) : LOOKS.filter((l) => ["golden-vision", "teal-amber", "natural"].includes(l.id))).slice(0, 3);
    return {
      reply: `For that, I'd consider: ${list
        .map((l) => `**${l.name}** — ${l.description}`)
        .join("; ")}. Pick one and I'll apply it, then we can refine contrast and skin tones together.`,
      actions: [],
      suggestions: list.map((l) => `Apply ${l.name}`),
      engine: "lumiere-local",
    };
  }

  for (const c of clauses) {
    const k = intensity(c);
    const tgt = target(c);
    const s = ` ${c} `;

    if (/\b(undo|revert that|go back)\b/.test(s)) {
      actions.push({ type: "undo" });
      notes.push("Reverted the last change");
      continue;
    }
    if (/\b(reset|remove|clear|strip)\b.*\b(grade|grading|colou?r|look|filters?|lut)\b/.test(s)) {
      actions.push({ type: "resetGrade", target: tgt });
      notes.push("Returned the picture to a neutral, ungraded state");
      continue;
    }

    // Auto edits (trailer, montage)
    const autoStyle = /\b(trailer|teaser|promo)\b/.test(s) ? "trailer" : /\b(montage|highlight|highlights|recap|sizzle|best moments)\b/.test(s) ? "montage" : /\b(tiktok edit|social cut|reel edit|social edit|short form)\b/.test(s) ? "social" : /\b(documentary edit|doc edit)\b/.test(s) ? "documentary" : null;
    if (autoStyle && /\b(make|build|create|cut|edit|turn|generate|assemble)\b/.test(s)) {
      const secs = seconds(s) ?? (autoStyle === "trailer" ? 30 : autoStyle === "social" ? 20 : 45);
      actions.push({ type: "autoEdit", style: autoStyle, seconds: secs });
      notes.push(
        autoStyle === "trailer"
          ? `Assembled a ${secs}s trailer: energy-ranked moments, dip-to-black rhythm, a scope letterbox and a closing title card`
          : `Built a ${secs}s ${autoStyle} edit from the strongest moments in your footage`,
      );
      continue;
    }

    // Format / aspect
    const fmt =
      /\b(vertical|tiktok|reels?|shorts|9:16|portrait mode|stories)\b/.test(s) ? "vertical"
      : /\b(square|1:1)\b/.test(s) ? "square"
      : /\b(4:5|instagram feed|insta feed)\b/.test(s) ? "portrait"
      : /\b(4k cinema|dci)\b/.test(s) ? "dci4k"
      : /\b(uhd|4k)\b/.test(s) && /\b(format|resolution|make|convert|switch)\b/.test(s) ? "uhd"
      : /\b(16:9|landscape|horizontal|youtube format|widescreen format)\b/.test(s) ? "hd"
      : /\bimax\b/.test(s) && /\b(format|make|convert)\b/.test(s) ? "imax"
      : /\b(4:3|academy|boxy)\b/.test(s) ? "academy"
      : null;
    if (fmt && /\b(make|convert|reformat|format|switch|turn|change|for|resize|go)\b/.test(s) && !/\bexport|render|deliver\b/.test(s)) {
      const p = FORMAT_PRESETS.find((f) => f.id === fmt)!;
      actions.push({ type: "setFormat", preset: fmt });
      if (fmt === "vertical" || fmt === "square" || fmt === "portrait") {
        actions.push({ type: "smartReframe" });
        notes.push(`Reformatted to ${p.label} (${p.width}×${p.height}) and ran Smart Reframe so every subject stays composed`);
      } else notes.push(`Reformatted the canvas to ${p.label} (${p.width}×${p.height} · ${p.aspect})`);
      continue;
    }

    // Deliver
    if (/\b(export|render|deliver|master|publish|output)\b/.test(s)) {
      const preset = /\b(tiktok|reels?|shorts|vertical)\b/.test(s) ? "vertical" : /\b(instagram|insta)\b/.test(s) ? "instagram" : /\b(4k|uhd)\b/.test(s) ? "youtube" : /\b(youtube|vimeo|hd)\b/.test(s) ? "youtube-hd" : /\b(review|client|draft|preview)\b/.test(s) ? "review" : "master";
      actions.push({ type: "deliver", preset });
      notes.push(`Opened Deliver with the ${DELIVER_PRESETS.find((d) => d.id === preset)!.label} preset`);
      continue;
    }

    // Letterbox
    if (/\b(letterbox|letter box|bars|anamorphic|scope|cinemascope|2\.39|2\.35|1\.85|2\.76|widescreen)\b/.test(s)) {
      if (/\b(remove|no|without|off|kill|lose)\b/.test(s)) {
        actions.push({ type: "letterbox", ratio: null });
        notes.push("Removed the letterbox");
      } else {
        const m = s.match(/([12]\.\d{2})/);
        const ratio = m ? Number(m[1]) : /1\.85/.test(s) ? 1.85 : 2.39;
        actions.push({ type: "letterbox", ratio });
        notes.push(`Matted the frame to ${ratio.toFixed(2)}:1 ${ratio >= 2.3 ? "anamorphic scope" : "theatrical"} letterbox`);
      }
      if (!/\b(look|grade|colou?r|style|feel)\b/.test(s)) continue;
    }

    // Titles
    if (/\b(title|titles|text|heading|intro card|opening card|credits?|lower third|lower-third|end card|chapter|caption card|name card|super)\b/.test(s) && /\b(add|put|create|insert|write|make|give|place|title it|call it)\b/.test(s) || /\btitle it\b|\bcall it\b/.test(s)) {
      const preset: TitlePreset = /lower.?third|name card|\bsuper\b/.test(s) ? "lower-third" : /\bcredits?\b/.test(s) ? "credits" : /\bchapter\b/.test(s) ? "chapter" : /\b(epic|trailer)\b/.test(s) ? "epic" : /\bneon\b/.test(s) ? "neon" : /\b(documentary|location|slug)\b/.test(s) ? "documentary" : /\bminimal\b/.test(s) ? "minimal" : /\b(kinetic|bold|punchy)\b/.test(s) ? "kinetic" : "cinematic";
      const at = /\b(end|outro|closing|finale|last)\b/.test(s) || preset === "credits" ? "end" : /\b(here|playhead|now|this point)\b/.test(s) ? "playhead" : "start";
      const txt = titleText(raw, c) ?? (at === "end" ? (preset === "credits" ? ctx.projectName : "THE END") : preset === "lower-third" ? "Name Surname" : ctx.projectName);
      actions.push({ type: "addTitle", text: preset === "lower-third" ? cap(txt) : txt, preset, at, duration: preset === "credits" ? 6 : 4 });
      notes.push(`Set a ${preset.replace("-", " ")} title "${txt}" at the ${at === "playhead" ? "playhead" : at}`);
      continue;
    }

    // Captions
    if (/\b(captions?|subtitles?|subs)\b/.test(s)) {
      const off = /\b(hide|remove|off|disable|no)\b/.test(s);
      const style = /\b(social|tiktok|bold)\b/.test(s) ? "social" : /\b(broadcast|tv|news)\b/.test(s) ? "broadcast" : /\b(cinema|film|elegant)\b/.test(s) ? "cinema" : undefined;
      actions.push({ type: "captions", visible: !off, style });
      notes.push(off ? "Hid burned-in captions" : `Enabled ${style ?? "cinema"} captions${ctx.captions ? "" : " — record with Live Captions in Capture to generate a transcript"}`);
      continue;
    }

    // Silence removal
    if (/\b(silence|silences|silent|dead air|pauses|tighten|jump ?cuts?|ums|filler)\b/.test(s)) {
      actions.push({ type: "removeSilences", aggressiveness: k });
      notes.push("Analysed the dialogue envelope and rippled out the dead air");
      continue;
    }

    // Beat sync
    if (/\b(beat|beats|rhythm|to the music|on the music|music sync|sync to|bpm|tempo)\b/.test(s)) {
      actions.push({ type: "beatSync" });
      notes.push(ctx.hasMusic ? "Tracked the score's tempo and conformed every cut to the beat grid" : "Queued beat-sync — add a music cue on A2 so I can lock cuts to its tempo");
      continue;
    }

    if (/\b(detect|find|split|auto.?split)\b.*\b(scenes?|cuts?|shots?)\b|\bscene detection\b/.test(s)) {
      actions.push({ type: "detectScenes" });
      notes.push("Scanned for scene changes and split clips at each cut point");
      continue;
    }

    if (/\b(reframe|smart crop|auto ?crop|keep (the )?subject|centre the subject|center the subject|follow the subject)\b/.test(s)) {
      actions.push({ type: "smartReframe" });
      notes.push("Ran Smart Reframe — each shot now tracks its visual centre of interest");
      continue;
    }

    if (/\b(match|consistent|continuity|same colou?r|unify)\b.*\b(colou?rs?|shots?|clips?|grade|look)?\b/.test(s) && /\b(match|consistent|continuity|unify)\b/.test(s)) {
      actions.push({ type: "matchColor" });
      notes.push("Shot-matched every clip to your hero shot using a statistical ASC-CDL transfer");
      continue;
    }

    if (/\b(auto ?colou?r|colou?r correct|correct the colou?r|fix the colou?rs?|white balance|auto balance|balance|fix exposure|correct exposure|normali[sz]e)\b/.test(s)) {
      actions.push({ type: "autoColor", target: tgt });
      notes.push("Measured each shot and neutralised casts, normalised exposure to 18% grey and restored contrast");
      continue;
    }

    // Trim
    const tm = s.match(/\b(make it|cut it( down)? to|trim( it)? to|shorten( it)? to|under|keep it to|no longer than)\s+(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?)\b/);
    if (tm) {
      const v = Number(tm[5]) * (/^m/.test(tm[6]) ? 60 : 1);
      actions.push({ type: "trimTo", seconds: v });
      notes.push(`Conformed the cut to ${v}s by proportionally tightening every shot`);
      continue;
    }

    // Speed
    const xm = s.match(/(\d+(?:\.\d+)?)\s?x\b/);
    if (/\b(slow.?mo|slow motion|slow it down|slower|half speed|super slow|speed up|faster|double speed|time.?lapse|real.?time|normal speed|speed ramp)\b/.test(s) || (xm && /\bspeed|play|x\b/.test(s))) {
      const speed = xm ? Number(xm[1]) : /super slow/.test(s) ? 0.25 : /slow|half/.test(s) ? 0.5 : /time.?lapse/.test(s) ? 4 : /real.?time|normal/.test(s) ? 1 : 2;
      actions.push({ type: "speed", speed, target: tgt });
      notes.push(speed < 1 ? `Retimed to ${Math.round(speed * 100)}% with frame blending for slow motion` : speed === 1 ? "Returned clips to real time" : `Sped up to ${speed}×`);
      continue;
    }

    // Motion
    const motion: MotionPreset | null = /\b(ken burns|slow zoom|zoom in slowly|push.?in|dolly in|creep in)\b/.test(s) ? "zoomIn" : /\b(zoom out|pull out|pull back|dolly out)\b/.test(s) ? "zoomOut" : /\bpan left\b/.test(s) ? "panLeft" : /\bpan right\b/.test(s) ? "panRight" : /\b(handheld|shaky|camera shake|documentary feel)\b/.test(s) ? "drift" : /\b(crane|rise up|drift up)\b/.test(s) ? "drift" : /\bpunch.?in\b/.test(s) ? "zoomIn" : /\b(stabili[sz]e|lock(ed)? off|remove motion)\b/.test(s) ? "none" : null;
    if (motion) {
      actions.push({ type: "motion", motion, target: tgt });
      notes.push(motion === "none" ? "Locked off all virtual camera moves" : `Added a ${motion.replace("-", " ")} virtual camera move`);
      continue;
    }

    // Transitions & fades
    if (/\b(fade (in|out)|fade from black|fade to black at the end|fade up|fade the (start|end))\b/.test(s) && !/\btransitions?\b/.test(s)) {
      actions.push({ type: "fades", fadeIn: /\bout\b|end/.test(s) && !/\bin\b/.test(s) ? 0 : 1.2, fadeOut: /\bin\b|from black|fade up/.test(s) && !/\bout\b/.test(s) ? 0 : 1.5 });
      notes.push("Faded the picture and sound up from black and out to black");
      continue;
    }
    const tr: TransitionType | null = /\b(dip to black|fade to black|black dip)\b/.test(s) ? "dip-black" : /\b(dip to white|white flash|fade to white)\b/.test(s) ? "dip-white" : /\bflash\b/.test(s) ? "flash" : /\bglitch\b/.test(s) ? "glitch" : /\bwipe\b/.test(s) ? (/\bright\b/.test(s) ? "wipe-right" : "wipe-left") : /\b(zoom transition|whip|zoom through)\b/.test(s) ? "zoom" : /\bslide\b/.test(s) ? "slide-up" : /\biris\b/.test(s) ? "iris" : /\bblur\b/.test(s) && /\btransitions?\b/.test(s) ? "blur" : /\b(dissolve|crossfade|cross.?fade|transitions?|smooth cuts)\b/.test(s) ? "dissolve" : null;
    if (tr) {
      const dur = seconds(s) ?? (/\b(quick|fast|snappy)\b/.test(s) ? 0.35 : /\b(slow|long|gentle)\b/.test(s) ? 1.5 : 0.8);
      actions.push({ type: "transitions", transition: tr, duration: dur, target: tgt });
      notes.push(`Laid ${tr.replace("-", " ")} transitions (${dur}s) between ${tgt === "selected" ? "the selected" : "all"} shots`);
      continue;
    }

    // Audio
    if (/\b(louder|quieter|softer audio|turn (it )?up|turn (it )?down|volume|mute|unmute|duck|ducking|lower the music|music down|music up|boost)\b/.test(s)) {
      const track = /\b(music|score|song|soundtrack)\b/.test(s) ? "music" : /\b(dialogue|voice|vocals?|speech|interview)\b/.test(s) ? "dialogue" : "all";
      const mute = /\bmute\b/.test(s) && !/\bunmute\b/.test(s);
      const db = /\b(duck|ducking)\b/.test(s) ? -10 : /\b(louder|up|boost)\b/.test(s) ? 4 * k : -6 * k;
      actions.push({ type: "volume", gainDb: mute ? -90 : db, track, mute });
      notes.push(mute ? `Muted the ${track} tracks` : `${db > 0 ? "Raised" : "Lowered"} ${track} by ${Math.abs(Math.round(db))} dB`);
      continue;
    }

    // Markers
    if (/\b(marker|bookmark|mark this)\b/.test(s)) {
      const m = c.match(/\b(?:called|named|for|labelled|labeled)\s+(.{2,40})$/);
      actions.push({ type: "marker", label: m ? cap(m[1]) : "Note" });
      notes.push("Dropped a marker at the playhead");
      continue;
    }

    // Looks (+ finishing words in the same clause, e.g. "Wes Anderson with subtle grain")
    const grainM = s.match(/\b(subtle|light|fine|soft|gentle|a touch of|a bit of|some|heavy|strong|thick|lots of)?\s*(?:35mm\s+|16mm\s+|film\s+)?grain\b/);
    const sLook = grainM ? s.replace(grainM[0], " ") : s;
    const kLook = intensity(sLook);
    const looks = matchLooks(sLook);
    const pct = percent(s);
    const cinematicGeneric = /\b(cinematic|film look|movie look|filmic|like a movie|like a film|hollywood|premium|luxur(y|ious)|expensive)\b/.test(s);
    if (looks.length && looks[0].score >= 3) {
      const look = looks[0].look;
      const amount = pct ?? (kLook === 0.5 ? 0.55 : kLook > 1 ? 1.25 : 1);
      actions.push({ type: "applyLook", look: look.id, amount, target: tgt });
      notes.push(`Graded ${tgt === "selected" ? "the selected shots" : "the timeline"} with **${look.name}** at ${Math.round(amount * 100)}% — it ${look.rationale}`);
      if (cinematicGeneric && !ctx.letterbox && !actions.some((a) => a.type === "letterbox")) {
        actions.push({ type: "letterbox", ratio: 2.39 });
        notes.push("Added a 2.39:1 scope matte for theatrical framing");
      }
      if (grainM || /\bvignett\w*/.test(s)) {
        const adj = grainM?.[1] ?? "";
        const grain = grainM ? (/subtle|light|fine|soft|gentle|touch|bit/.test(adj) ? 0.12 : /heavy|strong|thick|lots/.test(adj) ? 0.4 : 0.22) : undefined;
        actions.push({ type: "finishing", grain, vignette: /\bvignett\w*/.test(s) ? 0.3 : undefined });
        notes.push(`Finished with ${grain ? `${grain < 0.2 ? "a whisper of" : grain > 0.3 ? "heavy" : "organic"} 35mm grain` : ""}${grain && /vignett/.test(s) ? " and " : ""}${/vignett/.test(s) ? "an optical vignette" : ""}`);
      }
      continue;
    }
    if (cinematicGeneric) {
      actions.push({ type: "applyLook", look: "kodak2383", amount: 0.9, target: tgt });
      if (!ctx.letterbox) actions.push({ type: "letterbox", ratio: 2.39 });
      actions.push({ type: "finishing", grain: 0.18, vignette: 0.22 });
      notes.push("Applied a Kodak 2383 print emulation, a 2.39:1 scope matte, fine 35mm grain and a soft optical vignette — the foundations of a theatrical image");
      continue;
    }

    // Granular grade
    const patch: Partial<Record<GradeNumericKey, number>> = {};
    const said: string[] = [];
    if (/\b(brighter|brighten|lighter|lift exposure|more exposure|too dark|expose up|increase exposure|open up)\b/.test(s)) { patch.exposure = 0.4 * k; said.push(`opened exposure +${(0.4 * k).toFixed(1)} stops`); }
    if (/\b(darker|darken|too bright|underexpose|less exposure|decrease exposure|stop down|moodier|moody)\b/.test(s)) { patch.exposure = -0.4 * k; said.push(`stopped down ${(0.4 * k).toFixed(1)} stops`); }
    if (/\b(warmer|warm it|warm up|more orange|more yellow|warmth|warm)\b/.test(s)) { patch.temperature = 0.25 * k; said.push("warmed the white balance"); }
    if (/\b(cooler|colder|cool it|cool down|more blue|icy|cold|cool)\b/.test(s)) { patch.temperature = -0.25 * k; said.push("cooled the white balance"); }
    if (/\b(more contrast|punchier|punchy|crisper|pop|harder)\b/.test(s)) { patch.contrast = 0.15 * k; said.push("deepened contrast"); }
    if (/\b(less contrast|flatter|flat|softer contrast|low contrast)\b/.test(s)) { patch.contrast = -0.12 * k; said.push("flattened contrast"); }
    if (/\b(more saturat\w*|more colou?r|vivid|vibrant|richer|saturate)\b/.test(s)) { patch.saturation = 0.2 * k; said.push("enriched saturation"); }
    if (/\b(desaturat\w*|less colou?r|muted|washed|subdued)\b/.test(s)) { patch.saturation = -0.25 * k; said.push("muted saturation"); }
    if (/\b(black and white|monochrome|grayscale|greyscale|b&w)\b/.test(s)) {
      actions.push({ type: "mono", on: !/\b(remove|no|back to colou?r)\b/.test(s), target: tgt });
      said.push("rendered in monochrome");
    }
    if (/\b(crush(ed)? (the )?blacks|deeper blacks|inky|rich blacks)\b/.test(s)) { patch.shadows = -0.2 * k; said.push("crushed the blacks"); }
    if (/\b(lift(ed)? (the )?blacks|matte|faded|milky blacks|fade the blacks)\b/.test(s)) { patch.fade = 0.15 * k; said.push("lifted the blacks into a matte finish"); }
    if (/\b(recover|blown|clipping|roll off)\b.*\bhighlights?\b|\bhighlights? (down|lower)\b/.test(s)) { patch.highlights = -0.25 * k; said.push("recovered the highlights"); }
    if (/\b(open (the )?shadows|shadows up|brighter shadows|lift shadows)\b/.test(s)) { patch.shadows = 0.2 * k; said.push("opened the shadows"); }
    if (/\b(sharper|sharpen|more detail|crisp)\b/.test(s)) { patch.sharpen = 0.3 * k; said.push("added detail"); }
    if (/\b(glow|dreamy|diffusion|bloom|pro.?mist|soft focus)\b/.test(s)) { patch.bloom = 0.3 * k; said.push("added Pro-Mist style diffusion"); }
    if (/\bhalation\b/.test(s)) { patch.halation = 0.4 * k; said.push("added red film halation"); }
    if (/\b(chromatic|aberration|fringing|lens fringe)\b/.test(s)) { patch.chromatic = 0.35 * k; said.push("introduced lens chromatic aberration"); }
    if (/\bgreen(er)?\b/.test(s) && /\b(tint|more|push)\b/.test(s)) { patch.tint = -0.2 * k; said.push("pushed a green tint"); }
    if (/\b(magenta|pink)\b/.test(s) && /\b(tint|more|push)\b/.test(s)) { patch.tint = 0.2 * k; said.push("pushed a magenta tint"); }
    let fin: { grain?: number; vignette?: number } | null = null;
    if (/\b(grain|grainy|film grain|texture|noise)\b/.test(s)) {
      fin = { ...(fin ?? {}), grain: /\b(remove|no|less)\b/.test(s) ? 0 : 0.22 * k };
      said.push(fin.grain ? "added organic 35mm grain" : "removed grain");
    }
    if (/\bvignett\w*\b/.test(s)) {
      fin = { ...(fin ?? {}), vignette: /\b(remove|no|less)\b/.test(s) ? 0 : 0.3 * k };
      said.push(fin.vignette ? "closed the frame with an optical vignette" : "removed the vignette");
    }
    if (Object.keys(patch).length) actions.push({ type: "adjustGrade", patch, mode: "add", target: tgt });
    if (fin) actions.push({ type: "finishing", ...fin });
    if (said.length) {
      notes.push(capFirst(said.join(", ")));
      continue;
    }
  }

  const suggestions = followUps(actions, ctx);
  if (!actions.length) {
    return {
      reply: `I couldn't map that to an edit yet. Try describing a feeling ("make it moody and cold"), a reference ("like Wes Anderson"), or an operation ("remove the silences", "make a 30 second trailer", "export for TikTok"). Your timeline has ${ctx.clipCount} clip${ctx.clipCount === 1 ? "" : "s"} over ${Math.round(ctx.duration)}s.`,
      actions: [],
      suggestions: baseSuggestions(ctx),
      engine: "lumiere-local",
    };
  }
  const tip = proTip(actions, ctx);
  return {
    reply: `${notes.map((n) => (n.endsWith(".") ? n : `${n}.`)).join(" ")}${tip ? ` ${tip}` : ""}`,
    actions,
    suggestions,
    engine: "lumiere-local",
  };
}

function baseSuggestions(ctx: DirectorContext): string[] {
  const s = ["Make it cinematic", "Grade it like Blade Runner 2049", "Build a 30 second trailer"];
  if (ctx.audioClips) s.push("Remove the silences");
  if (ctx.hasMusic) s.push("Cut to the beat");
  if (ctx.aspect !== "9:16") s.push("Make it vertical for TikTok");
  s.push("Fix the colours and match all shots");
  return s.slice(0, 6);
}

function followUps(actions: DirectorAction[], ctx: DirectorContext): string[] {
  const out: string[] = [];
  const types = new Set(actions.map((a) => a.type));
  if (types.has("applyLook")) out.push("A little less intense", "Add film grain and halation", "Crush the blacks");
  if (!ctx.letterbox && !types.has("letterbox")) out.push("Add a 2.39 letterbox");
  if (!ctx.titleCount && !types.has("addTitle")) out.push(`Add an opening title "${ctx.projectName.toUpperCase()}"`);
  if (ctx.hasMusic && !types.has("beatSync")) out.push("Cut to the beat");
  if (!types.has("deliver")) out.push("Export for YouTube 4K");
  return [...new Set(out)].slice(0, 5);
}

function proTip(actions: DirectorAction[], ctx: DirectorContext): string {
  const types = new Set(actions.map((a) => a.type));
  if (types.has("applyLook") && !ctx.letterbox && !types.has("letterbox")) return "Director's note: a 2.39 matte would complete the theatrical feel.";
  if (types.has("autoEdit") && !ctx.hasMusic) return "Director's note: a score on A2 will let me lock the cut rhythm to the music.";
  if (types.has("setFormat") && actions.some((a) => a.type === "setFormat" && a.preset === "vertical")) return "Director's note: keep titles inside the centre safe zone for platform UI overlays.";
  if (ctx.videoClips > 3 && !ctx.transitions && !types.has("transitions")) return "Director's note: a few motivated dissolves would smooth the emotional beats.";
  return "";
}

/* ───────────────────────── validation (LLM output) ───────────────────────── */

const ACTION_TYPES = new Set([
  "applyLook", "adjustGrade", "mono", "resetGrade", "setFormat", "letterbox", "finishing", "addTitle", "transitions", "speed",
  "motion", "volume", "fades", "removeSilences", "beatSync", "detectScenes", "autoColor", "matchColor", "smartReframe",
  "trimTo", "autoEdit", "captions", "marker", "deliver", "undo",
]);

export function sanitizeActions(input: unknown): DirectorAction[] {
  if (!Array.isArray(input)) return [];
  const out: DirectorAction[] = [];
  for (const a of input) {
    if (!a || typeof a !== "object") continue;
    const t = (a as { type?: string }).type;
    if (!t || !ACTION_TYPES.has(t)) continue;
    if (t === "applyLook" && !getLook((a as { look?: string }).look)) continue;
    if (t === "setFormat" && !FORMAT_PRESETS.some((f) => f.id === (a as { preset?: string }).preset)) continue;
    out.push(a as DirectorAction);
  }
  return out.slice(0, 16);
}

export function directorSystemPrompt(ctx: DirectorContext): string {
  return `You are LUMIÈRE's AI Director — a world-class film editor, colourist and cinematographer embedded in a professional non-linear editor.
Translate the user's request into concrete edit actions and reply like a seasoned Hollywood post-production supervisor: concise, confident, specific about craft (lensing, colour science, rhythm). 
Return ONLY JSON: {"reply": string, "actions": Action[], "suggestions": string[] (3-5 short follow-up commands)}.
Action schema (TypeScript):
${`type Target = "all" | "selected";
{ type:"applyLook", look:LookId, amount?:0..1.5, target?:Target }
{ type:"adjustGrade", patch:{exposure?,contrast?,saturation?,vibrance?,temperature?,tint?,highlights?,shadows?,hue?,fade?,vignette?,grain?,sharpen?,halation?,bloom?,chromatic?}, mode:"add"|"set", target?:Target }  // exposure in stops (-2..2 add), contrast/saturation add deltas around 0 (e.g. 0.15), temperature/tint -1..1
{ type:"mono", on:boolean } | { type:"resetGrade" }
{ type:"setFormat", preset:${FORMAT_PRESETS.map((f) => `"${f.id}"`).join("|")} }
{ type:"letterbox", ratio:number|null } | { type:"finishing", grain?:0..1, vignette?:0..1 }
{ type:"addTitle", text, subtitle?, preset:"cinematic"|"epic"|"lower-third"|"chapter"|"credits"|"subtitle"|"neon"|"minimal"|"documentary"|"kinetic", at:"start"|"end"|"playhead", duration?:seconds }
{ type:"transitions", transition:"dissolve"|"dip-black"|"dip-white"|"wipe-left"|"wipe-right"|"slide-up"|"zoom"|"blur"|"iris"|"flash"|"glitch", duration:seconds }
{ type:"speed", speed:number } | { type:"motion", motion:"none"|"kenburns-in"|"kenburns-out"|"pan-left"|"pan-right"|"drift-up"|"handheld"|"punch-in" }
{ type:"volume", gainDb:number, track:"dialogue"|"music"|"all", mute?:boolean } | { type:"fades", fadeIn:seconds, fadeOut:seconds }
{ type:"removeSilences" } | { type:"beatSync" } | { type:"detectScenes" } | { type:"autoColor" } | { type:"matchColor" } | { type:"smartReframe" }
{ type:"trimTo", seconds } | { type:"autoEdit", style:"trailer"|"montage"|"social"|"documentary", seconds? }
{ type:"captions", visible?:boolean, style?:"cinema"|"social"|"broadcast" } | { type:"marker", label } | { type:"deliver", preset:${DELIVER_PRESETS.map((d) => `"${d.id}"`).join("|")} } | { type:"undo" }`}
LookId must be one of: ${LOOKS.map((l) => `${l.id} (${l.name} — ${l.reference})`).join("; ")}.
If the user asks a question or wants advice, return no actions and give an expert recommendation with suggestions.
Project context: ${JSON.stringify(ctx)}`;
}
