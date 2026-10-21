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

// A4 paysage, tout sur une page : carte + cartouche en haut, légende en bas, pied.
const FRAME = { x: 8, y: 8, w: 281, h: 194 };
const MAP = { x: 8, y: FRAME.y, w: 186, h: 134 };
const BOX = { x: 194, y: FRAME.y, w: 95, h: 134 };
const LEG = { x: 8, w: 281, bottom: 195 };
const FOOT_Y = 199;

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

/** Tronque un texte à la largeur disponible (police déjà réglée). */
function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/** Détails techniques d'un élément, sur une seule ligne. */
function detailOf(e: PElement): string {
  const d: string[] = [];
  if (e.ref) d.push(`réf ${e.ref}`);
  if (e.calibre != null) d.push(`${e.calibre} mm`);
  if (e.ds != null) d.push(`DS ${e.ds} m`);
  if (e.ring?.length) {
    d.push(
      isZone(e.kind)
        ? `${e.ring.length} pts · périmètre ${formatMeters(ringLength(e.ring, true))} m · ${formatMeters(ringArea(e.ring))} m²`
        : `${e.ring.length} pts · longueur ${formatMeters(ringLength(e.ring))} m`
    );
  }
  d.push(formatCoord(e.lat, e.lng));
  return d.join(' · ');
}

function legendRow(
  doc: jsPDF,
  e: PElement,
  n: number,
  x: number,
  y: number,
  w: number,
  icon: string | null,
  fontPt: number
): void {
  if (icon) {
    doc.addImage(icon, 'PNG', x, y - 2.9, 3.2, 3.2, undefined, 'FAST');
  } else {
    const [r, g, b] = hexToRgb(colorOf(e));
    doc.setFillColor(r, g, b);
    doc.roundedRect(x, y - 2.4, 2.6, 2.6, 0.8, 0.8, 'F');
  }
  const tx = x + 4.4;
  const maxW = w - 4.4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontPt);
  doc.setTextColor(...INK);
  const kindLabel = KIND_META[e.kind].label;
  const title = e.label && e.label !== kindLabel ? `${n}. ${kindLabel} — ${e.label}` : `${n}. ${kindLabel}`;
  const head = fitText(doc, title, maxW);
  doc.text(head, tx, y);

  const headW = doc.getTextWidth(head) + 1.2;
  if (headW < maxW) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(fitText(doc, detailOf(e), maxW - headW), tx + headW, y);
  }
}

/** Cadre extérieur + filet intérieur : le « cadre » du cartouche. */
function drawFrame(doc: jsPDF): void {
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.4);
  doc.rect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);
  doc.setLineWidth(0.12);
  doc.rect(FRAME.x + 1.2, FRAME.y + 1.2, FRAME.w - 2.4, FRAME.h - 2.4);
}

/** Une ligne de cartouche : libellé à gauche, valeur en gras à droite. */
function statRow(doc: jsPDF, y: number, label: string, value: string): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(...MUTED);
  doc.text(label, BOX.x + 3, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...INK);
  doc.text(fitText(doc, value, BOX.w - 30), BOX.x + BOX.w - 3, y, { align: 'right' });
}

/** Filet horizontal dans le cartouche. */
function boxRule(doc: jsPDF, y: number): void {
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.12);
  doc.line(BOX.x, y, BOX.x + BOX.w, y);
}

/** Commune seule, extraite du libellé d'adresse (« Sarrey 63550 … » -> « Sarrey »). */
function cityOf(site: string): string {
  return site.replace(/\s+\d{5}.*$/, '').trim() || site.trim() || '—';
}

/** Cartouche « schéma de mise en œuvre » : blocs empilés façon cartouche de plan. */
function drawCartouche(doc: jsPDF, plan: Plan, metersPerMm: number, h: number): void {
  const x = BOX.x;
  const w = BOX.w;
  const cx = x + w / 2;

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.rect(x, BOX.y, w, h);

  // 1. bandeau titre
  doc.setFillColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text('SCHÉMA DE MISE EN ŒUVRE', cx, BOX.y + 6.6, { align: 'center' });
  boxRule(doc, BOX.y + 10.5);

  // 2. lieu : ville en gros, adresse/commune complète, date
  let y = BOX.y + 15;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.4);
  doc.setTextColor(...MUTED);
  doc.text('Spectacle pyrotechnique', cx, y, { align: 'center' });

  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(fitText(doc, cityOf(plan.site), w - 8), cx, y, { align: 'center' });

  y += 5.4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(fitText(doc, plan.site || 'Lieu non renseigné', w - 8), cx, y, { align: 'center' });

  y += 4.6;
  doc.setFontSize(7);
  doc.setTextColor(...INK);
  doc.text(
    new Date(`${plan.date}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
    cx,
    y,
    { align: 'center' }
  );
  boxRule(doc, BOX.y + 36);

  // 3. échelle mesurable + date d'étude (deux cases)
  const half = w / 2;
  const leftCx = x + half / 2;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.12);
  doc.line(x + half, BOX.y + 36, x + half, BOX.y + 54);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...MUTED);
  doc.text('Échelle', leftCx, BOX.y + 40, { align: 'center' });
  doc.text("Date d'étude", x + half * 1.5, BOX.y + 40, { align: 'center' });

  // barre cotée à sa longueur réelle sur le papier : seul repère d'échelle du plan
  const bar = scaleBarLength(metersPerMm, 38);
  if (bar.meters) {
    const by = BOX.y + 48.5;
    const bx = leftCx - bar.mm / 2;
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.2);
    doc.line(bx, by, bx + bar.mm, by);
    doc.setFillColor(...INK);
    for (const [px, dir] of [
      [bx, 1],
      [bx + bar.mm, -1],
    ] as [number, number][]) {
      doc.triangle(px, by, px + 1.8 * dir, by - 0.9, px + 1.8 * dir, by + 0.9, 'F');
    }
    // graduation médiane
    doc.setDrawColor(...MUTED);
    doc.setLineWidth(0.12);
    doc.line(bx + bar.mm / 2, by - 0.9, bx + bar.mm / 2, by + 0.9);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.4);
    doc.setTextColor(...INK);
    doc.text(`${formatMeters(bar.meters)} m`, leftCx, by + 4.2, { align: 'center' });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...INK);
  doc.text(new Date().toLocaleDateString('fr-FR'), x + half * 1.5, BOX.y + 47, { align: 'center' });
  boxRule(doc, BOX.y + 54);

  // 4. seule valeur conservée : la distance de sécurité maximale
  const maxDs = Math.round(plan.elements.reduce((m, e) => Math.max(m, e.ds ?? 0), 0));
  statRow(doc, BOX.y + 60, 'DS maximale', `${maxDs} m`);

  // 5. pied de cartouche : GPS + édition
  const fy = BOX.y + h - 10.4;
  boxRule(doc, fy - 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...MUTED);
  doc.text('Coordonnées', x + 3, fy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.6);
  doc.setTextColor(...INK);
  doc.text(formatCoord(plan.center[0], plan.center[1], 5), x + w - 3, fy, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...MUTED);
  doc.text('Édité le', x + 3, fy + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.6);
  doc.setTextColor(...INK);
  doc.text(
    new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }),
    x + w - 3,
    fy + 5,
    { align: 'right' }
  );
}

/** Flèche du nord. */
function drawNorth(doc: jsPDF, x: number, y: number): void {
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(255, 255, 255);
  doc.rect(x - 4, y - 4.5, 8, 11, 'F');
  doc.setFillColor(...INK);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.15);
  doc.triangle(x, y, x - 1.7, y + 5, x + 1.7, y + 5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...INK);
  doc.text('N', x, y - 0.6, { align: 'center' });
}

export async function buildPdf(
  plan: Plan,
  mapEl: HTMLElement | null,
  mapWidthPx: number,
  boost?: (on: boolean) => void
): Promise<Uint8Array> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const [lat, lng] = plan.center;
  const groundMeters = mapWidthPx * metersPerPixel(lat, plan.zoom);
  const metersPerMm = groundMeters / MAP.w;

  drawFrame(doc);

  // ---- Carte : hauteur déduite du cadrage réel (pas de bandes blanches)
  const png = mapEl ? await capture(mapEl, boost) : null;
  const aspect = mapEl && mapEl.clientHeight ? mapEl.clientHeight / mapEl.clientWidth : MAP.h / MAP.w;
  const imgH = Math.min(MAP.h, MAP.w * aspect);
  const boxH = Math.max(100, imgH);
  const legY = MAP.y + Math.max(imgH, boxH) + 8;
  if (png) {
    doc.addImage(png, 'JPEG', MAP.x, MAP.y, MAP.w, imgH, undefined, 'FAST');
  } else {
    doc.setDrawColor(210, 210, 210);
    doc.rect(MAP.x, MAP.y, MAP.w, imgH);
    doc.setTextColor(160, 160, 160);
    doc.setFontSize(9);
    doc.text('Fond de carte non disponible (hors ligne)', MAP.x + 4, MAP.y + 8);
  }
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.15);
  doc.rect(MAP.x, MAP.y, MAP.w, imgH);

  drawNorth(doc, MAP.x + MAP.w - 8, MAP.y + 8);

  // ---- Cartouche (même hauteur que la carte : la légende reste sous les deux)
  drawCartouche(doc, plan, metersPerMm, boxH);

  // ---- Légende : 3 colonnes, police réduite tant que ça tient sur la page
  if (plan.elements.length) {
    const icons = new Map<string, string | null>();
    for (const e of plan.elements) {
      const key = `${e.kind}|${colorOf(e)}`;
      if (!icons.has(key)) icons.set(key, await iconPng(e.kind, colorOf(e)));
    }

    const inner = LEG.w - 6;
    const colW = inner / 3;
    const colX = [LEG.x + 3, LEG.x + 3 + colW, LEG.x + 3 + 2 * colW];
    const avail = LEG.bottom - legY - 6;

    let fontPt = 6.2;
    let capacity = 0;
    for (const f of [6.2, 5.8, 5.4, 5.0, 4.6]) {
      capacity = Math.floor(avail / (f * 0.68));
      fontPt = f;
      if (capacity * 3 >= plan.elements.length) break;
    }
    const rowStep = fontPt * 0.68;
    // réparti sur les 3 colonnes sans laisser deux colonnes vides
    const perCol = Math.min(capacity, Math.ceil(plan.elements.length / 3));

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text('Légende', LEG.x + 3, legY - 2);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.2);
    doc.setTextColor(...MUTED);
    doc.text(
      fitText(
        doc,
        'Les différents matériels seront positionnés en fonction de leur distance de sécurité respective, conformément à la réglementation en vigueur.',
        LEG.w - 40
      ),
      LEG.x + 22,
      legY - 2
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.text(`${plan.elements.length} éléments`, LEG.x + LEG.w - 3, legY - 2, { align: 'right' });
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.12);
    doc.line(LEG.x + 3, legY - 1.6, LEG.x + LEG.w - 3, legY - 1.6);

    plan.elements.forEach((e, i) => {
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      if (col > 2) {
        // ponytail: au-delà de ~40 éléments on déborde sur une 2e page plutôt que d'inventer une mise en page
        doc.addPage('a4', 'landscape');
        drawFrame(doc);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...INK);
        doc.text(`LÉGENDE (suite) — ${plan.titre}`, LEG.x + 1.2, 20);
        return;
      }
      legendRow(
        doc,
        e,
        i + 1,
        colX[col],
        legY + row * rowStep + 2.6,
        colW,
        icons.get(`${e.kind}|${colorOf(e)}`) ?? null,
        fontPt
      );
    });
  }

  // ---- Pied de page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(150, 150, 150);
    doc.text(`Plan de feu · ${plan.titre}`, FRAME.x + 1.2, FOOT_Y);
    doc.text(
      `Coordonnées WGS84 · page ${p}/${pages}`,
      FRAME.x + FRAME.w - 1.2,
      FOOT_Y,
      { align: 'right' }
    );
  }

  return new Uint8Array(doc.output('arraybuffer'));
}
