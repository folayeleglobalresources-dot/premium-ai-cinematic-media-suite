import { getLook, matchLooks } from "../looks";

export interface Shot {
  n: string;
  size: string;
  angle: string;
  movement: string;
  lens: string;
  subject: string;
  action: string;
  lighting: string;
  audio: string;
  duration: number;
}

export interface PlanScene {
  n: number;
  slug: string;
  beat: string;
  summary: string;
  mood: string;
  shots: Shot[];
}

export interface ShotPlan {
  title: string;
  logline: string;
  genre: string;
  tone: string;
  aspect: string;
  look: { id: string; name: string; rationale: string };
  palette: string[];
  cameraPackage: string;
  lensPackage: string;
  musicDirection: string;
  references: string[];
  scenes: PlanScene[];
  totalDuration: number;
  engine: string;
}

const GENRES: Record<string, { words: RegExp; look: string; aspect: string; time: string; loc: string; music: string; refs: string[]; lighting: string[]; tone: string }> = {
  thriller: { words: /\b(murder|detective|heist|chase|killer|crime|cop|thief|conspiracy|kidnap|hunt|revenge|spy|assassin|cartel)\b/, look: "sicario", aspect: "2.39:1", time: "NIGHT", loc: "rain-slicked city streets", music: "Low ostinato strings with sub-bass pulses; silence before every reveal (Jóhannsson, Reznor & Ross)", refs: ["Sicario", "Se7en", "Prisoners"], lighting: ["hard sodium-vapour practicals, deep negative fill", "single top light, faces half in shadow", "motivated streetlight through rain, 1/4 CTO"], tone: "taut, paranoid" },
  horror: { words: /\b(haunted|ghost|demon|terror|possessed|creature|monster|curse|nightmare|evil|witch|zombie)\b/, look: "horror", aspect: "2.39:1", time: "NIGHT", loc: "an isolated farmhouse", music: "Atonal drones, prepared piano, sudden absence of sound (Christopher Young, Colin Stetson)", refs: ["The Conjuring", "Hereditary", "The Witch"], lighting: ["underexposed 1.5 stops, single motivated candle source", "cold moonlight through windows, black corners", "flashlight-only practical, hard falloff"], tone: "dread-soaked, patient" },
  romance: { words: /\b(love|falls for|romance|wedding|heart|kiss|lovers|date|couple|soulmate|reunite)\b/, look: "romance", aspect: "1.85:1", time: "GOLDEN HOUR", loc: "a sun-dappled seaside town", music: "Intimate piano and strings, swelling at the turn (Justin Hurwitz, Dario Marianelli)", refs: ["Call Me by Your Name", "La La Land", "Before Sunrise"], lighting: ["soft key through 4×4 diffusion, warm practicals", "backlit golden sun with bounce fill", "window light, Pro-Mist 1/4 for halation"], tone: "tender, luminous" },
  action: { words: /\b(fight|explosion|mission|war|battle|soldier|escape|race|army|attack|rescue|showdown)\b/, look: "teal-orange", aspect: "2.39:1", time: "DAY", loc: "a sun-scorched industrial port", music: "Hybrid orchestra with taiko percussion and brass hits (Junkie XL, Hans Zimmer)", refs: ["Mad Max: Fury Road", "Mission: Impossible – Fallout", "John Wick"], lighting: ["high-contrast backlight through haze", "hard sun, negative fill for sculpted faces", "practical fire and sparks, tungsten edge light"], tone: "kinetic, relentless" },
  scifi: { words: /\b(space|future|robot|android|alien|planet|galaxy|time travel|ai\b|artificial intelligence|cyber|dystopia|spaceship|clone)\b/, look: "scifi", aspect: "2.39:1", time: "NIGHT", loc: "a brutalist research facility", music: "Analogue synth beds with processed choir (Vangelis, Jóhann Jóhannsson)", refs: ["Arrival", "Blade Runner 2049", "Ex Machina"], lighting: ["cool LED top-light panels, clinical white", "volumetric haze with hard rim light", "screen glow as key, deep teal shadows"], tone: "cerebral, awe-struck" },
  comedy: { words: /\b(funny|hilarious|awkward|comedy|prank|chaos|mishap|roommate|road trip)\b/, look: "wes", aspect: "1.85:1", time: "DAY", loc: "a pastel suburban street", music: "Pizzicato strings and playful woodwinds (Alexandre Desplat, Mark Mothersbaugh)", refs: ["The Grand Budapest Hotel", "Superbad", "Booksmart"], lighting: ["bright high-key, soft frontal fill", "even daylight, saturated production design", "toplight with warm practicals"], tone: "playful, precise" },
  documentary: { words: /\b(interview|true story|real|documentary|portrait of|behind the scenes|journey of|biography)\b/, look: "documentary", aspect: "16:9", time: "DAY", loc: "the subject's workshop", music: "Sparse ambient guitar and felt piano (Ólafur Arnalds)", refs: ["Free Solo", "Jiro Dreams of Sushi", "Chef's Table"], lighting: ["available window light with 1 negative fill", "single soft key 45°, practical background", "natural daylight, reflector bounce"], tone: "honest, intimate" },
  commercial: { words: /\b(product|brand|launch|advert|ad\b|commercial|campaign|perfume|watch|car|sneaker|luxury)\b/, look: "kodak2383", aspect: "16:9", time: "DAY", loc: "a minimalist marble studio", music: "Modern minimal electronica building to a logo sting", refs: ["Apple 'Shot on iPhone'", "Chanel N°5", "Rolex 'Perpetual'"], lighting: ["large overhead soft box, gradient falloff", "edge light on product, black flags for contrast", "slow light sweep across product surface"], tone: "aspirational, immaculate" },
  musicvideo: { words: /\b(song|band|singer|track|music video|rapper|album|dance|concert)\b/, look: "drive", aspect: "2.39:1", time: "NIGHT", loc: "a neon-lit underground club", music: "The artist's track; cut on the downbeat, hold on the hook", refs: ["The Weeknd 'Blinding Lights'", "Childish Gambino 'This Is America'", "Drive"], lighting: ["RGB neon practicals, coloured haze", "strobing backlight on the beat", "single hard spot, black void"], tone: "hypnotic, stylised" },
  drama: { words: /\b(family|grief|loss|struggle|father|mother|daughter|son|memory|secret|home|dying|redemption)\b/, look: "kodak2383", aspect: "1.85:1", time: "DUSK", loc: "a weathered family home", music: "Restrained cello and piano motifs (Max Richter, Nicholas Britell)", refs: ["Manchester by the Sea", "Moonlight", "Aftersun"], lighting: ["motivated window light, soft and directional", "practical lamps, warm pools in darkness", "overcast daylight, gentle contrast"], tone: "quiet, aching" },
};

const BEATS = [
  { beat: "Opening Image", mood: "establishing", sizes: ["EWS", "WS", "MCU"] },
  { beat: "Inciting Incident", mood: "disruption", sizes: ["MS", "OTS", "OTS", "CU", "INSERT"] },
  { beat: "Rising Tension", mood: "escalation", sizes: ["TRACKING", "POV", "MCU", "CU"] },
  { beat: "Climax", mood: "confrontation", sizes: ["LOW WS", "ECU", "CU", "WHIP", "INSERT", "WS"] },
  { beat: "Resolution", mood: "release", sizes: ["MS", "CU", "EWS"] },
];

const SIZE_INFO: Record<string, { label: string; lens: string; anam: string; dur: number; angle: string; move: string[] }> = {
  EWS: { label: "Extreme Wide", lens: "18mm", anam: "35mm anamorphic", dur: 5, angle: "High / aerial", move: ["Drone push-in", "Slow crane descent", "Static, locked-off"] },
  WS: { label: "Wide", lens: "24mm", anam: "40mm anamorphic", dur: 4, angle: "Eye level", move: ["Slow dolly in", "Static", "Lateral track"] },
  "LOW WS": { label: "Low Wide", lens: "21mm", anam: "40mm anamorphic", dur: 3, angle: "Low angle, heroic", move: ["Slow push-in", "Static"] },
  MS: { label: "Medium", lens: "35mm", anam: "50mm anamorphic", dur: 4, angle: "Eye level", move: ["Steadicam follow", "Static", "Subtle handheld"] },
  MCU: { label: "Medium Close-Up", lens: "50mm", anam: "75mm anamorphic", dur: 3.5, angle: "Eye level", move: ["Slow push-in", "Static"] },
  CU: { label: "Close-Up", lens: "85mm", anam: "100mm anamorphic", dur: 3, angle: "Slightly low", move: ["Static", "Imperceptible creep-in"] },
  ECU: { label: "Extreme Close-Up", lens: "100mm macro", anam: "100mm macro", dur: 2, angle: "Eye level", move: ["Static", "Rack focus"] },
  OTS: { label: "Over-the-Shoulder", lens: "50mm", anam: "75mm anamorphic", dur: 3.5, angle: "Eye level", move: ["Static", "Slow arc"] },
  POV: { label: "Point of View", lens: "28mm", anam: "40mm anamorphic", dur: 3, angle: "Subjective", move: ["Handheld", "Gimbal walk"] },
  INSERT: { label: "Insert", lens: "100mm macro", anam: "100mm macro", dur: 1.5, angle: "Top-down / detail", move: ["Static", "Slider reveal"] },
  TRACKING: { label: "Tracking", lens: "32mm", anam: "50mm anamorphic", dur: 5, angle: "Eye level", move: ["Dolly track alongside", "Steadicam lead"] },
  WHIP: { label: "Whip Pan", lens: "35mm", anam: "50mm anamorphic", dur: 1, angle: "Eye level", move: ["Whip pan to reveal"] },
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length) % arr.length];
}

export function detectGenre(text: string, hint?: string): string {
  if (hint && GENRES[hint]) return hint;
  const t = text.toLowerCase();
  let best = "drama", bestScore = 0;
  for (const [g, def] of Object.entries(GENRES)) {
    const m = t.match(new RegExp(def.words.source, "g"));
    const score = m ? m.length : 0;
    if (score > bestScore) { best = g; bestScore = score; }
  }
  return best;
}

export function localShotPlan(input: { title?: string; logline: string; genre?: string; tone?: string; shots?: number }): ShotPlan {
  const logline = input.logline.trim();
  const genre = detectGenre(logline, input.genre);
  const def = GENRES[genre];
  const r = hash(logline + genre);
  const lower = logline.toLowerCase();

  const charMatch = lower.match(/\b(?:a|an|the|two|three|young|old)\s+((?:[a-z-]+\s){0,2}?(?:detective|woman|man|girl|boy|soldier|chef|artist|mother|father|daughter|son|couple|stranger|scientist|kid|teenager|cop|thief|lawyer|doctor|singer|dancer|astronaut|robot|android|family|friends|brothers|sisters|king|queen|hero|teacher|student|journalist|pilot|driver|hacker|spy|nurse|priest|witch|widow|boxer|musician|photographer|founder|athlete|farmer|sailor|writer|painter|runner))\b/);
  const named = logline.match(/\b([A-Z][a-z]{2,})\b/g)?.filter((w, i) => i > 0 || !/^(A|An|The|When|After|In|On|Two)$/.test(w));
  const char = named?.[0] ?? (charMatch ? charMatch[1].trim() : "the protagonist");
  const locMatch = lower.match(/\b(?:in|at|inside|across|through|on)\s+(?:a|an|the)?\s*([a-z][a-z\s-]{3,32}?)(?=[,.;]|\s(?:where|when|who|while|as|and|to|until|after|before|must|finds?|discovers?)\b|$)/);
  const loc = locMatch ? locMatch[1].trim() : def.loc;
  const time = /\bnight|midnight|dark\b/.test(lower) ? "NIGHT" : /\bdawn|sunrise\b/.test(lower) ? "DAWN" : /\bdusk|sunset|twilight\b/.test(lower) ? "DUSK" : /\bmorning|day|afternoon|summer\b/.test(lower) ? "DAY" : def.time;
  const objMatch = lower.match(/\b(letter|photograph|photo|key|gun|knife|ring|phone|tape|map|briefcase|watch|necklace|book|diary|bag|car|camera|bottle|note|file|drive|box|painting)\b/);
  const obj = objMatch ? objMatch[1] : pick(["letter", "photograph", "key", "phone", "watch"], r);
  const intExt = /\b(street|city|forest|beach|desert|field|ocean|mountain|road|rooftop|port|sea|town|park|highway|village)\b/.test(loc) ? "EXT." : "INT.";
  const anamorphic = def.aspect === "2.39:1";
  const total = input.shots ?? 18;

  const lookMatch = matchLooks(`${logline} ${input.tone ?? ""} ${genre}`)[0]?.look;
  const look = lookMatch ?? getLook(def.look)!;
  const isNamed = Boolean(named?.[0]);
  const charCap = isNamed ? char : `the ${char}`;
  const subjectName = char.replace(/\b\w/g, (c) => c.toUpperCase());
  const locRef = /^(a|an|the)\b/i.test(loc) ? loc : `the ${loc}`;
  const sentenceCase = (txt: string) => txt.replace(/(^|[.!?]\s+)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());

  const describe = (size: string, beat: string): string => {
    const lines: Record<string, string[]> = {
      EWS: [`${locRef} at ${time.toLowerCase()} — ${charCap} is a small figure against the vastness`, `The world of the story: ${locRef}, still and indifferent`],
      WS: [`${charCap} enters frame, carrying the weight of the day`, `Geography of the scene — ${charCap} alone in ${locRef}`],
      "LOW WS": [`${charCap} squares up, silhouetted against the sky`, `${charCap} rises into frame, the decision made`],
      MS: [`${charCap} hesitates, then reaches for the ${obj}`, `${charCap} turns toward the sound`],
      MCU: [`We hold on ${charCap} — something has changed`, `${charCap}'s face registers the truth before words do`],
      CU: [`${charCap}'s eyes, wet, refusing to blink`, `A breath held — ${charCap} realises the cost`],
      ECU: [`Fingers tighten around the ${obj}`, `${charCap}'s pupil dilates in the reflected light`],
      OTS: [`Over ${charCap}'s shoulder: the other side of the conversation`, `Reverse — we see what ${charCap} sees`],
      POV: [`${charCap}'s POV: the corridor stretches ahead`, `Subjective — we become ${charCap}, moving toward the unknown`],
      INSERT: [`The ${obj} — the detail that changes everything`, `Insert: the ${obj}, catching a sliver of light`],
      TRACKING: [`Tracking alongside ${charCap} as the pace quickens`, `We move with ${charCap} through ${locRef}`],
      WHIP: [`Whip pan to reveal the threat`, `Whip to the source of the noise`],
    };
    const base = pick(lines[size] ?? lines.MS, r);
    if (beat === "Resolution" && size === "EWS") return sentenceCase(`Pull back to reveal ${locRef} — ${charCap} finally at rest. Hold for the final image.`);
    return sentenceCase(base);
  };

  const scenes: PlanScene[] = [];
  let count = 0;
  BEATS.forEach((b, i) => {
    const shots: Shot[] = [];
    const loopSizes = b.sizes;
    const per = Math.max(2, Math.round((total * loopSizes.length) / BEATS.reduce((a, x) => a + x.sizes.length, 0)));
    for (let j = 0; j < per; j++) {
      const size = loopSizes[j % loopSizes.length];
      const info = SIZE_INFO[size];
      count++;
      shots.push({
        n: `${i + 1}${String.fromCharCode(65 + j)}`,
        size: info.label,
        angle: genre === "thriller" && size === "MCU" && r() > 0.5 ? "Dutch tilt 10°" : info.angle,
        movement: pick(info.move, r),
        lens: anamorphic ? info.anam : info.lens,
        subject: ["INSERT", "EWS"].includes(size) ? (size === "INSERT" ? obj : loc) : subjectName,
        action: describe(size, b.beat),
        lighting: pick(def.lighting, r),
        audio: pick(
          size === "INSERT" ? ["Foley detail, close-mic'd", "Isolated sound design"] : size === "EWS" ? ["Ambience bed, wind and distant city", "Score enters softly"] : b.beat === "Climax" ? ["Score peaks — then drop to silence", "Heartbeat sub-bass, diegetic only"] : ["Clean boom dialogue, room tone 30s", "Lav backup, natural ambience"],
          r,
        ),
        duration: info.dur,
      });
    }
    scenes.push({
      n: i + 1,
      slug: `${i === 0 || i === 4 ? intExt : pick(["INT.", "EXT."], r)} ${loc.toUpperCase()} — ${i === 4 && time === "NIGHT" ? "DAWN" : time}`,
      beat: b.beat,
      summary: sentenceCase(
        i === 0 ? `We meet ${charCap} in ${locRef}. The world feels ${def.tone.split(",")[0]}.`
        : i === 1 ? `The ${obj} surfaces and ${charCap}'s life tilts off its axis.`
        : i === 2 ? `Pressure mounts; every choice narrows ${charCap}'s options.`
        : i === 3 ? `Confrontation. ${charCap} faces the truth the ${obj} revealed.`
        : `Aftermath. A new equilibrium — changed, but whole.`),
      mood: b.mood,
      shots,
    });
  });

  return {
    title: input.title?.trim() || (objMatch ? `The ${obj.replace(/^./, (c) => c.toUpperCase())}` : isNamed ? char : subjectName) + (genre === "documentary" ? ": A Portrait" : ""),
    logline,
    genre,
    tone: input.tone?.trim() || def.tone,
    aspect: def.aspect,
    look: { id: look.id, name: look.name, rationale: look.rationale },
    palette: look.swatch,
    cameraPackage: genre === "documentary" ? "Sony FX6 · FX3 B-cam · gimbal + shoulder rig" : genre === "musicvideo" ? "RED V-Raptor · Komodo crash cam" : "ARRI Alexa 35 · Alexa Mini LF B-cam",
    lensPackage: anamorphic ? "Panavision T-Series Anamorphic 35/40/50/75/100mm + 100mm macro" : "Cooke S7/i Full Frame Primes 18/25/35/50/85/100mm macro",
    musicDirection: def.music,
    references: [look.reference, ...def.refs].slice(0, 4),
    scenes,
    totalDuration: Math.round(scenes.reduce((a, s) => a + s.shots.reduce((x, y) => x + y.duration, 0), 0)),
    engine: "lumiere-local",
  };
}

export function shotPlanPrompt(): string {
  return `You are an Oscar-calibre director of photography and first AD. Given a logline, produce a production-ready shot plan.
Return ONLY JSON matching: {"title":string,"logline":string,"genre":string,"tone":string,"aspect":"2.39:1"|"1.85:1"|"16:9"|"9:16","look":{"id":string,"name":string,"rationale":string},"palette":[hex,hex,hex],"cameraPackage":string,"lensPackage":string,"musicDirection":string,"references":string[],"scenes":[{"n":number,"slug":"INT./EXT. LOCATION — TIME","beat":string,"summary":string,"mood":string,"shots":[{"n":"1A","size":string,"angle":string,"movement":string,"lens":string,"subject":string,"action":string,"lighting":string,"audio":string,"duration":number}]}],"totalDuration":number}
Use 4-6 scenes and 14-24 shots total. Be specific, visual and cinematic; motivate every lens and lighting choice.`;
}
