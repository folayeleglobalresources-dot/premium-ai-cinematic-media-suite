import type { ResolvedGrade } from "../looks";

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2((a_pos.x + 1.0) * 0.5, 1.0 - (a_pos.y + 1.0) * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform vec2 u_res;
uniform float u_time;
uniform vec4 u_uvx;
uniform float u_exposure;
uniform float u_contrast;
uniform float u_pivot;
uniform float u_saturation;
uniform float u_vibrance;
uniform float u_temperature;
uniform float u_tint;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_hue;
uniform vec3 u_lift;
uniform vec3 u_gamma;
uniform vec3 u_gain;
uniform vec3 u_slope;
uniform vec3 u_offset;
uniform vec3 u_power;
uniform vec3 u_splitShadow;
uniform vec3 u_splitHigh;
uniform float u_fade;
uniform float u_vignette;
uniform float u_grain;
uniform float u_sharpen;
uniform float u_halation;
uniform float u_bloom;
uniform float u_chromatic;
uniform float u_mono;
uniform int u_monitor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 tex(vec2 uv) { return texture2D(u_tex, clamp(uv, 0.0, 1.0)).rgb; }

vec3 hueShift(vec3 c, float deg) {
  mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * c;
  float h = atan(yiq.z, yiq.y) + radians(deg);
  float ch = length(yiq.yz);
  yiq.y = ch * cos(h);
  yiq.z = ch * sin(h);
  return toRGB * yiq;
}

float lumaAt(vec2 uv) { return dot(tex(uv), LUMA); }

void main() {
  vec2 uv = v_uv * u_uvx.xy + u_uvx.zw;
  vec3 c;
  if (u_chromatic > 0.001) {
    vec2 dir = uv - 0.5;
    float amt = u_chromatic * 0.007;
    c = vec3(tex(uv + dir * amt).r, tex(uv).g, tex(uv - dir * amt).b);
  } else {
    c = tex(uv);
  }

  if (u_sharpen > 0.001) {
    vec3 blur = (tex(uv + vec2(u_texel.x, 0.0)) + tex(uv - vec2(u_texel.x, 0.0)) +
                 tex(uv + vec2(0.0, u_texel.y)) + tex(uv - vec2(0.0, u_texel.y))) * 0.25;
    c = c + (c - blur) * u_sharpen * 1.8;
  }

  vec3 glow = vec3(0.0);
  if (u_bloom + u_halation > 0.001) {
    vec2 r = u_texel * 7.0;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      vec2 off = vec2(cos(a), sin(a));
      acc += max(tex(uv + off * r) - 0.6, 0.0);
      acc += max(tex(uv + off * r * 2.4) - 0.6, 0.0) * 0.7;
    }
    glow = acc / 13.6;
  }

  vec3 lin = pow(max(c, 0.0), vec3(2.2));
  lin *= exp2(u_exposure);
  lin *= vec3(1.0 + u_temperature * 0.24, 1.0 - u_tint * 0.16, 1.0 - u_temperature * 0.24);
  c = pow(max(lin, 0.0), vec3(1.0 / 2.2));

  c = pow(max(c * u_slope + u_offset, 0.0), u_power);

  c = u_gain * (c + u_lift * (1.0 - c));
  c = pow(max(c, 0.0), 1.0 / max(u_gamma, vec3(0.05)));

  c = (c - u_pivot) * u_contrast + u_pivot;

  float l = dot(clamp(c, 0.0, 1.0), LUMA);
  float sh = 1.0 - smoothstep(0.0, 0.55, l);
  float hi = smoothstep(0.45, 1.0, l);
  c += u_shadows * 0.3 * sh;
  c += u_highlights * 0.3 * hi;
  c += u_splitShadow * sh + u_splitHigh * hi;

  if (abs(u_hue) > 0.01) c = hueShift(c, u_hue);

  l = dot(c, LUMA);
  float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
  float vib = 1.0 + u_vibrance * (1.0 - clamp(sat * 1.5, 0.0, 1.0));
  c = mix(vec3(l), c, u_saturation * vib);
  if (u_mono > 0.5) c = vec3(dot(c, LUMA));

  c += glow * u_bloom * 1.5;
  c += glow * vec3(1.0, 0.3, 0.1) * u_halation * 2.4;

  c = c * (1.0 - u_fade * 0.22) + u_fade * 0.1;

  vec2 p = v_uv - 0.5;
  p.x *= u_res.x / u_res.y;
  float vig = smoothstep(1.0, 0.22, length(p));
  c *= mix(1.0, vig, clamp(u_vignette, 0.0, 1.5) * 0.85);

  if (u_grain > 0.001) {
    float n = hash(floor(v_uv * u_res) + fract(u_time * 7.31) * 113.0);
    float lum = dot(c, LUMA);
    c += (n - 0.5) * u_grain * 0.24 * (1.0 - abs(lum - 0.5) * 1.1);
  }

  c = clamp(c, 0.0, 1.0);

  if (u_monitor == 1) {
    float lz = dot(c, LUMA);
    float stripe = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y + u_time * 60.0) / 12.0));
    if (lz > 0.94) c = mix(c, vec3(stripe), 0.85);
  } else if (u_monitor == 2) {
    float lf = dot(c, LUMA);
    vec3 fc = vec3(lf * 0.55);
    if (lf < 0.025) fc = vec3(0.45, 0.0, 0.6);
    else if (lf < 0.1) fc = vec3(0.0, 0.3, 1.0);
    else if (lf > 0.38 && lf < 0.45) fc = vec3(0.15, 0.8, 0.25);
    else if (lf > 0.54 && lf < 0.62) fc = vec3(1.0, 0.55, 0.65);
    else if (lf > 0.97) fc = vec3(1.0, 0.0, 0.0);
    else if (lf > 0.9) fc = vec3(1.0, 0.95, 0.0);
    c = fc;
  } else if (u_monitor == 3) {
    vec2 t = u_texel;
    float gx = -lumaAt(uv + vec2(-t.x, -t.y)) - 2.0 * lumaAt(uv + vec2(-t.x, 0.0)) - lumaAt(uv + vec2(-t.x, t.y))
               + lumaAt(uv + vec2(t.x, -t.y)) + 2.0 * lumaAt(uv + vec2(t.x, 0.0)) + lumaAt(uv + vec2(t.x, t.y));
    float gy = -lumaAt(uv + vec2(-t.x, -t.y)) - 2.0 * lumaAt(uv + vec2(0.0, -t.y)) - lumaAt(uv + vec2(t.x, -t.y))
               + lumaAt(uv + vec2(-t.x, t.y)) + 2.0 * lumaAt(uv + vec2(0.0, t.y)) + lumaAt(uv + vec2(t.x, t.y));
    float e = length(vec2(gx, gy));
    c = mix(c * 0.7, vec3(1.0, 0.18, 0.25), step(0.42, e));
  }

  gl_FragColor = vec4(c, 1.0);
}`;

export interface RenderOptions {
  width: number;
  height: number;
  grade: ResolvedGrade;
  time?: number;
  monitor?: 0 | 1 | 2 | 3;
  /** uv transform: [scaleX, scaleY, offsetX, offsetY] in source space */
  uv?: [number, number, number, number];
  flipX?: boolean;
  srcWidth?: number;
  srcHeight?: number;
}

type U = WebGLUniformLocation | null;

export const NEUTRAL_RESOLVED: ResolvedGrade = {
  exposure: 0, contrast: 1, pivot: 0.45, saturation: 1, vibrance: 0, temperature: 0, tint: 0,
  highlights: 0, shadows: 0, hue: 0, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1],
  slope: [1, 1, 1], offset: [0, 0, 0], power: [1, 1, 1], splitShadow: [0, 0, 0], splitHigh: [0, 0, 0],
  fade: 0, vignette: 0, grain: 0, sharpen: 0, halation: 0, bloom: 0, chromatic: 0, mono: false,
};

export class GradeRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null;
  private program: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private u: Record<string, U> = {};
  readonly ok: boolean;

  constructor(canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? document.createElement("canvas");
    const attrs: WebGLContextAttributes = { premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: false, alpha: false };
    this.gl =
      (this.canvas.getContext("webgl2", attrs) as WebGLRenderingContext | null) ??
      (this.canvas.getContext("webgl", attrs) as WebGLRenderingContext | null);
    this.ok = Boolean(this.gl) && this.init();
  }

  private compile(type: number, src: string): WebGLShader | null {
    const gl = this.gl!;
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("[Lumière GL]", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  private init(): boolean {
    const gl = this.gl!;
    const vs = this.compile(gl.VERTEX_SHADER, VERT);
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    if (!prog) return false;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("[Lumière GL]", gl.getProgramInfoLog(prog));
      return false;
    }
    this.program = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const names = [
      "u_tex", "u_texel", "u_res", "u_time", "u_uvx", "u_exposure", "u_contrast", "u_pivot", "u_saturation", "u_vibrance",
      "u_temperature", "u_tint", "u_highlights", "u_shadows", "u_hue", "u_lift", "u_gamma", "u_gain", "u_slope",
      "u_offset", "u_power", "u_splitShadow", "u_splitHigh", "u_fade", "u_vignette", "u_grain", "u_sharpen",
      "u_halation", "u_bloom", "u_chromatic", "u_mono", "u_monitor",
    ];
    for (const n of names) this.u[n] = gl.getUniformLocation(prog, n);
    gl.uniform1i(this.u.u_tex, 0);
    return true;
  }

  render(source: TexImageSource, o: RenderOptions): HTMLCanvasElement {
    const gl = this.gl;
    if (!gl || !this.ok) return this.canvas;
    const w = Math.max(2, Math.round(o.width));
    const h = Math.max(2, Math.round(o.height));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch {
      return this.canvas;
    }
    const g = o.grade;
    const sw = o.srcWidth || w;
    const sh = o.srcHeight || h;
    let uv = o.uv ?? [1, 1, 0, 0];
    if (o.flipX) uv = [-uv[0], uv[1], uv[2] + uv[0], uv[3]];
    const u = this.u;
    gl.uniform2f(u.u_texel, 1 / sw, 1 / sh);
    gl.uniform2f(u.u_res, w, h);
    gl.uniform1f(u.u_time, o.time ?? performance.now() / 1000);
    gl.uniform4f(u.u_uvx, uv[0], uv[1], uv[2], uv[3]);
    gl.uniform1f(u.u_exposure, g.exposure);
    gl.uniform1f(u.u_contrast, g.contrast);
    gl.uniform1f(u.u_pivot, g.pivot);
    gl.uniform1f(u.u_saturation, g.saturation);
    gl.uniform1f(u.u_vibrance, g.vibrance);
    gl.uniform1f(u.u_temperature, g.temperature);
    gl.uniform1f(u.u_tint, g.tint);
    gl.uniform1f(u.u_highlights, g.highlights);
    gl.uniform1f(u.u_shadows, g.shadows);
    gl.uniform1f(u.u_hue, g.hue);
    gl.uniform3fv(u.u_lift, g.lift);
    gl.uniform3fv(u.u_gamma, g.gamma);
    gl.uniform3fv(u.u_gain, g.gain);
    gl.uniform3fv(u.u_slope, g.slope);
    gl.uniform3fv(u.u_offset, g.offset);
    gl.uniform3fv(u.u_power, g.power);
    gl.uniform3fv(u.u_splitShadow, g.splitShadow);
    gl.uniform3fv(u.u_splitHigh, g.splitHigh);
    gl.uniform1f(u.u_fade, g.fade);
    gl.uniform1f(u.u_vignette, g.vignette);
    gl.uniform1f(u.u_grain, g.grain);
    gl.uniform1f(u.u_sharpen, g.sharpen);
    gl.uniform1f(u.u_halation, g.halation);
    gl.uniform1f(u.u_bloom, g.bloom);
    gl.uniform1f(u.u_chromatic, g.chromatic);
    gl.uniform1f(u.u_mono, g.mono ? 1 : 0);
    gl.uniform1i(u.u_monitor, o.monitor ?? 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return this.canvas;
  }
}

let shared: GradeRenderer | null = null;
/** Lazily created shared renderer for previews / thumbnails. */
export function sharedRenderer(): GradeRenderer {
  if (!shared) shared = new GradeRenderer();
  return shared;
}
