import type { Grade, MonitorOptions } from "./types";
import { DEFAULT_GRADE, DEFAULT_MONITOR } from "./types";
import type { Lut3D } from "./cube";

const VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform sampler3D uLut;
uniform int uHasLut;
uniform float uLutSize;
uniform vec2 uTexel;
uniform float uTime;
uniform int uZebra; uniform int uFalse; uniform int uPeak;
uniform float uZebraLevel; uniform float uPeakLevel;
uniform float uDigitalGain;
uniform int uMirror;
uniform float uExposure, uContrast, uHighlights, uShadows, uWhites, uBlacks;
uniform float uSaturation, uVibrance, uTemperature, uTint, uHue, uFade;
uniform float uVignette, uVignetteSoft, uGrain, uSharpen, uBloom, uFilmic, uBleach;
uniform float uShadowTintHue, uShadowTintSat, uHighlightTintHue, uHighlightTintSat, uLutMix;

float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec3 hueRotate(vec3 c, float deg){
  float a = radians(deg);
  const mat3 toYIQ = mat3(0.299,0.587,0.114, 0.596,-0.274,-0.322, 0.211,-0.523,0.312);
  const mat3 toRGB = mat3(1.0,0.956,0.621, 1.0,-0.272,-0.647, 1.0,-1.106,1.703);
  vec3 yiq = c * toYIQ;
  float h = atan(yiq.z, yiq.y) + a;
  float chroma = length(yiq.yz);
  yiq.y = chroma * cos(h); yiq.z = chroma * sin(h);
  return yiq * toRGB;
}
vec3 aces(vec3 x){
  return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0);
}
float hash(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 fetch(vec2 uv){ return texture(uTex, uv).rgb; }

void main(){
  vec2 uv = vUv;
  if (uMirror == 1) uv.x = 1.0 - uv.x;
  vec3 src = fetch(uv);
  vec3 c = src;

  // ---- Texture: sharpen (unsharp) & halation (cheap wide bloom) ----
  if (uSharpen > 0.001) {
    vec3 n = fetch(uv + vec2(uTexel.x, 0.0)) + fetch(uv - vec2(uTexel.x, 0.0)) + fetch(uv + vec2(0.0, uTexel.y)) + fetch(uv - vec2(0.0, uTexel.y));
    vec3 blur = (c * 4.0 + n) / 8.0;
    c += (c - blur) * uSharpen * 2.5;
  }
  if (uBloom > 0.001) {
    vec3 glow = vec3(0.0);
    float r = 7.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      vec3 s = fetch(uv + vec2(cos(a), sin(a)) * uTexel * r);
      glow += max(s - 0.62, 0.0);
    }
    glow /= 8.0;
    glow *= vec3(1.0, 0.72, 0.5) + 0.5; // warm halation bias
    c += glow * uBloom * 1.6;
  }

  // ---- Light ----
  c *= exp2(uExposure + uDigitalGain);
  float L = luma(c);
  float shMask = 1.0 - smoothstep(0.0, 0.55, L);
  float hiMask = smoothstep(0.45, 1.0, L);
  c += uShadows * 0.28 * shMask * (1.0 - c);
  c *= 1.0 + uHighlights * 0.38 * hiMask;
  c *= 1.0 + uWhites * 0.22;
  c += uBlacks * 0.14 * (1.0 - smoothstep(0.0, 0.45, L));
  c = (c - 0.5) * (1.0 + uContrast * 0.9) + 0.5;

  // ---- Color ----
  c.r *= 1.0 + uTemperature * 0.22; c.b *= 1.0 - uTemperature * 0.22;
  c.g *= 1.0 - uTint * 0.16; c.r *= 1.0 + uTint * 0.06; c.b *= 1.0 + uTint * 0.06;
  if (abs(uHue) > 0.01) c = hueRotate(c, uHue);
  L = luma(c);
  c = mix(vec3(L), c, 1.0 + uSaturation);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = mix(vec3(L), c, 1.0 + uVibrance * (1.0 - clamp(sat, 0.0, 1.0)));

  // ---- Tone (split toning) ----
  L = clamp(luma(c), 0.0, 1.0);
  vec3 shCol = hsv2rgb(vec3(uShadowTintHue / 360.0, 1.0, 1.0));
  vec3 hiCol = hsv2rgb(vec3(uHighlightTintHue / 360.0, 1.0, 1.0));
  c += (shCol - 0.5) * uShadowTintSat * 0.34 * (1.0 - smoothstep(0.0, 0.6, L));
  c += (hiCol - 0.5) * uHighlightTintSat * 0.34 * smoothstep(0.4, 1.0, L);

  // ---- Film ----
  if (uBleach > 0.001) {
    float l2 = luma(c);
    vec3 lv = vec3(l2);
    vec3 over = mix(2.0 * c * lv, 1.0 - 2.0 * (1.0 - c) * (1.0 - lv), step(0.5, l2));
    c = mix(c, mix(over, lv, 0.55), uBleach);
  }
  if (uFilmic > 0.001) c = mix(c, aces(c * 1.1), uFilmic);
  c = mix(c, vec3(0.16) + c * 0.84, uFade);

  // ---- LUT ----
  if (uHasLut == 1) {
    vec3 cc = clamp(c, 0.0, 1.0);
    vec3 lc = texture(uLut, cc * ((uLutSize - 1.0) / uLutSize) + 0.5 / uLutSize).rgb;
    c = mix(c, lc, uLutMix);
  }

  // ---- Vignette & grain ----
  float d = distance(vUv, vec2(0.5)) * 1.4142;
  float vig = smoothstep(0.3, 1.25 - uVignetteSoft * 0.5, d);
  c *= 1.0 - uVignette * vig * 0.9;
  if (uGrain > 0.001) {
    float n = hash(gl_FragCoord.xy + fract(uTime * 0.731) * 1000.0) - 0.5;
    float n2 = hash(gl_FragCoord.xy * 0.5 + fract(uTime * 0.371) * 777.0) - 0.5;
    float lg = luma(c);
    c += (n * 0.7 + n2 * 0.3) * uGrain * 0.22 * (1.0 - lg * 0.6);
  }
  c = clamp(c, 0.0, 1.0);

  // ---- Monitoring overlays ----
  float Lm = luma(c);
  if (uFalse == 1) {
    vec3 fc = vec3(Lm);
    if (Lm < 0.025) fc = vec3(0.45, 0.0, 0.6);
    else if (Lm < 0.045) fc = vec3(0.1, 0.2, 0.9);
    else if (Lm < 0.38) fc = vec3(Lm * 0.9);
    else if (Lm < 0.43) fc = vec3(0.15, 0.75, 0.2);
    else if (Lm < 0.52) fc = vec3(Lm * 0.9);
    else if (Lm < 0.58) fc = vec3(0.95, 0.55, 0.7);
    else if (Lm < 0.96) fc = vec3(Lm * 0.9);
    else if (Lm < 0.99) fc = vec3(1.0, 0.9, 0.1);
    else fc = vec3(1.0, 0.1, 0.1);
    c = fc;
  }
  if (uZebra == 1 && Lm >= uZebraLevel) {
    float s = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / 14.0));
    c = mix(c, vec3(s), 0.85);
  }
  if (uPeak == 1) {
    float tl = luma(fetch(uv + vec2(-uTexel.x, uTexel.y)));
    float t = luma(fetch(uv + vec2(0.0, uTexel.y)));
    float tr = luma(fetch(uv + vec2(uTexel.x, uTexel.y)));
    float l = luma(fetch(uv + vec2(-uTexel.x, 0.0)));
    float r = luma(fetch(uv + vec2(uTexel.x, 0.0)));
    float bl = luma(fetch(uv + vec2(-uTexel.x, -uTexel.y)));
    float b = luma(fetch(uv + vec2(0.0, -uTexel.y)));
    float br = luma(fetch(uv + vec2(uTexel.x, -uTexel.y)));
    float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
    float gy = -tl - 2.0*t - tr + bl + 2.0*b + br;
    float mag = sqrt(gx*gx + gy*gy);
    if (mag > uPeakLevel * 1.2) c = mix(c, vec3(1.0, 0.76, 0.3), 0.9);
  }
  outColor = vec4(c, 1.0);
}`;

export type RenderOptions = {
  grade?: Grade;
  monitor?: Partial<MonitorOptions>;
  time?: number;
  mirror?: boolean;
  lutMix?: number;
};

type TexSource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

export class CinePipeline {
  readonly canvas: HTMLCanvasElement;
  readonly ok: boolean;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private lutTex: WebGLTexture | null = null;
  private hasLut = false;
  private lutSize = 0;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private srcW = 0;
  private srcH = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
      antialias: false,
      powerPreference: "high-performance",
    });
    if (!gl) {
      this.ok = false;
      return;
    }
    this.gl = gl;
    const vs = this.compile(gl.VERTEX_SHADER, VERT);
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      this.ok = false;
      return;
    }
    const program = gl.createProgram();
    if (!program) {
      this.ok = false;
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("CinePipeline link error", gl.getProgramInfoLog(program));
      this.ok = false;
      return;
    }
    this.program = program;
    gl.useProgram(program);
    const names = [
      "uTex", "uLut", "uHasLut", "uLutSize", "uTexel", "uTime", "uZebra", "uFalse", "uPeak", "uZebraLevel", "uPeakLevel",
      "uDigitalGain", "uMirror", "uExposure", "uContrast", "uHighlights", "uShadows", "uWhites", "uBlacks", "uSaturation",
      "uVibrance", "uTemperature", "uTint", "uHue", "uFade", "uVignette", "uVignetteSoft", "uGrain", "uSharpen", "uBloom",
      "uFilmic", "uBleach", "uShadowTintHue", "uShadowTintSat", "uHighlightTintHue", "uHighlightTintSat", "uLutMix",
    ];
    for (const n of names) this.uniforms.set(n, gl.getUniformLocation(program, n));
    this.tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(this.uniforms.get("uTex")!, 0);
    gl.uniform1i(this.uniforms.get("uLut")!, 1);
    // placeholder 3D texture so the sampler is always valid
    this.lutTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 2, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(32).fill(255));
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    this.ok = true;
  }

  private compile(type: number, src: string) {
    const gl = this.gl!;
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("CinePipeline shader error", gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  setLUT(lut: Lut3D | null) {
    const gl = this.gl;
    if (!gl || !this.lutTex) return;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (lut) {
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, lut.size, lut.size, lut.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut.data);
      this.hasLut = true;
      this.lutSize = lut.size;
    } else {
      this.hasLut = false;
      this.lutSize = 0;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Upload a source frame. Returns false if the source has no dimensions yet. */
  setSource(src: TexSource, width?: number, height?: number): boolean {
    const gl = this.gl;
    if (!gl || !this.tex) return false;
    let w = width ?? 0;
    let h = height ?? 0;
    if (!w || !h) {
      if (src instanceof HTMLVideoElement) {
        w = src.videoWidth;
        h = src.videoHeight;
      } else if (src instanceof HTMLImageElement) {
        w = src.naturalWidth;
        h = src.naturalHeight;
      } else {
        w = (src as HTMLCanvasElement).width;
        h = (src as HTMLCanvasElement).height;
      }
    }
    if (!w || !h) return false;
    if (w !== this.srcW || h !== this.srcH) {
      this.srcW = w;
      this.srcH = h;
      this.canvas.width = w;
      this.canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src as TexImageSource);
    } catch {
      return false;
    }
    return true;
  }

  render(opts: RenderOptions = {}) {
    const gl = this.gl;
    if (!gl || !this.program || !this.srcW) return;
    const g = opts.grade ?? DEFAULT_GRADE;
    const m: MonitorOptions = { ...DEFAULT_MONITOR, ...(opts.monitor ?? {}) };
    gl.useProgram(this.program);
    const u = (n: string) => this.uniforms.get(n) ?? null;
    gl.uniform1i(u("uHasLut"), this.hasLut ? 1 : 0);
    gl.uniform1f(u("uLutSize"), this.lutSize || 2);
    gl.uniform1f(u("uLutMix"), opts.lutMix ?? g.lutIntensity);
    gl.uniform2f(u("uTexel"), 1 / this.srcW, 1 / this.srcH);
    gl.uniform1f(u("uTime"), opts.time ?? performance.now() / 1000);
    gl.uniform1i(u("uZebra"), m.zebra ? 1 : 0);
    gl.uniform1i(u("uFalse"), m.falseColor ? 1 : 0);
    gl.uniform1i(u("uPeak"), m.peaking ? 1 : 0);
    gl.uniform1f(u("uZebraLevel"), m.zebraLevel);
    gl.uniform1f(u("uPeakLevel"), m.peakLevel);
    gl.uniform1f(u("uDigitalGain"), m.digitalGain);
    gl.uniform1i(u("uMirror"), opts.mirror ? 1 : 0);
    gl.uniform1f(u("uExposure"), g.exposure);
    gl.uniform1f(u("uContrast"), g.contrast);
    gl.uniform1f(u("uHighlights"), g.highlights);
    gl.uniform1f(u("uShadows"), g.shadows);
    gl.uniform1f(u("uWhites"), g.whites);
    gl.uniform1f(u("uBlacks"), g.blacks);
    gl.uniform1f(u("uSaturation"), g.saturation);
    gl.uniform1f(u("uVibrance"), g.vibrance);
    gl.uniform1f(u("uTemperature"), g.temperature);
    gl.uniform1f(u("uTint"), g.tint);
    gl.uniform1f(u("uHue"), g.hue);
    gl.uniform1f(u("uFade"), g.fade);
    gl.uniform1f(u("uVignette"), g.vignette);
    gl.uniform1f(u("uVignetteSoft"), g.vignetteSoft);
    gl.uniform1f(u("uGrain"), g.grain);
    gl.uniform1f(u("uSharpen"), g.sharpen);
    gl.uniform1f(u("uBloom"), g.bloom);
    gl.uniform1f(u("uFilmic"), g.filmic);
    gl.uniform1f(u("uBleach"), g.bleach);
    gl.uniform1f(u("uShadowTintHue"), g.shadowTintHue);
    gl.uniform1f(u("uShadowTintSat"), g.shadowTintSat);
    gl.uniform1f(u("uHighlightTintHue"), g.highlightTintHue);
    gl.uniform1f(u("uHighlightTintSat"), g.highlightTintSat);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  get width() {
    return this.srcW;
  }
  get height() {
    return this.srcH;
  }

  dispose() {
    const gl = this.gl;
    if (!gl) return;
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.lutTex) gl.deleteTexture(this.lutTex);
    if (this.program) gl.deleteProgram(this.program);
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }
}

/** Downsample a canvas into RGBA bytes for scopes / analysis. */
export function sampleCanvas(
  source: HTMLCanvasElement | HTMLVideoElement,
  scratch: HTMLCanvasElement,
  w = 192,
  h = 108,
): Uint8ClampedArray | null {
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w;
    scratch.height = h;
  }
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(source, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
}
