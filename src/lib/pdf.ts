import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
import type { Plan, PElement, Kind } from './elements';
import { KIND_META, colorOf, kindIconSvg, isZone } from './elements';
import { formatCoord, formatMeters, metersPerPixel, ringArea, ringLength, scaleDenominator } from './geo';

const IMG = { x: 10, y: 26, w: 190, h: 138 };
const COL = { x: 205, w: 87 };
const LEGEND_TOP = 36;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function kindCount(plan: Plan, kind: PElement['kind']) {
  return plan.elements.filter((e) => e.kind === kind).length;
}

async function capture(mapEl: HTMLElement, boost?: (on: boolean) => void): Promise<string | null> {
  boost?.(true);
  // laisse le navigateur repeindre traits/icônes épaissis avant la capture
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    // capture 2x puis réduction + JPEG : un PNG plein écran ferait 25 Mo de PDF
    const raw = await toPng(mapEl, { pixelRatio: 2, cacheBust: true, backgroundColor: '#ffffff' });
    return await downscale(raw, 2000);
  } catch (err) {
    // ponytail: tuiles distantes non capturables (CORS/réseau) -> plan sans fond de carte
    console.warn('[pdf] capture de la carte impossible', err);
    return null;
  } finally {
    boost?.(false);
  }
}

async function downscale(dataUrl: string, maxWidth: number): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const scale = Math.min(1, maxWidth / img.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.86);
}

/** Icône de l'élément rendue en PNG (jsPDF ne sait pas dessiner un SVG). */
const iconCache = new Map<string, string>();

async function iconPng(kind: Kind, color: string): Promise<string | null> {
  const key = `${kind}|${color}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  try {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(kindIconSvg(kind, 64, color))}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 64, 64);
    const png = canvas.toDataURL('image/png');
    iconCache.set(key, png);
    return png;
  } catch {
    return null; // PDF sans icône plutôt qu'un export qui échoue
  }
}

/** Ligne de légende : icône + numéro + libellé + détails techniques + GPS. */
function legendRow(
  doc: jsPDF,
  e: PElement,
  n: number,
  x: number,
  y: number,
  w: number,
  icon: string | null
): number {
  if (icon) {
    doc.addImage(icon, 'PNG', x, y - 3.2, 3.6, 3.6, undefined, 'FAST');
  } else {
    const [r, g, b] = hexToRgb(colorOf(e));
    doc.setFillColor(r, g, b);
    doc.roundedRect(x, y - 2.6, 3, 3, 1, 1, 'F');
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.6);
  doc.setTextColor(26, 26, 26);
  const title = `${n}. ${KIND_META[e.kind].label} — ${e.label}`;
  const lines = doc.splitTextToSize(title, w - 5.4) as string[];
  doc.text(lines[0], x + 4.9, y);
  let cursor = y + 3.4;

  const details: string[] = [];
  if (e.ref) details.push(`réf ${e.ref}`);
  if (e.calibre != null) details.push(`${e.calibre} mm`);
  if (e.ds != null) details.push(`DS ${e.ds} m`);
  if (e.ring?.length) {
    details.push(
      isZone(e.kind)
        ? `${e.ring.length} pts · périmètre ${formatMeters(ringLength(e.ring, true))} m · ${formatMeters(ringArea(e.ring))} m²`
        : `${e.ring.length} pts · longueur ${formatMeters(ringLength(e.ring))} m`
    );
  }
  details.push(formatCoord(e.lat, e.lng));

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.6);
  doc.setTextColor(120, 120, 120);
  const det = doc.splitTextToSize(details.join(' · '), w - 5.4) as string[];
  for (const d of det) {
    doc.text(d, x + 4.9, cursor);
    cursor += 2.7;
  }
  doc.setTextColor(26, 26, 26);
  return cursor + 1.6;
}

export async function buildPdf(
  plan: Plan,
  mapEl: HTMLElement | null,
  mapWidthPx: number,
  boost?: (on: boolean) => void
): Promise<Uint8Array> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const [lat, lng] = plan.center;
  const nArt = kindCount(plan, 'artifice');
  const groundMeters = mapWidthPx * metersPerPixel(lat, plan.zoom);
  const denom = scaleDenominator(groundMeters, IMG.w);
  // hauteur d'image déduite du cadrage réel de la carte (pas d'étirement)
  const aspect = mapEl && mapEl.clientWidth ? mapEl.clientHeight / mapEl.clientWidth : 0.58;
  const imgH = Math.min(IMG.y + 150, IMG.w * aspect);

  // ---- Page 1 : carte + cartouche
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(26, 26, 26);
  doc.text(plan.titre, 10, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(`Plan de feu · ${plan.date}`, 10, 21.5);

  const png = mapEl ? await capture(mapEl, boost) : null;
  if (png) {
    doc.addImage(png, 'JPEG', IMG.x, IMG.y, IMG.w, imgH, undefined, 'FAST');
  } else {
    doc.setDrawColor(210, 210, 210);
    doc.rect(IMG.x, IMG.y, IMG.w, imgH);
    doc.setTextColor(160, 160, 160);
    doc.setFontSize(9);
    doc.text('Fond de carte non disponible (hors ligne)', IMG.x + 4, IMG.y + 8);
  }
  doc.setDrawColor(232, 232, 232);
  doc.rect(IMG.x, IMG.y, IMG.w, imgH);

  // cartouche
  let cy = IMG.y + 4;
  doc.setFontSize(8.5);
  doc.setTextColor(26, 26, 26);
  doc.setFont('helvetica', 'bold');
  doc.text('Cartouche', COL.x, cy);
  cy += 6;
  const rows: [string, string][] = [
    ['Artifices', String(nArt)],
    ['DS maximale', `${Math.round(plan.elements.reduce((m, e) => Math.max(m, e.ds ?? 0), 0))} m`],
    ['Barriérages', String(kindCount(plan, 'barrierage'))],
    ['Zone public', String(kindCount(plan, 'zone_public'))],
    ['Zones perso', String(kindCount(plan, 'zone_perso'))],
    [
      'Autres éléments',
      String(
        plan.elements.length -
          nArt -
          kindCount(plan, 'barrierage') -
          kindCount(plan, 'zone_public') -
          kindCount(plan, 'zone_perso')
      ),
    ],
    ['Centre', formatCoord(lat, lng)],
    ['Échelle', denom ? `1:${denom}` : '—'],
    ['Fond', plan.base === 'sat' ? 'Satellite (Esri)' : 'Plan (OSM)'],
    ['Édité le', new Date().toLocaleString('fr-FR')],
  ];
  doc.setFontSize(7.5);
  for (const [k, v] of rows) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(k, COL.x, cy);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 26, 26);
    doc.text(v, COL.x + COL.w, cy, { align: 'right' });
    cy += 5.6;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text('Éléments numérotés sur la carte — légende détaillée page 2.', IMG.x, IMG.y + imgH + 7);

  // ---- Pages suivantes : légende (icônes de chaque type, comme sur la carte)
  if (plan.elements.length) {
    const icons = new Map<string, string | null>();
    for (const e of plan.elements) {
      const key = `${e.kind}|${colorOf(e)}`;
      if (!icons.has(key)) icons.set(key, await iconPng(e.kind, colorOf(e)));
    }
    const colW = 88;
    const colX = [10, 102, 194];
    const bottom = 200;
    let col = 0;
    let y = LEGEND_TOP;

    const header = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(26, 26, 26);
      doc.text('Légende', 10, 20);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text(`${plan.elements.length} éléments · GPS WGS84`, 10, 25);
    };

    const newPage = () => {
      doc.addPage('a4', 'landscape');
      col = 0;
      y = LEGEND_TOP;
      header();
    };

    newPage();
    plan.elements.forEach((e, i) => {
      if (y + 13 > bottom) {
        col += 1;
        y = LEGEND_TOP;
        if (col > 2) newPage();
      }
      y = legendRow(doc, e, i + 1, colX[col], y, colW, icons.get(`${e.kind}|${colorOf(e)}`) ?? null);
    });
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(150, 150, 150);
    doc.text(`Plan de feu · ${plan.titre} · page ${p}/${pages}`, 10, 205);
  }

  return new Uint8Array(doc.output('arraybuffer'));
}
