// Decodificador PNG mínimo (8 bits, RGB/RGBA, sem entrelaçamento) + comparação por diferença de pixels, sem dependências.
import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("não é PNG");
  let pos = 8, w = 0, h = 0, depth = 0, ctype = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; if (data[12] !== 0) throw new Error("PNG entrelaçado"); }
    else if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  if (depth !== 8 || (ctype !== 6 && ctype !== 2)) throw new Error(`PNG não suportado (depth ${depth}, tipo ${ctype})`);
  const bpp = ctype === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y += 1) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}

/** Fração de pixels cujo maior desvio de canal excede `channelTol`. Tamanhos diferentes => incomparável. */
export function diffPng(aBuf, bBuf, channelTol = 16) {
  const a = decodePng(aBuf), b = decodePng(bBuf);
  if (a.w !== b.w || a.h !== b.h) return { comparable: false, a: `${a.w}x${a.h}`, b: `${b.w}x${b.h}` };
  let diff = 0;
  for (let i = 0; i < a.w * a.h; i += 1) {
    let m = 0;
    for (let c = 0; c < 3; c += 1) m = Math.max(m, Math.abs(a.data[i * a.bpp + c] - b.data[i * b.bpp + c]));
    if (m > channelTol) diff += 1;
  }
  return { comparable: true, diffPixels: diff, total: a.w * a.h, ratio: diff / (a.w * a.h) };
}
