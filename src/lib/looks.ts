import type { Grade, Wheel } from "./types";
import { clamp, hueToRgb, lerp } from "./utils";

export type LookParams = Partial<Omit<Grade, "look" | "lookAmount" | "lift" | "gamma" | "gain">> & {
  lift?: Wheel;
  gamma?: Wheel;
  gain?: Wheel;
};

export interface Look {
  id: string;
  name: string;
  category: "Blockbuster" | "Auteur" | "Film Stock" | "Monochrome" | "Genre" | "Era" | "Mood" | "Technical";
  reference: string;
  rationale: string;
  aliases: string[];
  swatch: [string, string, string];
  params: LookParams;
}

/** Build a wheel from a hue (deg, 0=red 60=yellow 120=green 180=cyan 240=blue 300=magenta) */
const w = (hue: number, amount: number, master = 0): Wheel => ({
  x: Math.cos((hue * Math.PI) / 180) * amount,
  y: Math.sin((hue * Math.PI) / 180) * amount,
  m: master,
});

export const LOOKS: Look[] = [
  {
    id: "teal-orange", name: "Blockbuster Teal & Orange", category: "Blockbuster", reference: "Transformers · Michael Bay",
    rationale: "pushes shadows toward teal while wrapping skin in warm orange — complementary contrast that makes faces leap off the frame",
    aliases: ["teal and orange", "teal orange", "blockbuster", "michael bay", "transformers", "hollywood", "action movie", "summer blockbuster", "marvel"],
    swatch: ["#0f3b47", "#6f7c74", "#f0a35e"],
    params: { lift: w(190, 0.42), gain: w(30, 0.28), saturation: 1.12, contrast: 1.12, vibrance: 0.1 },
  },
  {
    id: "bladerunner", name: "Replicant Amber", category: "Auteur", reference: "Blade Runner 2049 · Roger Deakins",
    rationale: "bathes the frame in a dense amber haze with compressed, smoky highlights — Deakins' irradiated Las Vegas palette",
    aliases: ["blade runner", "bladerunner", "deakins", "2049", "villeneuve", "dystopian", "orange haze", "cyberpunk desert"],
    swatch: ["#3a1a08", "#a2541e", "#ffb46b"],
    params: { temperature: 0.45, gain: w(28, 0.4), lift: w(20, 0.16, -0.02), contrast: 1.15, saturation: 0.85, fade: 0.05, highlights: -0.12, halation: 0.2, bloom: 0.15 },
  },
  {
    id: "matrix", name: "Digital Rain", category: "Blockbuster", reference: "The Matrix · Bill Pope",
    rationale: "infects the whole image with a cold phosphor green, flattening warmth to signal a simulated world",
    aliases: ["matrix", "green tint", "hacker", "simulation", "code", "neo", "wachowski"],
    swatch: ["#04140b", "#3c6a46", "#b6e6a8"],
    params: { tint: -0.45, gain: w(110, 0.32), lift: w(130, 0.26), saturation: 0.8, contrast: 1.2, sharpen: 0.15 },
  },
  {
    id: "wes", name: "Symmetry Pastel", category: "Auteur", reference: "The Grand Budapest Hotel · Wes Anderson",
    rationale: "lifts the blacks into a confectionery matte and pushes candy pinks and butter yellows — storybook, deliberate, symmetrical",
    aliases: ["wes anderson", "anderson", "grand budapest", "pastel", "symmetry", "whimsical", "storybook", "quirky", "moonrise kingdom"],
    swatch: ["#c9727f", "#e9c9a5", "#f6e7c1"],
    params: { saturation: 1.15, contrast: 0.9, fade: 0.14, gain: w(345, 0.2), gamma: w(48, 0.1), temperature: 0.15, vibrance: 0.3 },
  },
  {
    id: "noir", name: "Film Noir", category: "Monochrome", reference: "Sin City · Double Indemnity",
    rationale: "strips colour entirely and carves the frame with hard contrast, heavy vignetting and silver grain — light as a moral weapon",
    aliases: ["noir", "film noir", "black and white", "b&w", "detective", "sin city", "monochrome", "1940s", "hard boiled"],
    swatch: ["#050505", "#6b6b6b", "#f2f2f2"],
    params: { saturation: 0, contrast: 1.45, vignette: 0.5, grain: 0.35, shadows: -0.2 },
  },
  {
    id: "bleach", name: "Bleach Bypass", category: "Technical", reference: "Saving Private Ryan · Janusz Kamiński",
    rationale: "emulates skipping the bleach bath — silver retained, colour drained, contrast brutal; war-torn and tactile",
    aliases: ["bleach bypass", "bleach", "war", "saving private ryan", "gritty", "se7en", "seven", "fincher", "desaturated", "harsh"],
    swatch: ["#1b1d1c", "#7b7d74", "#e3e2d6"],
    params: { saturation: 0.45, contrast: 1.35, highlights: 0.05, grain: 0.25, sharpen: 0.25 },
  },
  {
    id: "kodak2383", name: "Kodak 2383 Print", category: "Film Stock", reference: "Vision Color Print Film 2383",
    rationale: "applies print-film response — dense toe, gentle highlight roll-off, warm mids and cyan-leaning shadows",
    aliases: ["kodak", "2383", "print film", "film emulation", "film look", "celluloid", "35mm", "filmic", "cinematic"],
    swatch: ["#10222a", "#7a6a55", "#f3d6a6"],
    params: { contrast: 1.15, gain: w(40, 0.12), lift: w(200, 0.1), saturation: 0.95, highlights: -0.15, fade: 0.03, grain: 0.15, halation: 0.1 },
  },
  {
    id: "portra", name: "Portra 400", category: "Film Stock", reference: "Kodak Portra 400",
    rationale: "renders skin with creamy warmth and pastel restraint — the portrait photographer's stock",
    aliases: ["portra", "portrait film", "kodak portra", "wedding", "skin tones", "soft film", "lifestyle"],
    swatch: ["#4a3a33", "#c8a084", "#f6e2cb"],
    params: { temperature: 0.18, saturation: 0.9, contrast: 0.92, fade: 0.08, gain: w(30, 0.1), grain: 0.2 },
  },
  {
    id: "velvia", name: "Velvia 50", category: "Film Stock", reference: "Fujichrome Velvia 50",
    rationale: "saturates landscapes into chromatic intensity — emerald greens and electric skies",
    aliases: ["velvia", "fuji", "fujifilm", "landscape", "nature", "vivid", "saturated", "travel"],
    swatch: ["#0c2a3d", "#2f8a4e", "#f4d35e"],
    params: { saturation: 1.4, contrast: 1.2, vibrance: 0.3, gamma: w(150, 0.05) },
  },
  {
    id: "cinestill", name: "Cinestill 800T", category: "Film Stock", reference: "Tungsten-balanced motion stock",
    rationale: "cools the night to tungsten blue while practical lights bleed red halation halos — nocturnal and romantic",
    aliases: ["cinestill", "800t", "tungsten", "night city", "halation", "night", "street lights", "neon night"],
    swatch: ["#08182b", "#3d5a78", "#ff7b5c"],
    params: { temperature: -0.35, halation: 0.7, grain: 0.35, saturation: 1.05, contrast: 1.05, lift: w(205, 0.15), bloom: 0.2 },
  },
  {
    id: "kodachrome", name: "Kodachrome 64", category: "Film Stock", reference: "Kodachrome · National Geographic",
    rationale: "punchy reds, deep blues and dense shadows — the archival colour of mid-century memory",
    aliases: ["kodachrome", "national geographic", "retro", "1960s", "1970s", "mid century", "vintage photo"],
    swatch: ["#13233f", "#9b4a32", "#f5d7a1"],
    params: { saturation: 1.2, contrast: 1.18, gain: w(20, 0.15), lift: w(225, 0.1), temperature: 0.1 },
  },
  {
    id: "hp5", name: "Ilford HP5", category: "Monochrome", reference: "Ilford HP5 Plus 400",
    rationale: "renders a classic reportage monochrome with open shadows and generous, organic grain",
    aliases: ["hp5", "ilford", "black and white film", "reportage", "street photography", "grainy black and white"],
    swatch: ["#151515", "#8a8a8a", "#ececec"],
    params: { saturation: 0, contrast: 1.2, grain: 0.45, fade: 0.04 },
  },
  {
    id: "technicolor", name: "Three-Strip Technicolor", category: "Era", reference: "The Wizard of Oz · Gone with the Wind",
    rationale: "dye-transfer saturation with jewel-like primaries — golden-age Hollywood opulence",
    aliases: ["technicolor", "three strip", "golden age", "wizard of oz", "classic hollywood", "1930s", "1950s", "musical"],
    swatch: ["#26103a", "#c3352b", "#f8d35a"],
    params: { saturation: 1.45, contrast: 1.15, vibrance: 0.4, gain: w(0, 0.1) },
  },
  {
    id: "dune", name: "Arrakis Sand", category: "Auteur", reference: "Dune · Greig Fraser",
    rationale: "mutes the palette to sun-bleached sand and dust, with soft, desaturated contrast — monumental and arid",
    aliases: ["dune", "arrakis", "greig fraser", "desert", "sand", "epic desert", "muted warm", "sci-fi epic"],
    swatch: ["#2e2219", "#a2846a", "#eedcc0"],
    params: { temperature: 0.25, saturation: 0.72, contrast: 1.05, fade: 0.06, gain: w(35, 0.2), lift: w(30, 0.08), highlights: -0.1 },
  },
  {
    id: "joker", name: "Gotham Decay", category: "Auteur", reference: "Joker · Lawrence Sher",
    rationale: "sickly sodium greens in the shadows against nicotine yellows — urban rot made visible",
    aliases: ["joker", "gotham", "phoenix", "sickly", "urban decay", "psychological", "unsettling"],
    swatch: ["#0e1f1a", "#5e6b4d", "#e3c27b"],
    params: { tint: -0.2, lift: w(160, 0.3), gain: w(50, 0.15), saturation: 0.85, contrast: 1.15, grain: 0.2 },
  },
  {
    id: "batman", name: "Crimson Noir", category: "Auteur", reference: "The Batman · Greig Fraser",
    rationale: "low-key exposure with red-orange sodium highlights swallowed by inky shadows — rain-soaked and brooding",
    aliases: ["batman", "the batman", "dark", "brooding", "low key", "moody", "dark red", "rain", "vigilante"],
    swatch: ["#070304", "#5a1d14", "#e2683c"],
    params: { exposure: -0.25, contrast: 1.25, saturation: 0.7, gain: w(15, 0.3), lift: w(5, 0.15, -0.03), vignette: 0.45, grain: 0.2, halation: 0.25 },
  },
  {
    id: "moonlight", name: "Moonlight Chroma", category: "Auteur", reference: "Moonlight · James Laxton",
    rationale: "luminous cyan and magenta wrapped around rich, glowing skin — lyrical colour as emotion",
    aliases: ["moonlight", "barry jenkins", "lyrical", "cyan magenta", "poetic", "intimate"],
    swatch: ["#0b2533", "#3f7f8f", "#d98ab4"],
    params: { saturation: 1.25, gamma: w(190, 0.15), gain: w(300, 0.12), lift: w(230, 0.15), contrast: 1.1 },
  },
  {
    id: "lalaland", name: "Technicolor Dream", category: "Auteur", reference: "La La Land · Linus Sandgren",
    rationale: "saturated primaries and a twilight violet sky — a love letter to the Hollywood musical",
    aliases: ["la la land", "lalaland", "musical", "dreamy", "romantic musical", "twilight", "magic hour"],
    swatch: ["#1e1846", "#5f4bb6", "#f7c35f"],
    params: { saturation: 1.35, vibrance: 0.35, gain: w(50, 0.1), lift: w(260, 0.12), bloom: 0.25 },
  },
  {
    id: "drive", name: "Neon Noir", category: "Auteur", reference: "Drive · Newton Thomas Sigel",
    rationale: "splits teal shadows against hot-pink highlights with a glowing bloom — synth-wave nights",
    aliases: ["drive", "neon", "synthwave", "refn", "retrowave", "80s neon", "nightclub", "neon noir", "miami"],
    swatch: ["#04212b", "#7a2c6f", "#ff5fb4"],
    params: { splitShadowHue: 190, splitShadowAmt: 0.3, splitHighHue: 320, splitHighAmt: 0.3, saturation: 1.2, contrast: 1.15, bloom: 0.3, grain: 0.1 },
  },
  {
    id: "wongkarwai", name: "In the Mood", category: "Auteur", reference: "Chungking Express · Christopher Doyle",
    rationale: "smeared greens and lacquer reds with halated practicals and grain — longing, humid, nocturnal",
    aliases: ["wong kar wai", "wong kar-wai", "chungking", "in the mood for love", "christopher doyle", "hong kong", "longing"],
    swatch: ["#0c2416", "#3f7a3b", "#e2433a"],
    params: { saturation: 1.3, gamma: w(115, 0.12), gain: w(10, 0.12), grain: 0.3, halation: 0.3, contrast: 1.1, chromatic: 0.15 },
  },
  {
    id: "amelie", name: "Montmartre Gold", category: "Auteur", reference: "Amélie · Bruno Delbonnel",
    rationale: "golden highlights, emerald mids and crimson accents — Parisian fairy-tale warmth",
    aliases: ["amelie", "amélie", "paris", "french", "jeunet", "whimsy", "fairy tale", "golden green"],
    swatch: ["#203018", "#7a8a2a", "#f2c14e"],
    params: { gain: w(45, 0.3), gamma: w(100, 0.15), lift: w(0, 0.08), saturation: 1.25, temperature: 0.2 },
  },
  {
    id: "schindler", name: "Spielberg Monochrome", category: "Monochrome", reference: "Schindler's List · Janusz Kamiński",
    rationale: "high-contrast documentary monochrome with luminous, blooming highlights — solemn and historical",
    aliases: ["schindler", "spielberg", "historical", "holocaust", "solemn", "documentary black and white"],
    swatch: ["#0b0b0b", "#777777", "#fafafa"],
    params: { saturation: 0, contrast: 1.35, grain: 0.3, bloom: 0.15, highlights: 0.1 },
  },
  {
    id: "oppenheimer", name: "Trinity 65mm", category: "Auteur", reference: "Oppenheimer · Hoyte van Hoytema",
    rationale: "warm large-format film density with rich blacks and gentle halation — IMAX gravitas",
    aliases: ["oppenheimer", "nolan", "christopher nolan", "imax", "65mm", "hoytema", "large format", "prestige"],
    swatch: ["#1c140e", "#8a6a4c", "#f1d2a2"],
    params: { temperature: 0.15, contrast: 1.12, saturation: 0.95, grain: 0.2, gain: w(35, 0.12), halation: 0.15, vignette: 0.2 },
  },
  {
    id: "revenant", name: "Natural Cold", category: "Auteur", reference: "The Revenant · Emmanuel Lubezki",
    rationale: "available-light realism — cold steel skies, restrained colour, honest highlight roll-off",
    aliases: ["revenant", "lubezki", "natural light", "cold", "winter", "survival", "wilderness", "icy", "snow"],
    swatch: ["#162027", "#6b7c86", "#dfe8ee"],
    params: { temperature: -0.3, saturation: 0.8, contrast: 1.05, lift: w(210, 0.12), highlights: -0.15 },
  },
  {
    id: "madmax", name: "Fury Road", category: "Blockbuster", reference: "Mad Max: Fury Road · John Seale",
    rationale: "radioactive orange earth under electric teal skies, crushed and sharpened — kinetic maximalism",
    aliases: ["mad max", "fury road", "post apocalyptic", "apocalypse", "wasteland", "extreme", "intense"],
    swatch: ["#0d3946", "#c0622a", "#ffc061"],
    params: { saturation: 1.35, contrast: 1.3, gain: w(30, 0.35), lift: w(195, 0.35), sharpen: 0.3 },
  },
  {
    id: "sicario", name: "Border Dusk", category: "Auteur", reference: "Sicario · Roger Deakins",
    rationale: "muted dusk tones with heavy, crushed shadows — tension expressed through restraint",
    aliases: ["sicario", "thriller", "tension", "border", "crime", "cartel", "tense"],
    swatch: ["#111619", "#5f5a4f", "#d9b88a"],
    params: { temperature: 0.1, saturation: 0.7, contrast: 1.2, gain: w(40, 0.15), lift: w(210, 0.12), shadows: -0.15 },
  },
  {
    id: "euphoria", name: "Glitter Purple", category: "Mood", reference: "Euphoria · Marcell Rév",
    rationale: "violet shadows and fuchsia highlights with dreamy bloom — Gen-Z neon melancholy",
    aliases: ["euphoria", "purple", "violet", "glitter", "party", "gen z", "teen drama", "dreamy neon"],
    swatch: ["#1d0a33", "#6a2f9a", "#ff8fd8"],
    params: { splitShadowHue: 270, splitShadowAmt: 0.35, splitHighHue: 320, splitHighAmt: 0.25, saturation: 1.2, bloom: 0.35, halation: 0.2 },
  },
  {
    id: "barbie", name: "Dreamhouse Pink", category: "Mood", reference: "Barbie · Rodrigo Prieto",
    rationale: "candy pink gain and plastic-perfect saturation — playful hyper-reality",
    aliases: ["barbie", "pink", "playful", "toy", "fashion", "girly", "candy"],
    swatch: ["#5a1f3d", "#e1729f", "#ffd1e6"],
    params: { tint: 0.3, gain: w(330, 0.25), saturation: 1.25, contrast: 0.95, fade: 0.05, bloom: 0.2 },
  },
  {
    id: "horror", name: "Conjuring Dread", category: "Genre", reference: "The Conjuring · John R. Leonetti",
    rationale: "starves the image of warmth, sinks the shadows and closes the frame — dread lives in the dark corners",
    aliases: ["horror", "scary", "creepy", "conjuring", "haunted", "dread", "terror", "spooky", "ghost"],
    swatch: ["#070b0a", "#3a4540", "#a9b3a5"],
    params: { exposure: -0.2, saturation: 0.55, tint: -0.12, lift: w(170, 0.2, -0.04), contrast: 1.25, vignette: 0.55, grain: 0.3 },
  },
  {
    id: "scifi", name: "Cold Future", category: "Genre", reference: "Arrival · Bradford Young",
    rationale: "overcast steel-blue restraint with milky blacks — cerebral, alien, quiet",
    aliases: ["sci fi", "scifi", "science fiction", "future", "futuristic", "arrival", "alien", "space", "clinical"],
    swatch: ["#0f1a22", "#5b7282", "#d6e2ea"],
    params: { temperature: -0.35, saturation: 0.75, contrast: 1.1, fade: 0.08, gain: w(200, 0.1), bloom: 0.15 },
  },
  {
    id: "vhs", name: "VHS 1989", category: "Era", reference: "Camcorder tape",
    rationale: "bleeding chroma, soft contrast and tape noise — nostalgic analogue imperfection",
    aliases: ["vhs", "camcorder", "tape", "analog", "analogue", "80s", "1980s", "glitch", "lo-fi", "lofi", "home video"],
    swatch: ["#1a1430", "#7d5b7a", "#e8d6b0"],
    params: { saturation: 1.15, contrast: 0.9, chromatic: 0.6, grain: 0.5, fade: 0.15, temperature: 0.05, bloom: 0.2 },
  },
  {
    id: "super8", name: "Super 8 Memory", category: "Era", reference: "Kodak Ektachrome Super 8",
    rationale: "warm faded colour, heavy grain and vignetted edges — a recovered family memory",
    aliases: ["super 8", "super8", "8mm", "16mm", "home movie", "memory", "flashback", "nostalgia", "nostalgic", "old film"],
    swatch: ["#2d1d12", "#a87a4b", "#f6dcae"],
    params: { temperature: 0.3, saturation: 1.1, grain: 0.7, vignette: 0.5, fade: 0.12, contrast: 1.05, halation: 0.3 },
  },
  {
    id: "golden", name: "Golden Hour", category: "Mood", reference: "Days of Heaven · Néstor Almendros",
    rationale: "low sun warmth, glowing highlights and soft bloom — magic-hour transcendence",
    aliases: ["golden hour", "sunset", "magic hour", "warm", "sunny", "summer", "days of heaven", "malick", "glow"],
    swatch: ["#3a210e", "#c7813f", "#ffd99a"],
    params: { temperature: 0.45, gain: w(38, 0.25), saturation: 1.1, bloom: 0.3, highlights: -0.05, halation: 0.15 },
  },
  {
    id: "romance", name: "Soft Romance", category: "Mood", reference: "Call Me by Your Name · Sayombhu Mukdeeprom",
    rationale: "gentle contrast, lifted shadows and rosy warmth with a soft diffusion glow",
    aliases: ["romance", "romantic", "love", "soft", "gentle", "tender", "love story", "dreamy"],
    swatch: ["#3c2a2c", "#c79a8f", "#fbe6da"],
    params: { contrast: 0.88, fade: 0.1, bloom: 0.35, temperature: 0.12, saturation: 0.95, gain: w(350, 0.1) },
  },
  {
    id: "documentary", name: "Vérité Natural", category: "Genre", reference: "Observational documentary",
    rationale: "faithful colour with crisp texture and a light grain — truthful without being clinical",
    aliases: ["documentary", "doc", "natural", "realistic", "vérité", "verite", "interview", "news", "journalism"],
    swatch: ["#1d2023", "#7f7a72", "#ebe6dc"],
    params: { contrast: 1.05, saturation: 0.95, sharpen: 0.2, grain: 0.1 },
  },
  {
    id: "arri709", name: "ARRI Rec.709", category: "Technical", reference: "LogC → Rec.709 display transform",
    rationale: "a clean, broadcast-safe base: filmic shoulder, faithful skin and balanced saturation",
    aliases: ["arri", "rec709", "rec 709", "log to rec", "clean", "neutral", "base grade", "normalize", "correct", "broadcast"],
    swatch: ["#1a1a1a", "#808080", "#f0f0f0"],
    params: { contrast: 1.18, saturation: 1.08, highlights: -0.12, shadows: 0.03 },
  },
  {
    id: "musicvideo", name: "Hyperpop", category: "Mood", reference: "Contemporary music video",
    rationale: "maximal saturation, chromatic fringing and glow — loud, glossy, unapologetic",
    aliases: ["music video", "hyperpop", "pop", "vibrant", "colorful", "colourful", "loud", "hype", "tiktok", "energetic"],
    swatch: ["#2a0b4a", "#ff3f8e", "#3ff0ff"],
    params: { saturation: 1.5, contrast: 1.2, chromatic: 0.3, bloom: 0.3, vibrance: 0.4 },
  },
  {
    id: "breakingbad", name: "Desert Filter", category: "Genre", reference: "Breaking Bad · Michael Slovis",
    rationale: "an unapologetic tobacco-yellow cast that radiates heat — instantly locates you south of the border",
    aliases: ["breaking bad", "mexico filter", "yellow", "yellow filter", "heat", "hot", "western", "desert heat"],
    swatch: ["#3a2a0a", "#b5872c", "#ffe08a"],
    params: { temperature: 0.6, tint: -0.05, saturation: 1.1, contrast: 1.15, gain: w(48, 0.3) },
  },
  {
    id: "gladiator", name: "Gladiator Steel", category: "Blockbuster", reference: "Gladiator · John Mathieson",
    rationale: "desaturated bronze and steel with a punchy, sculpted contrast — sweat, dust and glory",
    aliases: ["gladiator", "epic", "historical epic", "battle", "ridley scott", "ancient", "warrior", "300", "trailer"],
    swatch: ["#151b20", "#6f6250", "#e2c08f"],
    params: { saturation: 0.7, contrast: 1.25, gain: w(35, 0.2), lift: w(200, 0.15), grain: 0.2 },
  },
  {
    id: "interstellar", name: "Interstellar Dust", category: "Auteur", reference: "Interstellar · Hoyte van Hoytema",
    rationale: "dusty, faded warmth with photochemical texture — a planet running out of time",
    aliases: ["interstellar", "dust", "dusty", "space epic", "cosmic", "farm", "faded"],
    swatch: ["#2a241d", "#8f8371", "#e8dccb"],
    params: { temperature: 0.12, saturation: 0.8, fade: 0.05, contrast: 1.08, grain: 0.15 },
  },
  {
    id: "parasite", name: "Precision", category: "Auteur", reference: "Parasite · Hong Kyung-pyo",
    rationale: "controlled, architectural neutrality with a cool undertone — every surface intentional",
    aliases: ["parasite", "bong joon ho", "korean", "precise", "architectural", "satire", "modern"],
    swatch: ["#162022", "#6e7a70", "#e6e4d6"],
    params: { contrast: 1.08, saturation: 0.92, gain: w(80, 0.08), lift: w(190, 0.1), sharpen: 0.15 },
  },
  {
    id: "johnwick", name: "Continental Neon", category: "Blockbuster", reference: "John Wick · Dan Laustsen",
    rationale: "electric blue shadows and magenta highlights with luminous bloom — stylised action noir",
    aliases: ["john wick", "wick", "action noir", "assassin", "blue neon", "stylized action", "keanu"],
    swatch: ["#071433", "#3a3f9a", "#ff4fc2"],
    params: { splitShadowHue: 230, splitShadowAmt: 0.35, splitHighHue: 310, splitHighAmt: 0.2, contrast: 1.2, saturation: 1.15, bloom: 0.25 },
  },
];

export const LOOK_CATEGORIES = ["Blockbuster", "Auteur", "Film Stock", "Monochrome", "Genre", "Era", "Mood", "Technical"] as const;

export function getLook(id: string | null | undefined): Look | undefined {
  if (!id) return undefined;
  return LOOKS.find((l) => l.id === id);
}

/* ───────────────────── Grade resolution ───────────────────── */

export interface ResolvedGrade {
  exposure: number;
  contrast: number;
  pivot: number;
  saturation: number;
  vibrance: number;
  temperature: number;
  tint: number;
  highlights: number;
  shadows: number;
  hue: number;
  lift: [number, number, number];
  gamma: [number, number, number];
  gain: [number, number, number];
  slope: [number, number, number];
  offset: [number, number, number];
  power: [number, number, number];
  splitShadow: [number, number, number];
  splitHigh: [number, number, number];
  fade: number;
  vignette: number;
  grain: number;
  sharpen: number;
  halation: number;
  bloom: number;
  chromatic: number;
  mono: boolean;
}

export function wheelToRgb(wh: Wheel, chroma: number, master: number): [number, number, number] {
  const mag = Math.min(1, Math.hypot(wh.x, wh.y));
  const hue = (Math.atan2(wh.y, wh.x) * 180) / Math.PI;
  const c = hueToRgb(hue);
  const avg = (c[0] + c[1] + c[2]) / 3;
  return [
    (c[0] - avg) * mag * chroma + wh.m * master,
    (c[1] - avg) * mag * chroma + wh.m * master,
    (c[2] - avg) * mag * chroma + wh.m * master,
  ];
}

const addW = (a: Wheel, b: Wheel | undefined, k: number): Wheel =>
  b ? { x: a.x + b.x * k, y: a.y + b.y * k, m: a.m + b.m * k } : a;

/** Merge user grade with its look (scaled by lookAmount) into a flat, shader-ready grade. */
export function effectiveGrade(g: Grade): Grade {
  const look = getLook(g.look);
  if (!look) return g;
  const p = look.params;
  const k = clamp(g.lookAmount, 0, 1.5);
  const mul = (base: number, v: number | undefined) => (v === undefined ? base : base * lerp(1, v, k));
  const add = (base: number, v: number | undefined) => (v === undefined ? base : base + v * k);
  const mul3 = (base: [number, number, number], v: [number, number, number] | undefined): [number, number, number] =>
    v ? [mul(base[0], v[0]), mul(base[1], v[1]), mul(base[2], v[2])] : base;
  const add3 = (base: [number, number, number], v: [number, number, number] | undefined): [number, number, number] =>
    v ? [add(base[0], v[0]), add(base[1], v[1]), add(base[2], v[2])] : base;
  return {
    ...g,
    exposure: add(g.exposure, p.exposure),
    contrast: mul(g.contrast, p.contrast),
    saturation: mul(g.saturation, p.saturation),
    vibrance: add(g.vibrance, p.vibrance),
    temperature: add(g.temperature, p.temperature),
    tint: add(g.tint, p.tint),
    highlights: add(g.highlights, p.highlights),
    shadows: add(g.shadows, p.shadows),
    hue: add(g.hue, p.hue),
    lift: addW(g.lift, p.lift, k),
    gamma: addW(g.gamma, p.gamma, k),
    gain: addW(g.gain, p.gain, k),
    slope: mul3(g.slope, p.slope),
    offset: add3(g.offset, p.offset),
    power: mul3(g.power, p.power),
    splitShadowHue: p.splitShadowAmt && g.splitShadowAmt === 0 ? p.splitShadowHue ?? g.splitShadowHue : g.splitShadowHue,
    splitShadowAmt: add(g.splitShadowAmt, p.splitShadowAmt),
    splitHighHue: p.splitHighAmt && g.splitHighAmt === 0 ? p.splitHighHue ?? g.splitHighHue : g.splitHighHue,
    splitHighAmt: add(g.splitHighAmt, p.splitHighAmt),
    fade: add(g.fade, p.fade),
    vignette: add(g.vignette, p.vignette),
    grain: add(g.grain, p.grain),
    sharpen: add(g.sharpen, p.sharpen),
    halation: add(g.halation, p.halation),
    bloom: add(g.bloom, p.bloom),
    chromatic: add(g.chromatic, p.chromatic),
    mono: g.mono || Boolean(p.mono),
  };
}

export function resolveGrade(input: Grade): ResolvedGrade {
  const g = effectiveGrade(input);
  const split = (hue: number, amt: number): [number, number, number] => {
    const c = hueToRgb(hue);
    const avg = (c[0] + c[1] + c[2]) / 3;
    return [(c[0] - avg) * amt * 0.35, (c[1] - avg) * amt * 0.35, (c[2] - avg) * amt * 0.35];
  };
  const gm = wheelToRgb(g.gamma, 0.35, 0.45);
  const gn = wheelToRgb(g.gain, 0.4, 0.5);
  return {
    exposure: g.exposure,
    contrast: g.contrast,
    pivot: g.pivot,
    saturation: g.saturation,
    vibrance: g.vibrance,
    temperature: g.temperature,
    tint: g.tint,
    highlights: g.highlights,
    shadows: g.shadows,
    hue: g.hue,
    lift: wheelToRgb(g.lift, 0.2, 0.18),
    gamma: [1 + gm[0], 1 + gm[1], 1 + gm[2]],
    gain: [1 + gn[0], 1 + gn[1], 1 + gn[2]],
    slope: g.slope,
    offset: g.offset,
    power: g.power,
    splitShadow: split(g.splitShadowHue, g.splitShadowAmt),
    splitHigh: split(g.splitHighHue, g.splitHighAmt),
    fade: clamp(g.fade, 0, 1),
    vignette: clamp(g.vignette, 0, 1.5),
    grain: clamp(g.grain, 0, 1.5),
    sharpen: clamp(g.sharpen, 0, 1.5),
    halation: clamp(g.halation, 0, 1.5),
    bloom: clamp(g.bloom, 0, 1.5),
    chromatic: clamp(g.chromatic, 0, 1.5),
    mono: g.mono,
  };
}

/** Score looks against free text — used by the AI Director's semantic matching. */
export function matchLooks(text: string): { look: Look; score: number }[] {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9&\-\s']/g, " ")} `;
  const scored = LOOKS.map((look) => {
    let score = 0;
    for (const alias of look.aliases) {
      if (t.includes(` ${alias} `) || t.includes(` ${alias}s `)) score += alias.split(" ").length * 3 + alias.length / 10;
      else if (alias.length > 4 && t.includes(alias)) score += 1.5;
    }
    if (t.includes(look.name.toLowerCase())) score += 6;
    for (const word of look.reference.toLowerCase().split(/[^a-z0-9]+/)) {
      if (word.length > 4 && t.includes(` ${word} `)) score += 1.2;
    }
    return { look, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
}
