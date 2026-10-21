import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
import type { Plan, PElement, Kind } from './elements';
import { KIND_META, colorOf, kindIconSvg, isZone } from './elements';
import {
  formatCoord,
  formatMeters,
  metersPerPixel,
  ringArea,
  ringLength,
  scaleBarLength,
} from './geo';

// A4 portrait : plan pivoté à 90° (pleine hauteur) à gauche, panneau d'infos à droite.
const FRAME = { x: 8, y: 8, w: 194, h: 281 };
const MAP_MAX_LEN = 272; // longueur du plan dans le sens vertical
const PANEL = { minW: 38, gap: 4 };
const CART_H = 52;
const FOOT_Y = 285;
/** Types regroupés en une seule ligne de légende (un seul point d'eau, un seul extincteur…). */
const MERGED: Kind[] = ['point_eau', 'extincteur', 'echelle', 'accueil_secours', 'acces_secours', 'surveillance'];

const INK: [number, number, number] = [26, 26, 26];
const MUTED: [number, number, number] = [110, 110, 110];
const RULE: [number, number, number] = [184, 184, 184];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

async function capture(mapEl: HTMLElement, boost?: (on: boolean) => void): Promise<string | null> {
  boost?.(true);
  // laisse le navigateur repeindre traits/icônes épaissis avant la capture
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    // capture 2x puis réduction + rotation + JPEG : un PNG plein écran ferait 25 Mo
    const raw = await toPng(mapEl, { pixelRatio: 2, cacheBust: true, backgroundColor: '#ffffff' });
    return await downscale(raw, 2000, true);
  } catch (err) {
    // ponytail: tuiles distantes non capturables (CORS/réseau) -> plan sans fond de carte
    console.warn('[pdf] capture de la carte impossible', err);
    return null;
  } finally {
    boost?.(false);
  }
}

/**
 * Réduit l'image ; `rotate` la tourne d'un quart de tour (sens antihoraire) pour
 * qu'elle se lise en tournant la feuille dans le sens horaire.
 */
async function downscale(dataUrl: string, maxWidth: number, rotate = false): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  const scale = Math.min(1, maxWidth / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = rotate ? h : w;
  canvas.height = rotate ? w : h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  if (rotate) {
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, 0, 0, w, h);
  } else {
    ctx.drawImage(img, 0, 0, w, h);
  }
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

/** Tronque un texte à la largeur disponible (police déjà réglée). */
function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/** Détails techniques d'un élément, sur une seule ligne (sans GPS : la carte suffit). */
function detailOf(e: PElement): string {
  const d: string[] = [];
  if (e.kind === 'artifice') {
    if (e.ds != null) d.push(`DS ${e.ds} m`);
    if (e.ref) d.push(`réf ${e.ref}`);
    if (e.calibre != null) d.push(`${e.calibre} mm`);
    return d.join(' · ');
  }
  if (e.ring?.length) {
    d.push(
      isZone(e.kind)
        ? `${formatMeters(ringLength(e.ring, true))} m · ${formatMeters(ringArea(e.ring))} m²`
        : `${formatMeters(ringLength(e.ring))} m`
    );
  }
  return d.join(' · ');
}

interface LegRow {
  kind: Kind;
  color: string;
  label: string;
  details: string;
}

/** Lignes de légende : les équipements répétés sont fusionnés en une seule entrée. */
function legendRowsFor(plan: Plan): LegRow[] {
  const rows: LegRow[] = [];
  const seen = new Set<Kind>();
  for (const e of plan.elements) {
    const meta = KIND_META[e.kind];
    const color = colorOf(e);
    if (MERGED.includes(e.kind)) {
      if (seen.has(e.kind)) continue;
      seen.add(e.kind);
      rows.push({ kind: e.kind, color, label: meta.label, details: '' });
      continue;
    }
    const label =
      e.kind === 'marqueur'
        ? `Marqueur — ${e.label}`
        : e.label && e.label !== meta.label
          ? `${meta.label} — ${e.label}`
          : meta.label;
    rows.push({ kind: e.kind, color, label, details: e.kind === 'marqueur' ? '' : detailOf(e) });
  }
  return rows;
}

function legendRow(
  doc: jsPDF,
  row: LegRow,
  x: number,
  y: number,
  w: number,
  icon: string | null,
  fontPt: number
): void {
  const [cr, cg, cb] = hexToRgb(row.color);
  if (KIND_META[row.kind].shape === 'line') {
    // barriérage : le trait orange lui-même, comme sur le plan
    doc.setDrawColor(cr, cg, cb);
    doc.setLineWidth(0.9);
    doc.line(x, y - 0.7, x + 3.4, y - 0.7);
  } else if (icon) {
    doc.addImage(icon, 'PNG', x, y - 2.9, 3.4, 3.4, undefined, 'FAST');
  } else {
    doc.setFillColor(cr, cg, cb);
    doc.roundedRect(x, y - 2.4, 2.8, 2.8, 0.8, 0.8, 'F');
  }
  const tx = x + 4.6;
  const maxW = w - 4.6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontPt);
  doc.setTextColor(...INK);
  const head = fitText(doc, row.label, maxW);
  doc.text(head, tx, y);

  // détails sur la même ligne si la place le permet, sinon en dessous
  if (row.details) {
    const headW = doc.getTextWidth(head) + 1.2;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    if (headW + 12 < maxW) {
      doc.text(fitText(doc, row.details, maxW - headW), tx + headW, y);
    } else {
      doc.setFontSize(fontPt - 0.4);
      doc.text(fitText(doc, row.details, maxW), tx, y + 3);
    }
  }
}

/** Cadre extérieur + filet intérieur. */
function drawFrame(doc: jsPDF): void {
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.4);
  doc.rect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);
  doc.setLineWidth(0.12);
  doc.rect(FRAME.x + 1.2, FRAME.y + 1.2, FRAME.w - 2.4, FRAME.h - 2.4);
}

/** Filet horizontal dans le panneau. */
function panelRule(doc: jsPDF, x: number, w: number, y: number): void {
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.15);
  doc.line(x, y, x + w, y);
}

/** Commune seule, extraite du libellé d'adresse (« Sarrey 63550 … » -> « Sarrey »). */
function cityOf(site: string): string {
  return site.replace(/\s+\d{5}.*$/, '').trim() || site.trim() || '—';
}

/** Cartouche vertical : blocs empilés dans la colonne de droite. */
function drawCartouche(doc: jsPDF, plan: Plan, metersPerMm: number, x: number, y: number, w: number): void {
  const cx = x + w / 2;
  const inner = w - 5;

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, CART_H);

  // titre sur deux lignes : la colonne est étroite
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...INK);
  doc.text('SCHÉMA DE', cx, y + 4.4, { align: 'center' });
  doc.text('MISE EN ŒUVRE', cx, y + 8.2, { align: 'center' });
  panelRule(doc, x, w, y + 10.4);

  // lieu
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.9);
  doc.setTextColor(...MUTED);
  doc.text('Spectacle pyrotechnique', cx, y + 13.4, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(...INK);
  doc.text(fitText(doc, cityOf(plan.site), inner), cx, y + 18.2, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.9);
  doc.setTextColor(...MUTED);
  const siteLines = plan.site ? (doc.splitTextToSize(plan.site, inner) as string[]).slice(0, 2) : ['Lieu non renseigné'];
  siteLines.forEach((line, i) => doc.text(line, cx, y + 21.6 + i * 2.4, { align: 'center' }));

  doc.setFontSize(5.4);
  doc.setTextColor(...INK);
  doc.text(
    new Date(`${plan.date}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
    cx,
    y + 27.4,
    { align: 'center' }
  );
  panelRule(doc, x, w, y + 29.4);

  // échelle mesurable + date d'étude
  const half = w / 2;
  const leftCx = x + half / 2;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.1);
  doc.line(x + half, y + 29.4, x + half, y + 40.4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.7);
  doc.setTextColor(...MUTED);
  doc.text('Échelle', leftCx, y + 32.4, { align: 'center' });
  doc.text("Date d'étude", x + half * 1.5, y + 32.4, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.6);
  doc.setTextColor(...INK);
  doc.text(new Date().toLocaleDateString('fr-FR'), x + half * 1.5, y + 36.4, { align: 'center' });

  // barre cotée à sa longueur réelle sur le papier : seul repère d'échelle
  const bar = scaleBarLength(metersPerMm, half - 6);
  if (bar.meters) {
    const by = y + 36.4;
    const bx = leftCx - bar.mm / 2;
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.16);
    doc.line(bx, by, bx + bar.mm, by);
    doc.setFillColor(...INK);
    doc.triangle(bx, by, bx + 1.5, by - 0.7, bx + 1.5, by + 0.7, 'F');
    doc.triangle(bx + bar.mm, by, bx + bar.mm - 1.5, by - 0.7, bx + bar.mm - 1.5, by + 0.7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.9);
    doc.text(`${formatMeters(bar.meters)} m`, leftCx, by + 3, { align: 'center' });
  }
  panelRule(doc, x, w, y + 40.4);

  // valeurs conservées
  const row = (dy: number, label: string, value: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.9);
    doc.setTextColor(...MUTED);
    doc.text(label, x + 2.5, y + dy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.4);
    doc.setTextColor(...INK);
    doc.text(fitText(doc, value, w - 13), x + w - 2.5, y + dy, { align: 'right' });
  };
  const maxDs = Math.round(plan.elements.reduce((m, e) => Math.max(m, e.ds ?? 0), 0));
  row(44, 'DS maximale', `${maxDs} m`);
  row(48.2, 'GPS', formatCoord(plan.center[0], plan.center[1], 5));
}

/** Flèche du nord : le plan est pivoté, le nord pointe donc vers la gauche. */
function drawNorthLeft(doc: jsPDF, x: number, y: number): void {
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(255, 255, 255);
  doc.rect(x - 3.5, y - 4, 11, 8, 'F');
  doc.setFillColor(...INK);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.15);
  doc.triangle(x - 4.5, y, x + 0.5, y - 1.7, x + 0.5, y + 1.7, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...INK);
  doc.text('N', x + 2.2, y + 2, { align: 'center' });
}

export async function buildPdf(
  plan: Plan,
  mapEl: HTMLElement | null,
  mapWidthPx: number,
  boost?: (on: boolean) => void
): Promise<Uint8Array> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const [lat] = plan.center;
  const groundMeters = mapWidthPx * metersPerPixel(lat, plan.zoom);

  drawFrame(doc);

  // ---- Plan pivoté : longueur à la verticale, largeur selon le cadrage réel
  const ratio = mapEl && mapEl.clientHeight ? mapEl.clientWidth / mapEl.clientHeight : 1.85;
  // le plan prend d'abord toute la hauteur, puis ce qui reste en largeur pour le panneau
  const widthAvail = FRAME.w - PANEL.minW - PANEL.gap;
  const imgH = Math.min(MAP_MAX_LEN, widthAvail * ratio); // vertical sur la page
  const imgW = imgH / ratio; // horizontal sur la page
  const metersPerMm = groundMeters / imgW;

  const png = mapEl ? await capture(mapEl, boost) : null;
  if (png) {
    doc.addImage(png, 'JPEG', FRAME.x, FRAME.y, imgW, imgH, undefined, 'FAST');
  } else {
    doc.setDrawColor(210, 210, 210);
    doc.rect(FRAME.x, FRAME.y, imgW, imgH);
    doc.setTextColor(160, 160, 160);
    doc.setFontSize(8);
    doc.text('Fond de carte non disponible (hors ligne)', FRAME.x + 4, FRAME.y + 8);
  }
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.15);
  doc.rect(FRAME.x, FRAME.y, imgW, imgH);
  drawNorthLeft(doc, FRAME.x + 8, FRAME.y + 8);

  // ---- Panneau d'informations à droite
  const panelX = FRAME.x + imgW + PANEL.gap;
  const panelW = FRAME.x + FRAME.w - panelX;
  drawCartouche(doc, plan, metersPerMm, panelX, FRAME.y, panelW);

  const rows = legendRowsFor(plan);
  if (rows.length) {
    const icons = new Map<string, string | null>();
    for (const r of rows) {
      const key = `${r.kind}|${r.color}`;
      if (!icons.has(key)) icons.set(key, await iconPng(r.kind, r.color));
    }

    let ly = FRAME.y + CART_H + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...INK);
    doc.text('Légende', panelX, ly);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(4.9);
    doc.setTextColor(...MUTED);
    const intro =
      'Les différents matériels seront positionnés en fonction de leur distance de sécurité respective, conformément à la réglementation en vigueur.';
    const introLines = doc.splitTextToSize(intro, panelW - 1.5) as string[];
    introLines.forEach((line, i) => doc.text(line, panelX, ly + 3.2 + i * 2.1));
    ly += 3.2 + introLines.length * 2.1 + 1.6;
    panelRule(doc, panelX, panelW, ly);
    ly += 4.4;

    // une seule colonne : la colonne est étroite
    const avail = FOOT_Y - 6 - ly;
    let fontPt = 5.8;
    let step = 0;
    for (const f of [5.8, 5.4, 5.0, 4.6]) {
      step = f * 0.78;
      fontPt = f;
      if (Math.floor(avail / step) >= rows.length) break;
    }

    rows.forEach((r, i) => {
      const y = ly + i * step;
      if (y > FOOT_Y - 8) return; // ponytail: au-delà, on n'entasse pas, la légende s'arrête
      legendRow(doc, r, panelX, y, panelW, icons.get(`${r.kind}|${r.color}`) ?? null, fontPt);
    });
  }

  // ---- Pied de page
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.6);
  doc.setTextColor(150, 150, 150);
  doc.text(`Plan de feu · ${plan.titre} · ${plan.site || 'lieu non renseigné'}`, FRAME.x + 1.2, FOOT_Y);
  doc.text('Coordonnées WGS84 · page 1/1', FRAME.x + FRAME.w - 1.2, FOOT_Y, { align: 'right' });

  return new Uint8Array(doc.output('arraybuffer'));
}
