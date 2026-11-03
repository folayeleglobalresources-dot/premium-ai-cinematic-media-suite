import { dominantHues, suggestGrade, type FrameStats } from "../../original-source/src/lib/analysis";
import { BUILTIN_LOOKS } from "../../original-source/src/lib/looks";
import type { Grade } from "./types";

export type SceneReading = {
  key: "low-key" | "mid-key" | "high-key";
  temperature: "warm" | "neutral" | "cool";
  contrast: "soft" | "balanced" | "hard";
  label: string;
  descriptors: string[];
  confidence: number;
};

export type AnalysisReport = {
  headline: string;
  score: number;
  scene: SceneReading;
  exposure: { verdict: string; ev: number; detail: string };
  whiteBalance: { verdict: string; kelvinShift: number; detail: string };
  color: string;
  focus: string;
  composition: string;
  lighting: string[];
  camera: { iso: string; shutter: string; aperture: string; nd: string; kelvin: string };
  grade: Partial<Grade>;
  gradeReasons: string[];
  looks: { id: string; name: string; why: string }[];
  notes: string;
  generatedBy: "aurum-engine" | "llm+aurum-engine";
};

const pick = <T,>(arr: T[], seed: number) => arr[Math.abs(Math.floor(seed)) % arr.length];

export function readScene(s: FrameStats): SceneReading {
  const key: SceneReading["key"] = s.meanLuma < 0.27 && s.darkRatio > 0.42 ? "low-key" : s.meanLuma > 0.58 ? "high-key" : "mid-key";
  const temperature: SceneReading["temperature"] = s.castTemp > 0.07 ? "warm" : s.castTemp < -0.06 ? "cool" : "neutral";
  const contrast: SceneReading["contrast"] = s.std > 0.27 ? "hard" : s.std < 0.14 ? "soft" : "balanced";
  const hues = dominantHues(s, 2);
  const descriptors: string[] = [];
  if (s.skinRatio > 0.07) descriptors.push("skin tones present — treat as a portrait/dialogue frame");
  if (s.edgeDensity > 0.16) descriptors.push("detail-dense, textured frame");
  else if (s.edgeDensity < 0.04) descriptors.push("soft, low-detail frame — defocus, haze or motion");
  if (s.colorfulness > 0.3) descriptors.push("vivid, chromatic palette");
  else if (s.colorfulness < 0.1) descriptors.push("near-monochromatic palette");
  if (hues.length) descriptors.push(`dominant hues: ${hues.map((h) => h.name).join(" & ")}`);
  if (s.dynamicRange > 0.9) descriptors.push("full dynamic range captured, toe to shoulder");
  const night = key === "low-key" && s.satMean > 0.3;
  const label = night
    ? "Night exterior with practical light sources"
    : key === "low-key" && temperature === "warm"
      ? "Low-key warm interior"
      : key === "low-key" && temperature === "cool"
        ? "Low-key cool / moonlit scene"
        : key === "high-key" && temperature === "cool"
          ? "High-key overcast or daylight scene"
          : key === "high-key" && temperature === "warm"
            ? "High-key golden light"
            : key === "high-key"
              ? "High-key neutral daylight"
              : temperature === "warm"
                ? "Balanced warm scene"
                : temperature === "cool"
                  ? "Balanced cool scene"
                  : "Balanced neutral scene";
  const confidence = Math.round(62 + Math.min(30, Math.abs(s.meanLuma - 0.45) * 60 + Math.abs(s.castTemp) * 120 + s.skinRatio * 80));
  return { key, temperature, contrast, label, descriptors, confidence: Math.min(96, confidence) };
}

export function recommendLooks(s: FrameStats, scene: SceneReading) {
  const scores = new Map<string, { score: number; why: string }>();
  const add = (id: string, score: number, why: string) => {
    const prev = scores.get(id);
    if (!prev || prev.score < score) scores.set(id, { score, why });
  };
  if (scene.key === "low-key" && scene.temperature !== "cool") {
    add("obsidian-noir", 0.9, "Low-key warmth suits deep polished blacks and champagne highlights.");
    add("golden-vision", 0.75, "Warm shadows take beautifully to film-negative warmth.");
  }
  if (scene.key === "low-key" && scene.temperature === "cool") {
    add("moonlit", 0.9, "Cool low-key light reads as night — a moonlight wash heightens it.");
    add("arctic-steel", 0.7, "Steel blue amplifies tension in cool shadows.");
  }
  if (scene.key === "high-key" && scene.temperature !== "warm") {
    add("nordic", 0.88, "Airy highlights and cool cast are the editorial pastel foundation.");
    add("overcast-film", 0.7, "Gentle warmth lifts flat daylight without betraying it.");
  }
  if (scene.key === "high-key" && scene.temperature === "warm") {
    add("wes-pastel", 0.85, "Bright warm light becomes storybook with pastel flattening.");
    add("golden-vision", 0.8, "Golden light wants a creamy motion-picture roll-off.");
  }
  if (s.skinRatio > 0.07) {
    add("teal-amber", 0.82, "Skin present — teal/amber separation makes faces pop from the background.");
    add("golden-vision", 0.78, "Film warmth flatters skin tones.");
  }
  if (scene.key === "low-key" && s.satMean > 0.3) add("neon-night", 0.86, "Saturated practicals in the dark: lean into the neon palette.");
  if (scene.contrast === "soft") add("hdr-pop", 0.65, "Flat light benefits from open shadows plus vibrance.");
  if (scene.contrast === "hard") add("bleach", 0.6, "Hard light already carries grit — silver bypass pushes it to texture.");
  if (s.colorfulness < 0.1) add("monochrome", 0.7, "The palette is already near-monochrome; commit to silver gelatin.");
  if (scene.temperature === "warm" && s.brightRatio > 0.25) add("desert-heat", 0.7, "Warm, bright highlights read as heat — ochre crush makes it cinematic.");
  add("anamorphic", 0.55, "A universally flattering wide-screen romance look.");
  add("natural", 0.4, "Keep a faithful reference pass for client review.");
  return Array.from(scores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 4)
    .map(([id, v]) => ({ id, name: BUILTIN_LOOKS.find((l) => l.id === id)?.name ?? id, why: v.why }));
}

export function composeReport(s: FrameStats, context?: { intent?: string; fps?: number }): AnalysisReport {
  const scene = readScene(s);
  const { grade, reasons } = suggestGrade(s);
  const ev = grade.exposure ?? 0;
  const seed = Math.round(s.meanLuma * 1000 + s.castTemp * 500 + s.std * 300);

  const exposureVerdict = Math.abs(ev) < 0.15 ? "On target" : ev > 0 ? (ev > 0.8 ? "Underexposed" : "Slightly under") : ev < -0.8 ? "Overexposed" : "Slightly over";
  const exposureDetail =
    s.clipHigh > 0.02
      ? `Highlights are clipping on ${(s.clipHigh * 100).toFixed(1)}% of the frame; the shoulder is gone there and no grade can bring it back. Protect it in camera.`
      : s.clipLow > 0.1
        ? `${(s.clipLow * 100).toFixed(0)}% of pixels sit at black. If this is intentional noir, keep it; otherwise add fill or raise ISO one stop.`
        : `Median luminance ${(s.p50 * 100).toFixed(0)}%, 5th–95th percentile spans ${(s.p5 * 100).toFixed(0)}–${(s.p95 * 100).toFixed(0)}%. ${s.dynamicRange > 0.85 ? "Full tonal range is in use." : "There is latitude to push contrast without clipping."}`;

  const kelvinShift = Math.round(-s.castTemp * 3200 / 100) * 100;
  const wbVerdict = Math.abs(s.castTemp) < 0.035 ? "Neutral" : s.castTemp > 0 ? "Warm cast" : "Cool cast";
  const wbDetail =
    Math.abs(s.castTemp) < 0.035
      ? "Greys are balanced; skin should render truthfully."
      : `The frame leans ${s.castTemp > 0 ? "amber" : "blue"}. Shift the camera white balance by roughly ${Math.abs(kelvinShift)}K ${kelvinShift > 0 ? "up" : "down"}, or keep it as a deliberate ${s.castTemp > 0 ? "tungsten" : "moonlight"} mood and compensate skin in the grade.${Math.abs(s.castTint) > 0.03 ? ` A ${s.castTint > 0 ? "green" : "magenta"} tint component suggests ${s.castTint > 0 ? "fluorescent/LED" : "mixed"} sources.` : ""}`;

  const hues = dominantHues(s, 3);
  const color = hues.length
    ? `Palette is built on ${hues.map((h) => h.name).join(", ")} with mean saturation ${(s.satMean * 100).toFixed(0)}%. ${s.colorfulness > 0.3 ? "That is vivid — complementary split-toning will organise it." : s.colorfulness < 0.1 ? "Near monochrome: shape it with tone, not hue." : "Balanced chroma; a subtle teal/amber separation will add depth."}`
    : `Chroma is minimal (${(s.satMean * 100).toFixed(0)}% mean saturation). Consider a monochrome or tonal look rather than chasing colour.`;

  const focus =
    s.edgeDensity > 0.16
      ? `Edge density ${(s.edgeDensity * 100).toFixed(0)}% — the frame is crisp. Avoid additional sharpening; add 1/8 diffusion if it feels clinical.`
      : s.edgeDensity < 0.04
        ? `Very low edge density (${(s.edgeDensity * 100).toFixed(1)}%). Either the subject is soft, the lens is wide open, or there is atmosphere. Enable focus peaking and confirm critical focus on the eyes.`
        : `Moderate detail (${(s.edgeDensity * 100).toFixed(0)}% edges) — healthy for a cinematic image with shallow depth of field.`;

  const t = s.thirds;
  const horiz = [t.left, t.center, t.right];
  const brightestH = horiz.indexOf(Math.max(...horiz));
  const vert = [t.top, t.middle, t.bottom];
  const brightestV = vert.indexOf(Math.max(...vert));
  const compositionBits: string[] = [];
  if (brightestH === 1 && t.center - Math.max(t.left, t.right) > 0.06) compositionBits.push("Luminance is centred — the eye lands in the middle. Embrace symmetry or offset the subject to a third for tension.");
  else if (brightestH !== 1) compositionBits.push(`Visual weight sits ${brightestH === 0 ? "camera-left" : "camera-right"} — give it lead room in the opposite direction.`);
  if (brightestV === 0 && t.top - t.middle > 0.12) compositionBits.push("The top third is hot (sky or practicals). Tilt down slightly or add an ND grad to keep attention on the subject.");
  if (brightestV === 2 && t.bottom - t.middle > 0.1) compositionBits.push("Foreground is brighter than the subject plane — flag it or use negative fill.");
  if (!compositionBits.length) compositionBits.push("Tonal weight is evenly distributed; the composition is stable. Use movement or a foreground element to add depth.");

  const lighting: string[] = [];
  if (scene.contrast === "soft") {
    lighting.push("Add negative fill (4×4 floppy) on the shadow side to carve shape into the subject.");
    lighting.push("Introduce a hard edge/back light at 3:1 to separate subject from background.");
  } else if (scene.contrast === "hard") {
    lighting.push("Soften the key through 1/2 grid cloth or bounce into an 8×8 ultrabounce.");
    lighting.push("Bring fill up to a 4:1 ratio unless noir is the intent.");
  } else {
    lighting.push("Ratios are healthy — refine with an eye light to put life in the eyes.");
  }
  if (scene.temperature === "warm") lighting.push("Mixed sources: gel daylight units 1/2 CTO or set camera to ~3800K to hold skin.");
  if (scene.temperature === "cool") lighting.push("Add a warm practical or 1/4 CTO on the key to prevent waxy skin.");
  if (s.clipHigh > 0.02) lighting.push("Scrim or dimmer the hottest source; move the subject 1m further from the window.");
  if (scene.key === "low-key") lighting.push("Use haze to let the beams of light read, and keep blacks deep by killing spill.");

  const base = scene.key === "low-key" ? 1600 : scene.key === "high-key" ? 200 : 800;
  const fps = context?.fps ?? 24;
  const shutter = `1/${Math.round(fps * 2)} (180°)`;
  const camera = {
    iso: `${base}${ev > 0.6 ? " → push one stop" : ev < -0.6 ? " → pull one stop" : ""}`,
    shutter,
    aperture: s.skinRatio > 0.07 ? "T2.0–T2.8 for subject isolation" : scene.key === "high-key" ? "T4–T5.6 for depth" : "T2.8",
    nd: scene.key === "high-key" ? (s.clipHigh > 0.01 ? "ND 1.2 (4 stops)" : "ND 0.9 (3 stops)") : "None",
    kelvin: `${Math.max(2800, Math.min(7500, 5600 + kelvinShift))}K`,
  };

  let score = 92;
  score -= Math.min(26, s.clipHigh * 500);
  score -= Math.min(14, Math.max(0, s.clipLow - 0.04) * 120);
  score -= Math.min(12, Math.abs(s.castTemp) * 90);
  score -= Math.min(10, Math.abs(ev) * 8);
  if (s.std < 0.12) score -= 8;
  if (s.edgeDensity < 0.03) score -= 6;
  if (s.skinRatio > 0.07) score += 3;
  score = Math.round(Math.max(38, Math.min(98, score)));

  const headline = pick(
    [
      `${scene.label}: ${exposureVerdict.toLowerCase()}, ${wbVerdict.toLowerCase()}.`,
      `${scene.label} — ${scene.contrast} contrast, ${wbVerdict.toLowerCase()}.`,
      `Reading: ${scene.label.toLowerCase()} with ${scene.contrast} light.`,
    ],
    seed,
  );

  const looksRec = recommendLooks(s, scene);
  const notes = [
    `This frame reads as a ${scene.label.toLowerCase()} (${scene.confidence}% confidence)${scene.descriptors.length ? ` — ${scene.descriptors.join("; ")}` : ""}.`,
    exposureVerdict === "On target" ? "Exposure is disciplined." : `Exposure is ${exposureVerdict.toLowerCase()} by about ${Math.abs(ev).toFixed(1)} stops.`,
    `For the grade, I would start with ${looksRec[0]?.name ?? "a neutral pass"}: ${looksRec[0]?.why ?? ""}`,
    reasons.length ? `Corrections I would apply before any creative look: ${reasons.slice(0, 2).map((r) => r.split(" — ")[0].split(":")[0]).join("; ")}.` : "No technical corrections are required; proceed straight to creative grading.",
    `Cinematic readiness: ${score}/100.`,
  ].join(" ");

  return {
    headline,
    score,
    scene,
    exposure: { verdict: exposureVerdict, ev, detail: exposureDetail },
    whiteBalance: { verdict: wbVerdict, kelvinShift, detail: wbDetail },
    color,
    focus,
    composition: compositionBits.join(" "),
    lighting,
    camera,
    grade,
    gradeReasons: reasons,
    looks: looksRec,
    notes,
    generatedBy: "aurum-engine",
  };
}

/* ------------------------------------------------------------------ */
/*  Director: script, beat sheet & shot list generation                 */
/* ------------------------------------------------------------------ */

export type DirectorInput = {
  logline: string;
  genre: string;
  mood: string;
  format: string;
  durationSec: number;
  aspect: string;
};

export type Shot = {
  num: number;
  beat: string;
  type: string;
  lens: string;
  movement: string;
  lighting: string;
  lookId: string;
  durationSec: number;
  note: string;
  sound: string;
};

export type DirectorPlan = {
  titles: string[];
  logline: string;
  synopsis: string;
  palette: { primary: string; secondary: string; accent: string; lookId: string; rationale: string };
  beats: { act: string; name: string; description: string; seconds: number }[];
  shots: Shot[];
  soundDesign: string[];
  gear: string[];
  schedule: string[];
  generatedBy: "aurum-engine" | "llm+aurum-engine";
};

function hashSeed(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

const GENRES: Record<string, { lookId: string; palette: [string, string, string]; lenses: string[]; motifs: string[]; sound: string[]; lighting: string[] }> = {
  thriller: { lookId: "arctic-steel", palette: ["#0f1a26", "#4c6a85", "#c9d6e2"], lenses: ["35mm", "50mm", "85mm", "135mm"], motifs: ["reflections", "half-lit faces", "locked doors", "watching from distance"], sound: ["sub-bass pulse", "ticking clock", "room tone with HVAC hum", "distant sirens"], lighting: ["single hard source, 8:1 ratio", "venetian blind pattern", "sodium practicals", "flickering fluorescent"] },
  drama: { lookId: "golden-vision", palette: ["#3a2a1c", "#c48b4a", "#f6dcae"], lenses: ["40mm", "50mm", "75mm"], motifs: ["hands", "windows at dusk", "unfinished meals", "letters"], sound: ["solo piano", "breath", "kettle", "rain on glass"], lighting: ["motivated window key, soft 3:1", "warm practical lamps", "overcast skylight"] },
  romance: { lookId: "velvet-rose", palette: ["#3b1f36", "#b96b86", "#f6d6d4"], lenses: ["50mm", "85mm", "100mm macro"], motifs: ["fabric in wind", "shared glances", "city lights bokeh", "fingertips"], sound: ["strings swell", "laughter off-screen", "vinyl crackle", "soft wind"], lighting: ["backlit golden hour", "candle practicals", "diffused bounce, 2:1"] },
  scifi: { lookId: "neon-night", palette: ["#2a0a3a", "#c0268f", "#5ce6ff"], lenses: ["18mm", "24mm", "40mm anamorphic"], motifs: ["geometry", "holograms", "wet asphalt", "silhouettes against glow"], sound: ["synth drone", "servo whirs", "data chatter", "cavernous reverb"], lighting: ["RGB tube practicals", "top light with haze", "cyan/magenta cross-key"] },
  horror: { lookId: "moonlit", palette: ["#070d1c", "#2a4a7a", "#a8c4e4"], lenses: ["21mm", "35mm", "85mm"], motifs: ["negative space", "doorways", "slow reveals", "mirrors"], sound: ["low drone", "creaking wood", "sudden silence", "whispered breath"], lighting: ["moonlight through trees", "flashlight only", "under-lit faces"] },
  documentary: { lookId: "overcast-film", palette: ["#3d4044", "#8b8f8e", "#e0dcd2"], lenses: ["24-70mm", "35mm", "70-200mm"], motifs: ["working hands", "environments", "archival textures", "vérité moments"], sound: ["natural ambience", "lavalier dialogue", "found sound", "sparse score"], lighting: ["available light", "one soft key for interviews", "window + bounce"] },
  commercial: { lookId: "hdr-pop", palette: ["#2e3f4f", "#4fa3b8", "#ffe7a8"], lenses: ["24mm", "50mm", "100mm macro", "probe lens"], motifs: ["product hero", "lifestyle beats", "texture macro", "slow-motion pour"], sound: ["upbeat percussive bed", "tactile foley", "whoosh transitions", "VO clarity"], lighting: ["large soft top source", "specular edge kicker", "clean white cyc"] },
  musicvideo: { lookId: "neon-night", palette: ["#1a0a2a", "#ff3d81", "#ffd166"], lenses: ["14mm", "24mm", "85mm"], motifs: ["performance", "strobe", "mirror rooms", "dance in rain"], sound: ["track-locked edits", "stutter cuts on beat", "reverse hits"], lighting: ["moving heads", "RGB wash", "silhouette on cyc"] },
  wedding: { lookId: "velvet-rose", palette: ["#4b3a3a", "#c9a27a", "#f7ead9"], lenses: ["35mm", "50mm", "85mm", "135mm"], motifs: ["rings", "dress detail", "first look", "golden hour portraits"], sound: ["vows as VO", "string quartet", "ambient laughter", "church reverb"], lighting: ["window light", "golden backlight", "fairy lights bokeh"] },
  action: { lookId: "teal-amber", palette: ["#0f3a44", "#1e7f8c", "#f0a64a"], lenses: ["18mm", "24mm", "35mm", "100mm"], motifs: ["impact frames", "whip pans", "shards of glass", "sweat & dust"], sound: ["impact design", "bass drops", "metal scrapes", "rapid breath"], lighting: ["hard sun with smoke", "sodium night", "muzzle flash hits"] },
  noir: { lookId: "obsidian-noir", palette: ["#0b0b0f", "#4a4542", "#d9c29a"], lenses: ["32mm", "50mm", "75mm"], motifs: ["cigarette smoke", "rain on neon", "venetian shadows", "a single lamp"], sound: ["muted trumpet", "rain", "footsteps on wet stone", "match strike"], lighting: ["low-key single hard key", "slash of light across eyes", "rim from practicals"] },
};

const SHOT_GRAMMAR: Record<string, { types: string[]; movement: string[]; sound: string[] }> = {
  Establish: { types: ["Extreme wide", "Wide aerial", "Wide static"], movement: ["slow push-in on dolly", "drone descent", "locked-off, let the light change"], sound: ["ambience rises from silence", "score motif enters under"] },
  Introduce: { types: ["Medium shot", "Medium close-up", "Low-angle medium"], movement: ["slider reveal from behind foreground", "steadicam follow", "slow 30° arc"], sound: ["footsteps, cloth, breath", "diegetic music source"] },
  Develop: { types: ["Over-the-shoulder", "Two-shot", "Close-up", "Insert"], movement: ["static with subtle handheld breath", "slow lateral dolly", "rack focus between subjects"], sound: ["dialogue clean, room tone bed", "score thins to single instrument"] },
  Tension: { types: ["Extreme close-up", "Dutch medium", "Wide with isolated subject", "POV"], movement: ["handheld, tightening", "slow zoom creep", "whip pan on action"], sound: ["low drone intensifies", "heartbeat-like pulse", "sudden drop-out"] },
  Climax: { types: ["Long-lens close-up", "Wide top-shot", "Tracking medium", "Impact insert"], movement: ["fast tracking on technocrane", "crash zoom", "120fps slow-motion"], sound: ["full score hit", "sub impact", "silence after the hit"] },
  Resolve: { types: ["Wide static", "Close-up, eyes", "Medium backlit", "Pull-out wide"], movement: ["slow pull-back on dolly", "locked, hold on the empty frame", "gentle crane up"], sound: ["motif resolves to a single note", "wind, then nothing"] },
};

export function generateDirectorPlan(input: DirectorInput): DirectorPlan {
  const key = Object.keys(GENRES).find((k) => input.genre.toLowerCase().replace(/[^a-z]/g, "").includes(k)) ?? (input.format.toLowerCase().includes("comm") ? "commercial" : input.format.toLowerCase().includes("doc") ? "documentary" : input.format.toLowerCase().includes("music") ? "musicvideo" : input.format.toLowerCase().includes("wed") ? "wedding" : "drama");
  const g = GENRES[key];
  const seedBase = hashSeed(input.logline + input.genre + input.mood + input.format);
  const rand = rng(seedBase);
  const subject = input.logline.split(/[,.;—-]/)[0].trim().replace(/^(a|an|the)\s+/i, "") || "the protagonist";
  const moodWord = input.mood || "restrained";
  const dur = Math.max(15, input.durationSec || 90);

  const titles = [
    `${subject.split(" ").slice(-1)[0][0]?.toUpperCase()}${subject.split(" ").slice(-1)[0].slice(1)}`,
    pick(["Afterlight", "The Quiet Hour", "Vantage", "Still Water", "Northern Signal", "Ash & Honey", "Terminal Velvet", "Last Exposure", "Meridian", "Gilded Static"], seedBase),
    `${moodWord[0]?.toUpperCase() ?? ""}${moodWord.slice(1)} ${pick(["Frames", "Hours", "Light", "Corridor", "Season"], seedBase >> 3)}`,
  ];

  const beatsTemplate = dur < 45
    ? [["I", "Establish"], ["I", "Introduce"], ["II", "Tension"], ["III", "Climax"], ["III", "Resolve"]]
    : [["I", "Establish"], ["I", "Introduce"], ["II", "Develop"], ["II", "Tension"], ["II", "Develop"], ["III", "Climax"], ["III", "Resolve"]];
  const weights = beatsTemplate.map(([, b]) => (b === "Develop" ? 1.3 : b === "Climax" ? 1.2 : b === "Establish" || b === "Resolve" ? 0.7 : 1));
  const wSum = weights.reduce((a, b) => a + b, 0);
  const beats = beatsTemplate.map(([act, name], i) => {
    const descriptions: Record<string, string> = {
      Establish: `Open on the world of ${subject}: ${pick(g.motifs, seedBase + i)} under ${pick(g.lighting, seedBase + i * 7)}. Say nothing; let texture speak.`,
      Introduce: `Meet ${subject} mid-action. Reveal character through a task, not exposition. Keep the ${moodWord} tone.`,
      Develop: `Complicate the want. A detail — ${pick(g.motifs, seedBase + i * 3)} — hints at the cost ahead.`,
      Tension: `Pressure mounts. Coverage tightens, cuts quicken, the palette cools toward ${g.palette[0]}.`,
      Climax: `The decision. One sustained shot carries the turn; sound drops to breath before the hit.`,
      Resolve: `Aftermath in a wide frame. Return to the opening motif, transformed. Hold two beats longer than comfortable.`,
    };
    return {
      act: `Act ${act}`,
      name,
      seconds: Math.round((dur * weights[i]) / wSum),
      description: descriptions[name] ?? "",
    };
  });

  const shots: Shot[] = [];
  let num = 1;
  for (const beat of beats) {
    const grammar = SHOT_GRAMMAR[beat.name];
    const avg = beat.name === "Tension" || beat.name === "Climax" ? 2.2 : beat.name === "Establish" ? 5 : 3.4;
    const count = Math.max(1, Math.round(beat.seconds / avg));
    let remaining = beat.seconds;
    for (let i = 0; i < count; i++) {
      const d = i === count - 1 ? Math.max(1, remaining) : Math.max(1, Math.round(avg * (0.7 + rand() * 0.6)));
      remaining -= d;
      shots.push({
        num: num++,
        beat: beat.name,
        type: pick(grammar.types, Math.floor(rand() * 1000)),
        lens: pick(g.lenses, Math.floor(rand() * 1000)),
        movement: pick(grammar.movement, Math.floor(rand() * 1000)),
        lighting: pick(g.lighting, Math.floor(rand() * 1000)),
        lookId: beat.name === "Tension" && key !== "horror" ? "arctic-steel" : beat.name === "Resolve" && key !== "thriller" ? "golden-vision" : g.lookId,
        durationSec: d,
        note: pick(
          [
            `Motif: ${pick(g.motifs, Math.floor(rand() * 1000))}.`,
            `Frame ${subject} ${pick(["off-centre, lead room right", "dead centre, symmetrical", "small in frame, environment dominant", "tight, eyes on the upper third"], Math.floor(rand() * 1000))}.`,
            `${input.aspect} framing — protect headroom for the ${input.aspect === "2.39:1" ? "scope" : "deliverable"} crop.`,
            `Shutter 180°, ${beat.name === "Climax" ? "overcrank to 48/60fps" : "native frame rate"}.`,
          ],
          Math.floor(rand() * 1000),
        ),
        sound: pick(grammar.sound.concat(g.sound), Math.floor(rand() * 1000)),
      });
    }
  }

  const synopsis = `${input.logline.trim().replace(/\.$/, "")}. Told in ${beats.length} beats over ${Math.round(dur / 60 * 10) / 10} minutes, the piece is ${moodWord} in temperament and ${key} in grammar: ${g.motifs.slice(0, 2).join(" and ")} recur as visual anchors while the palette moves from ${g.palette[2]} highlights to ${g.palette[0]} shadows as pressure builds. Coverage favours ${g.lenses[Math.min(1, g.lenses.length - 1)]} for intimacy and ${g.lenses[0]} for scale.`;

  return {
    titles,
    logline: input.logline.trim(),
    synopsis,
    palette: {
      primary: g.palette[0],
      secondary: g.palette[1],
      accent: g.palette[2],
      lookId: g.lookId,
      rationale: `${BUILTIN_LOOKS.find((l) => l.id === g.lookId)?.name ?? g.lookId} anchors the ${key} register; shift toward Arctic Steel in tension beats and resolve into warmth.`,
    },
    beats,
    shots,
    soundDesign: Array.from(new Set(g.sound)).map((s, i) => `${["Bed", "Texture", "Accent", "Silence"][i % 4]}: ${s}`),
    gear: [
      `Primes: ${g.lenses.join(", ")} — matched set, T2.0 or faster`,
      input.aspect === "2.39:1" ? "Anamorphic 2x or 2.39 frame-line crop; oval bokeh welcome" : "Spherical set, clean rendering",
      "Camera: 10-bit log capture, 180° shutter, 24fps base (overcrank for climax)",
      "Filtration: Black Pro-Mist 1/8, ND set 0.3–1.2",
      "Lighting: 1× 600W daylight COB, 2× RGB tubes, 4×4 floppy, 8×8 ultrabounce, haze",
      "Audio: boom + 2 lavaliers, 32-bit float recorder",
      "Grip: slider 1m, dolly track 6m, 12ft jib",
    ],
    schedule: [
      "Day 1 — Blocking rehearsal, lighting tests, LUT lock (Studio: bake preview LUT).",
      `Day 2 — Acts I & II interiors (${shots.filter((s) => s.beat !== "Climax" && s.beat !== "Resolve").length} setups).`,
      `Day 3 — Climax + Resolve at golden hour (${shots.filter((s) => s.beat === "Climax" || s.beat === "Resolve").length} setups), pickups, ambience recording.`,
      "Post — Auto-edit assembly in the Editor, Director's grade pass, sound design, mastering to 4K + 1080p + social 9:16.",
    ],
    generatedBy: "aurum-engine",
  };
}
