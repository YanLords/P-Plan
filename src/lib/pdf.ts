import { jsPDF } from 'jspdf';
import { toCanvas } from 'html-to-image';
import QRCode from 'qrcode';
import { companyIsEmpty, vcardOf, type Company } from './settings-model';
import type { Plan, Kind } from './elements';
import { KIND_META, colorOf } from './elements';
import { iconSource } from './icons';
import { formatCoord, formatMeters, metersPerPixel, scaleBarLength } from './geo';
import { cityOf, legendRowsFor, type LegRow } from './legend';

// A4 paysage : carte pleine largeur en haut, cartouche (gauche) + légende (droite) dessous.
const FRAME = { x: 8, y: 8, w: 281, h: 194 };
const MAP = { x: 8, y: FRAME.y, w: 281, maxH: 160 };
const CART = { x: 8, w: 100 };
const LEG = { x: 114, w: 175, bottom: 195 };
const FOOT_Y = 199;
/** Types regroupés en une seule ligne de légende (un seul point d'eau, un seul extincteur…). */

const INK: [number, number, number] = [26, 26, 26];
const MUTED: [number, number, number] = [110, 110, 110];
const RULE: [number, number, number] = [184, 184, 184];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Largeur de la carte dans le PDF : 2000 px pour 281 mm, soit 180 dpi à l'impression. */
const MAP_PX = 2000;

async function capture(mapEl: HTMLElement): Promise<string | null> {
  try {
    // capture directement à la résolution de sortie : pas de PNG intermédiaire,
    // et jamais plus de pixels que nécessaire (un PNG plein écran ferait 25 Mo de PDF)
    const ratio = Math.min(2, Math.max(1, MAP_PX / (mapEl.clientWidth || MAP_PX)));
    const canvas = await toCanvas(mapEl, { pixelRatio: ratio, cacheBust: true, backgroundColor: '#ffffff' });
    return toJpeg(canvas, MAP_PX);
  } catch (err) {
    // ponytail: tuiles distantes non capturables (CORS/réseau) -> plan sans fond de carte
    console.warn('[pdf] capture de la carte impossible', err);
    return null;
  }
}

/** Élargit la carte au format du plan avant la capture ; renvoie sa largeur en px CSS. */
export type PdfFit = (aspect: number, on: boolean) => Promise<number | void>;

/** JPEG du canvas, réduit à `maxWidth` seulement s'il est plus large. */
function toJpeg(src: HTMLCanvasElement, maxWidth: number): string {
  const scale = Math.min(1, maxWidth / src.width);
  if (scale === 1) return src.toDataURL('image/jpeg', 0.86);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(src.width * scale);
  canvas.height = Math.round(src.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return src.toDataURL('image/jpeg', 0.86);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.86);
}

/** Icône de l'élément rendue en PNG (jsPDF ne sait pas dessiner un SVG). */
const iconCache = new Map<string, string>();

/** Couleur claire (ex. blanc) : sur papier elle disparaît, elle reçoit alors un contour noir. */
function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 200;
}

async function iconPng(kind: Kind, color: string): Promise<string | null> {
  const key = `${kind}|${color}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  try {
    const img = new Image();
    img.src = iconSource(kind, color);
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    if (isLight(color)) {
      // silhouette noire du dessin, reproduite autour de l'icône (contour de 4 px sur 64)
      const mask = document.createElement('canvas');
      mask.width = mask.height = 64;
      const mctx = mask.getContext('2d');
      if (!mctx) return null;
      mctx.drawImage(img, 0, 0, 64, 64);
      mctx.globalCompositeOperation = 'source-in';
      mctx.fillStyle = '#000';
      mctx.fillRect(0, 0, 64, 64);
      for (let a = 0; a < 16; a++) {
        const angle = (a / 16) * Math.PI * 2;
        ctx.drawImage(mask, Math.cos(angle) * 4, Math.sin(angle) * 4, 64, 64);
      }
    }
    ctx.drawImage(img, 0, 0, 64, 64);
    const png = canvas.toDataURL('image/png');
    iconCache.set(key, png);
    return png;
  } catch {
    return null; // PDF sans icône plutôt qu'un export qui échoue
  }
}

/** Dimensions d'une image (logo) en pixels. */
async function imageSize(src: string): Promise<{ w: number; h: number } | null> {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    return { w: img.width, h: img.height };
  } catch {
    return null;
  }
}

/** QR code de contact (vCard) en PNG, ou null si la génération échoue. */
async function qrPng(text: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(text, { margin: 0, width: 320, errorCorrectionLevel: 'M' });
  } catch {
    return null;
  }
}

/** Découpe un texte en lignes selon la largeur imprimable (police déjà réglée). */
function wrapText(doc: jsPDF, text: string, maxWidth: number, maxLines = 2): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (!line || doc.getTextWidth(next) <= maxWidth) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines) {
    if (line) lines.push(line);
    return lines;
  }
  // débordement : la dernière ligne est tronquée proprement
  const kept = lines.slice(0, maxLines - 1);
  const rest = [lines[maxLines - 1], line].filter(Boolean).join(' ');
  return [...kept, fitText(doc, rest, maxWidth)];
}

/** Tronque un texte à la largeur disponible (police déjà réglée). */
function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/** Une rangée de légende découpée en lignes (rien n'est tronqué). */
type LegBox = { head: string[]; details: string[]; note: string[]; lines: number; h: number };

/** Mesure une rangée : libellé et détail sur plusieurs lignes si besoin, note comprise. */
function legendBox(doc: jsPDF, row: LegRow, maxW: number, fontPt: number, noteStep: number): LegBox {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontPt);
  const head = wrapText(doc, row.label, maxW, Infinity);
  let details: string[] = [];
  if (row.details) {
    doc.setFont('helvetica', 'normal');
    details = wrapText(doc, row.details, maxW, Infinity);
  }
  let note: string[] = [];
  if (row.note) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(Math.max(4.4, fontPt - 0.8));
    note = wrapText(doc, row.note, maxW, Infinity);
  }
  const lines = head.length + details.length;
  const h = fontPt * 0.72 + (lines - 1) * fontPt * 0.4 + note.length * noteStep;
  return { head, details, note, lines, h };
}

function legendRow(
  doc: jsPDF,
  row: LegRow,
  x: number,
  y: number,
  icon: string | null,
  fontPt: number,
  box: LegBox
): void {
  const [cr, cg, cb] = hexToRgb(row.color);
  if (KIND_META[row.kind].shape === 'line') {
    // barriérage / voie de sortie : le trait du plan, fléché pour une sortie
    doc.setDrawColor(cr, cg, cb);
    doc.setLineWidth(0.9);
    const end = x + 3.4;
    doc.line(x, y - 0.7, row.kind === 'sortie' ? end - 1 : end, y - 0.7);
    if (row.kind === 'sortie') {
      doc.setFillColor(cr, cg, cb);
      doc.triangle(end, y - 0.7, end - 1.6, y - 1.7, end - 1.6, y + 0.3, 'F');
    }
  } else if (icon) {
    doc.addImage(icon, 'PNG', x, y - 2.9, 3.4, 3.4, undefined, 'FAST');
  } else {
    doc.setFillColor(cr, cg, cb);
    doc.roundedRect(x, y - 2.4, 2.8, 2.8, 0.8, 0.8, 'F');
  }
  const tx = x + 4.8;
  const lineH = fontPt * 0.4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontPt);
  doc.setTextColor(...INK);
  box.head.forEach((t, i) => doc.text(t, tx, y + i * lineH));

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  box.details.forEach((t, i) => doc.text(t, tx, y + (box.head.length + i) * lineH));
}

/** Cadre extérieur du plan (filet unique). */
function drawFrame(doc: jsPDF): void {
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.4);
  doc.rect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);
}

/** Une ligne de cartouche : libellé à gauche, valeur en gras à droite. */
function statRow(doc: jsPDF, y: number, label: string, value: string, fs = 1): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6 * fs);
  doc.setTextColor(...MUTED);
  doc.text(label, CART.x + 3, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7 * fs);
  doc.setTextColor(...INK);
  doc.text(fitText(doc, value, CART.w - 32), CART.x + CART.w - 3, y, { align: 'right' });
}

/** Filet horizontal dans le cartouche. */
function boxRule(doc: jsPDF, y: number): void {
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.12);
  doc.line(CART.x, y, CART.x + CART.w, y);
}

/** Commune seule, extraite du libellé d'adresse (« Sarrey 63550 … » -> « Sarrey »). */
/** Cartouche « schéma de mise en œuvre » compact, sous la carte. */
function drawCartouche(
  doc: jsPDF,
  plan: Plan,
  metersPerMm: number,
  y0: number,
  h: number,
  company: Company,
  qr: string | null,
  logo: { w: number; h: number } | null
): void {
  const x = CART.x;
  const w = CART.w;
  const cx = x + w / 2;
  const showCompany = !companyIsEmpty(company) || !!qr;
  const S = showCompany ? 19 : 0; // hauteur du bloc entreprise (logo + contact + QR)
  // le cartouche se comprime quand la carte prend de la place (pas de troncature du plan)
  const DESIGN_H = 44 + S; // dernière ligne du dessin
  const k = Math.min(1, (h - 1.5) / DESIGN_H);
  const fs = Math.max(0.7, k);
  // `sat` = coordonnées du bloc entreprise (avant le décalage S), `at` = contenu courant
  const sat = (v: number) => y0 + v * k;
  const at = (v: number) => y0 + 2 + (v + S) * k;
  const unit = (mm: number) => mm * k;

  if (showCompany) {
    // 0. identité : logo à gauche, coordonnées au centre, QR de contact à droite
    const box = unit(28); // logo doublé (cap vertical au filet via maxH)
    const maxH = unit(17.6); // ne dépasse pas le filet du bloc entreprise
    if (company.logo && logo) {
      const ratio = Math.min(box / logo.w, box / logo.h, maxH / logo.h);
      doc.addImage(company.logo, 'PNG', x + 1.5, sat(0.6), logo.w * ratio, logo.h * ratio, undefined, 'FAST');
    }
    const qrSize = qr ? unit(17) : 0;
    const textX = x + 1.5 + box + 2.5;
    const textW = x + w - 1.5 - (qr ? qrSize + 1.5 : 0) - textX;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2 * fs);
    doc.setTextColor(...INK);
    doc.text(fitText(doc, company.name || '—', textW), textX, sat(4.4));

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2 * fs);
    doc.setTextColor(...INK);
    [company.address, company.phone, company.email, company.website]
      .filter(Boolean)
      .slice(0, 4)
      .forEach((line, i) => doc.text(fitText(doc, line, textW), textX, sat(8.6 + i * 3.1)));

    if (qr) {
      doc.addImage(qr, 'PNG', x + w - 1.5 - qrSize, sat(0.6), qrSize, qrSize, undefined, 'FAST');
    }
    boxRule(doc, sat(19.4));
  }

  // titre
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14 * fs);
  doc.setTextColor(...INK);
  doc.text('SCHÉMA DE MISE EN ŒUVRE', cx, at(7.2), { align: 'center' });
  boxRule(doc, at(11.2));

  // commune en gros, puis l'adresse complète telle qu'elle a été saisie
  // sans commune identifiable, cityOf renvoie l'adresse entière : elle n'est imprimée qu'une fois
  const address = plan.site.trim();
  const city = cityOf(plan.site);
  const addressIsCity = city === address;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13 * fs);
  doc.setTextColor(...INK);
  doc.text(fitText(doc, city || 'Lieu non renseigné', w - 8), cx, at(16.4), { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8 * fs);
  doc.setTextColor(...MUTED);
  if (address && !addressIsCity) {
    wrapText(doc, address, w - 8, 2).forEach((line, i) => doc.text(line, cx, at(20.4 + i * 3), { align: 'center' }));
  }

  doc.setFontSize(7.2 * fs);
  doc.setTextColor(...INK);
  doc.text(
    new Date(`${plan.date}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
    cx,
    at(26.8),
    { align: 'center' }
  );
  boxRule(doc, at(28.6));

  // échelle mesurable + date d'étude, sur une bande compacte
  const half = w / 2;
  const leftCx = x + half / 2;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.1);
  doc.line(x + half, at(28.6), x + half, at(38.6));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2 * fs);
  doc.setTextColor(...MUTED);
  doc.text('Échelle', leftCx, at(31.6), { align: 'center' });
  doc.text("Date d'étude", x + half * 1.5, at(31.6), { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2 * fs);
  doc.setTextColor(...INK);
  doc.text(new Date().toLocaleDateString('fr-FR'), x + half * 1.5, at(35.4), { align: 'center' });

  // barre cotée à sa longueur réelle sur le papier : seul repère d'échelle
  const bar = scaleBarLength(metersPerMm, half - 12);
  if (bar.meters) {
    const by = at(35.4);
    const bx = leftCx - bar.mm / 2;
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.18);
    doc.line(bx, by, bx + bar.mm, by);
    doc.setFillColor(...INK);
    doc.triangle(bx, by, bx + 1.6, by - 0.75, bx + 1.6, by + 0.75, 'F');
    doc.triangle(bx + bar.mm, by, bx + bar.mm - 1.6, by - 0.75, bx + bar.mm - 1.6, by + 0.75, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2 * fs);
    doc.text(`${formatMeters(bar.meters)} m`, leftCx, at(38), { align: 'center' });
  }
  boxRule(doc, at(38.6));

  // coordonnées du centre du plan
  statRow(doc, at(42.2), 'Coordonnées', formatCoord(plan.center[0], plan.center[1], 5), fs);
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
  boost?: (on: boolean, mapWidthMm?: number) => void,
  fit?: PdfFit,
  company: Company = { name: '', address: '', phone: '', email: '', website: '', logo: '', qr: false }
): Promise<Uint8Array> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const [lat] = plan.center;
  const showCompany = !companyIsEmpty(company);
  // le bloc entreprise prend de la hauteur : la carte cède la place correspondante
  const maxH = showCompany ? MAP.maxH - 15 : MAP.maxH;
  const target = MAP.w / maxH; // format du plan sur la page

  drawFrame(doc);

  // ---- Carte élargie au format de la page : même échelle, plus de terrain,
  // aucune déformation (au lieu d'être réduite avec des marges blanches)
  let widthPx = mapWidthPx;
  let png: string | null = null;
  if (mapEl) {
    const fitted = await fit?.(target, true);
    if (typeof fitted === 'number' && fitted > 0) widthPx = fitted;
    boost?.(true, MAP.w);
    // laisse le navigateur repeindre traits/icônes épaissis avant la capture
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      png = await capture(mapEl);
    } finally {
      boost?.(false);
      await fit?.(target, false);
    }
  }
  const groundMeters = widthPx * metersPerPixel(lat, plan.zoom);

  // « contain » : l'image remplit la case sans jamais être déformée
  const hpx = mapEl?.clientHeight ?? Math.round(mapWidthPx / target);
  const scale = Math.min(MAP.w / widthPx, maxH / hpx);
  const imgW = widthPx * scale;
  const imgH = hpx * scale;
  const imgX = MAP.x + (MAP.w - imgW) / 2;
  const metersPerMm = groundMeters / imgW;
  if (png) {
    doc.addImage(png, 'JPEG', imgX, MAP.y, imgW, imgH, undefined, 'FAST');
  } else {
    doc.setDrawColor(210, 210, 210);
    doc.rect(imgX, MAP.y, imgW, imgH);
    doc.setTextColor(160, 160, 160);
    doc.setFontSize(9);
    doc.text('Fond de carte non disponible (hors ligne)', imgX + 4, MAP.y + 8);
  }
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.15);
  doc.rect(imgX, MAP.y, imgW, imgH);
  drawNorth(doc, imgX + imgW - 8, MAP.y + 8);

  // ---- Bande basse : cartouche à gauche, légende à droite
  const bandY = MAP.y + imgH + 1.5; // serré sous la carte : le bloc entreprise remonte
  const bandH = LEG.bottom - bandY;
  const qr = company.qr && showCompany ? await qrPng(vcardOf(company)) : null;
  const logo = company.logo ? await imageSize(company.logo) : null;
  drawCartouche(doc, plan, metersPerMm, bandY, bandH, company, qr, logo);

  const rows = legendRowsFor(plan);
  if (rows.length) {
    const icons = new Map<string, string | null>();
    for (const r of rows) {
      const key = `${r.kind}|${r.color}`;
      if (!icons.has(key)) icons.set(key, await iconPng(r.kind, r.color));
    }

    // en-tête de légende
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text('Légende', LEG.x, bandY + 3.6);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(5.6);
    doc.setTextColor(...MUTED);
    doc.text(
      fitText(
        doc,
        'Les différents matériels seront positionnés en fonction de leur distance de sécurité respective, conformément à la réglementation en vigueur.',
        LEG.w - 20
      ),
      LEG.x + 21,
      bandY + 3.6
    );
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.12);
    doc.line(LEG.x, bandY + 5.6, LEG.x + LEG.w, bandY + 5.6);

    const noteStep = 2.4; // interligne de la note sous sa ligne
    // police de +1 pt au minimum, +2 pt si la légende tient en 2 à 4 colonnes
    const top = bandY + 10;
    const inner = LEG.w - 4;
    const gap = 4;
    const avail = LEG.bottom - top;

    // rangées placées colonne par colonne, de haut en bas ; une page pleine passe à la suivante
    const LEG_TOP_NEXT = 24; // haut de la légende sur les pages suivantes
    const paginate = (fontPt: number, cols: number) => {
      const colW = (inner - gap * (cols - 1)) / cols;
      const pages: { row: LegRow; col: number; y: number; box: LegBox }[][] = [[]];
      let col = 0;
      let y = 0;
      rows.forEach((row) => {
        const box = legendBox(doc, row, colW - 4.8, fontPt, noteStep);
        const limit = pages.length === 1 ? avail : LEG.bottom - LEG_TOP_NEXT;
        if (y > 0 && y + box.h > limit) {
          col++;
          y = 0;
          if (col >= cols) {
            pages.push([]);
            col = 0;
          }
        }
        pages[pages.length - 1].push({ row, col, y, box });
        y += box.h;
      });
      return pages;
    };

    // la plus grande police qui tient sur une page, avec le moins de colonnes possible ;
    // sinon 7,2 pt sur 4 colonnes, et le reste sur les pages suivantes
    let chosen = { fontPt: 7.2, cols: 4, pages: paginate(7.2, 4) };
    search: for (const f of [8.2, 8.0, 7.8, 7.6, 7.4, 7.2]) {
      for (const cols of [2, 3, 4]) {
        const pages = paginate(f, cols);
        if (pages.length === 1) {
          chosen = { fontPt: f, cols, pages };
          break search;
        }
      }
    }
    const { fontPt, cols, pages: legendPages } = chosen;
    const colW = (inner - gap * (cols - 1)) / cols;
    const colX = Array.from({ length: cols }, (_, i) => LEG.x + i * (colW + gap));

    for (const [p, pagePlaced] of legendPages.entries()) {
      if (p > 0) {
        doc.addPage('a4', 'landscape');
        drawFrame(doc);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...INK);
        doc.text(`LÉGENDE (suite) — ${plan.titre}`, FRAME.x + 6, 20);
      }
      // sur les pages suivantes, la légende part du bord gauche du cadre
      const pageTop = p === 0 ? top : LEG_TOP_NEXT;
      const pageX = (col: number) => (p === 0 ? colX[col] : FRAME.x + 6 + col * (colW + gap));
      for (const { row, col, y, box } of pagePlaced) {
        const lineY = pageTop + y + 2;
        legendRow(doc, row, pageX(col), lineY, icons.get(`${row.kind}|${row.color}`) ?? null, fontPt, box);
        // la note de l'élément, juste sous le libellé
        box.note.forEach((t, i) => {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(Math.max(4.4, fontPt - 0.8));
          doc.setTextColor(60, 60, 60);
          doc.text(t, pageX(col) + 4.6, lineY + (box.lines - 1) * fontPt * 0.4 + noteStep * (i + 1));
        });
      }
    }

  }

  // ---- Pied de page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Coordonnées WGS84 · page ${p}/${pages}`,
      FRAME.x + FRAME.w - 1.2,
      FOOT_Y,
      { align: 'right' }
    );
  }

  return new Uint8Array(doc.output('arraybuffer'));
}
