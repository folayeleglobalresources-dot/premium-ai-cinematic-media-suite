export type Lut3D = {
  size: number;
  data: Uint8Array; // RGBA8, r fastest, then g, then b
  title: string;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
};

/** Parse an Adobe/Resolve-style .cube 3D LUT file into an RGBA8 volume. */
export function parseCube(text: string): Lut3D {
  const lines = text.split(/\r?\n/);
  let size = 0;
  let title = "LUT";
  const domainMin: [number, number, number] = [0, 0, 0];
  const domainMax: [number, number, number] = [1, 1, 1];
  const values: number[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const upper = line.toUpperCase();
    if (upper.startsWith("TITLE")) {
      title = line.replace(/^TITLE\s*/i, "").replace(/"/g, "").trim() || title;
      continue;
    }
    if (upper.startsWith("LUT_3D_SIZE")) {
      size = parseInt(line.split(/\s+/)[1], 10);
      continue;
    }
    if (upper.startsWith("LUT_1D_SIZE")) {
      throw new Error("1D LUTs are not supported — please provide a 3D .cube file");
    }
    if (upper.startsWith("DOMAIN_MIN")) {
      const p = line.split(/\s+/).slice(1).map(Number);
      domainMin[0] = p[0] ?? 0;
      domainMin[1] = p[1] ?? 0;
      domainMin[2] = p[2] ?? 0;
      continue;
    }
    if (upper.startsWith("DOMAIN_MAX")) {
      const p = line.split(/\s+/).slice(1).map(Number);
      domainMax[0] = p[0] ?? 1;
      domainMax[1] = p[1] ?? 1;
      domainMax[2] = p[2] ?? 1;
      continue;
    }
    const parts = line.split(/\s+/);
    if (parts.length >= 3) {
      const r = parseFloat(parts[0]);
      const g = parseFloat(parts[1]);
      const b = parseFloat(parts[2]);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) values.push(r, g, b);
    }
  }
  if (!size) {
    const n = Math.round(Math.cbrt(values.length / 3));
    if (n * n * n * 3 === values.length) size = n;
  }
  if (!size || values.length < size * size * size * 3) {
    throw new Error("Invalid .cube file: could not determine LUT size or data is incomplete");
  }
  const total = size * size * size;
  const data = new Uint8Array(total * 4);
  for (let i = 0; i < total; i++) {
    const r = (values[i * 3] - domainMin[0]) / (domainMax[0] - domainMin[0] || 1);
    const g = (values[i * 3 + 1] - domainMin[1]) / (domainMax[1] - domainMin[1] || 1);
    const b = (values[i * 3 + 2] - domainMin[2]) / (domainMax[2] - domainMin[2] || 1);
    data[i * 4] = Math.max(0, Math.min(255, Math.round(r * 255)));
    data[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
    data[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
    data[i * 4 + 3] = 255;
  }
  return { size, data, title, domainMin, domainMax };
}
