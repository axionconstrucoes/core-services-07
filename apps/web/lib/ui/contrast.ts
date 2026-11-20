// Sistema global de contraste do ACC — funções puras (sem I/O, sem DOM), usadas pelos testes e por qualquer ferramenta de auditoria.
// REGRA ABSOLUTA: FUNDO CLARO → FONTE ESCURA; FUNDO ESCURO → FONTE CLARA — para qualquer componente e qualquer tema.
// Limiares (WCAG 2.x): texto normal >= 4,5:1 (AA); texto grande >= 3:1; componentes gráficos/controles relevantes >= 3:1;
// meta preferencial para texto normal 7:1 (AAA). A avaliação usa o FUNDO EFETIVO (transparências compostas sobre o que está atrás),
// nunca só a cor declarada no elemento pai.

export type Rgb = { r: number; g: number; b: number }; // 0..255
export type Rgba = Rgb & { a: number }; // a: 0..1

export const CONTRAST_MIN = {
  textNormal: 4.5,
  textLarge: 3,
  graphic: 3,
  textNormalPreferred: 7,
} as const;

export type ContrastKind = keyof typeof CONTRAST_MIN;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return clamp(Math.round(c * 255), 0, 255);
}

/** oklch(L C H [/ alpha]) → sRGB (conversão padrão OKLab → linear sRGB, com recorte de gamut). */
export function oklchToRgba(L: number, C: number, hDeg: number, alpha = 1): Rgba {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const bl = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(bl), a: alpha };
}

/** Converte "#rgb", "#rrggbb", "#rrggbbaa", "rgb()/rgba()" e "oklch()" em RGBA. Lança erro para formato não suportado (nunca adivinha). */
export function parseColor(input: string): Rgba {
  const s = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) {
    const [r, g, b] = m[1].split("").map((c) => parseInt(c + c, 16));
    return { r, g, b, a: 1 };
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const alpha = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: alpha };
  }
  m = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const L = m[1].endsWith("%") ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    const alpha = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return oklchToRgba(L, parseFloat(m[2]), parseFloat(m[3]), alpha);
  }
  throw new Error(`parseColor: formato de cor não suportado: "${input}"`);
}

/** Compõe uma cor (possivelmente translúcida) sobre um fundo OPACO, devolvendo a cor efetiva. */
export function compositeOver(fg: Rgba, bg: Rgb): Rgb {
  const a = clamp(fg.a, 0, 1);
  return { r: Math.round(fg.r * a + bg.r * (1 - a)), g: Math.round(fg.g * a + bg.g * (1 - a)), b: Math.round(fg.b * a + bg.b * (1 - a)) };
}

/** Fundo efetivo: camadas de baixo para cima (a primeira precisa ser opaca). */
export function effectiveBackground(layers: Rgba[]): Rgb {
  if (layers.length === 0) throw new Error("effectiveBackground: nenhuma camada");
  let acc: Rgb = { r: layers[0].r, g: layers[0].g, b: layers[0].b };
  for (const layer of layers.slice(1)) acc = compositeOver(layer, acc);
  return acc;
}

export function relativeLuminance(c: Rgb): number {
  return 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Fundo "claro" quando a luminância relativa passa do ponto em que texto branco e preto têm o mesmo contraste (~0,179). */
export function isLightBackground(bg: Rgb): boolean {
  return relativeLuminance(bg) > 0.179;
}

/**
 * Regra universal: fundo claro → texto escuro; fundo escuro → texto claro. Devolve se o par respeita a regra
 * (texto de luminância "do lado oposto" ao fundo). Não substitui a razão mínima: ambas precisam passar.
 */
export function followsLightDarkRule(fg: Rgb, bg: Rgb): boolean {
  return isLightBackground(bg) ? !isLightBackground(fg) : isLightBackground(fg);
}

/** Escolhe, entre preto e branco institucionais, o texto de maior contraste para um fundo efetivo. */
export function readableTextFor(bg: Rgb, dark: Rgb = { r: 17, g: 24, b: 39 }, light: Rgb = { r: 255, g: 255, b: 255 }): Rgb {
  return contrastRatio(dark, bg) >= contrastRatio(light, bg) ? dark : light;
}

export interface ContrastVerdict {
  ratio: number;
  min: number;
  passes: boolean;
  followsRule: boolean;
}

export function evaluatePair(fg: Rgba, bgLayers: Rgba[], kind: ContrastKind = "textNormal"): ContrastVerdict {
  const bg = effectiveBackground(bgLayers);
  const effectiveFg = compositeOver(fg, bg);
  const ratio = contrastRatio(effectiveFg, bg);
  const min = CONTRAST_MIN[kind];
  return { ratio, min, passes: ratio >= min, followsRule: followsLightDarkRule(effectiveFg, bg) };
}
