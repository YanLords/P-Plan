import { KIND_META, type Kind } from './elements';
import { kindGlyph } from './icons';

/**
 * Curseur d'outil : pastille blanche + icône de l'outil, rasterisée en PNG.
 * (WebKit — donc Tauri macOS — n'accepte pas les curseurs SVG.)
 */
const cache = new Map<Kind, string>();

export const CURSOR_SIZE = 32;
export const CURSOR_HOTSPOT = CURSOR_SIZE / 2;

export function cursorSvg(kind: Kind, size = CURSOR_SIZE): string {
  const color = KIND_META[kind].color;
  const pad = size * 0.17;
  const glyph = size * 0.66;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2.5}" fill="#fff" fill-opacity="0.92" stroke="${color}" stroke-width="2"/>` +
    `<g transform="translate(${pad} ${pad}) scale(${glyph / 24})">${kindGlyph(kind, color, 2)}</g>` +
    `</svg>`
  );
}

/** `url("data:image/png;base64,…") 16 16, crosshair` prêt pour `style.cursor`. */
export async function kindCursor(kind: Kind): Promise<string | null> {
  const cached = cache.get(kind);
  if (cached) return cached;
  try {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cursorSvg(kind))}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = CURSOR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, CURSOR_SIZE, CURSOR_SIZE);
    const css = `url("${canvas.toDataURL('image/png')}") ${CURSOR_HOTSPOT} ${CURSOR_HOTSPOT}, crosshair`;
    cache.set(kind, css);
    return css;
  } catch {
    return null; // repli : curseur natif de la carte
  }
}
