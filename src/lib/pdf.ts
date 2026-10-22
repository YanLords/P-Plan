import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
import QRCode from 'qrcode';
import { companyIsEmpty, vcardOf, type Company } from './settings-model';
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

// A4 paysage : carte pleine largeur en haut, cartouche (gauche) + légende (droite) dessous.
const FRAME = { x: 8, y: 8, w: 281, h: 194 };
const MAP = { x: 8, y: FRAME.y, w: 281, maxH: 148 };
const CART = { x: 8, w: 112 };
const LEG = { x: 126, w: 163, bottom: 195 };
const FOOT_Y = 199;
/** Types regroupés en une seule ligne de légende (un seul point d'eau, un seul extincteur…). */
const MERGED: Kind[] = ['point_eau', 'extincteur', 'echelle', 'accueil_secours', 'acces_secours', 'surveillance'];

const INK: [number, number, number] = [26, 26, 26];
const MUTED: [number, number, number] = [110, 110, 110];
const RULE: [number, number, number] = [184, 184, 184];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

async function capture(mapEl: HTMLElement): Promise<string | null> {
  try {
    // capture 2x puis réduction + JPEG : un PNG plein écran ferait 25 Mo de PDF
    const raw = await toPng(mapEl, { pixelRatio: 2, cacheBust: true, backgroundColor: '#ffffff' });
    return await downscale(raw, 2000);
  } catch (err) {
    // ponytail: tuiles distantes non capturables (CORS/réseau) -> plan sans fond de carte
    console.warn('[pdf] capture de la carte impossible', err);
    return null;
  }
}

/** Élargit la carte au format du plan avant la capture ; renvoie sa largeur en px CSS. */
export type PdfFit = (aspect: number, on: boolean) => Promise<number | void>;

/** Réduit l'image et la recadre au centre au format demandé (largeur/hauteur). */
async function downscale(dataUrl: string, maxWidth: number, aspect?: number): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  const srcAspect = sw / sh;
  if (aspect && srcAspect > aspect) {
    sw = Math.round(sh * aspect);
    sx = Math.round((img.width - sw) / 2);
  } else if (aspect && srcAspect < aspect) {
    sh = Math.round(sw / aspect);
    sy = Math.round((img.height - sh) / 2);
  }

  const scale = Math.min(1, maxWidth / sw);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
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
  const maxW = w - 4.8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontPt);
  doc.setTextColor(...INK);
  const head = fitText(doc, row.label, maxW);
  doc.text(head, tx, y);

  const headW = doc.getTextWidth(head) + 1.4;
  if (row.details && headW < maxW) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(fitText(doc, row.details, maxW - headW), tx + headW, y);
  }
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
  doc.setFontSize(6.2 * fs);
  doc.setTextColor(...MUTED);
  doc.text(label, CART.x + 3, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.6 * fs);
  doc.setTextColor(...INK);
  doc.text(fitText(doc, value, CART.w - 30), CART.x + CART.w - 3, y, { align: 'right' });
}

/** Filet horizontal dans le cartouche. */
function boxRule(doc: jsPDF, y: number): void {
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.12);
  doc.line(CART.x, y, CART.x + CART.w, y);
}

/** Commune seule, extraite du libellé d'adresse (« Sarrey 63550 … » -> « Sarrey »). */
function cityOf(site: string): string {
  return site.replace(/\s+\d{5}.*$/, '').trim() || site.trim() || '—';
}

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
  const S = showCompany ? 22 : 0; // hauteur du bloc entreprise (logo + contact + QR)
  // le cartouche se comprime quand la carte prend de la place (pas de troncature du plan)
  const DESIGN_H = 47.4 + S; // dernière ligne du dessin
  const k = Math.min(1, (h - 3.5) / DESIGN_H);
  const fs = Math.max(0.8, k);
  // `sat` = coordonnées du bloc entreprise (avant le décalage S), `at` = contenu courant
  const sat = (v: number) => y0 + 2 + v * k;
  const at = (v: number) => y0 + 2 + (v + S) * k;
  const unit = (mm: number) => mm * k;

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.rect(x, y0, w, h);

  if (showCompany) {
    // 0. identité : logo à gauche, coordonnées au centre, QR de contact à droite
    const box = unit(13);
    if (company.logo && logo) {
      const ratio = Math.min(box / logo.w, box / logo.h);
      doc.addImage(company.logo, 'PNG', x + 3, sat(1.4), logo.w * ratio, logo.h * ratio, undefined, 'FAST');
    }
    const qrSize = qr ? unit(19) : 0;
    const textX = x + 3 + box + 3;
    const textW = x + w - 3 - (qr ? qrSize + 3 : 0) - textX;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7 * fs);
    doc.setTextColor(...INK);
    doc.text(fitText(doc, company.name || '—', textW), textX, sat(5.4));

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6 * fs);
    doc.setTextColor(...INK);
    [company.address, company.phone, company.email, company.website]
      .filter(Boolean)
      .slice(0, 4)
      .forEach((line, i) => doc.text(fitText(doc, line, textW), textX, sat(9.2 + i * 3.2)));

    if (qr) {
      doc.addImage(qr, 'PNG', x + w - 3 - qrSize, sat(1.4), qrSize, qrSize, undefined, 'FAST');
    }
    boxRule(doc, sat(21));
  }

  // titre
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6 * fs);
  doc.setTextColor(...INK);
  doc.text('SCHÉMA DE MISE EN ŒUVRE', cx, at(5.4), { align: 'center' });
  boxRule(doc, at(8));

  // lieu : ville en gros, adresse complète, date
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8 * fs);
  doc.setTextColor(...MUTED);
  doc.text('Spectacle pyrotechnique', cx, at(11.4), { align: 'center' });

  const city = cityOf(plan.site);
  // le libellé d'adresse commence souvent par la commune : on ne l'imprime pas deux fois
  const rest = plan.site.startsWith(city) ? plan.site.slice(city.length).trim() : plan.site;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5 * fs);
  doc.setTextColor(...INK);
  doc.text(fitText(doc, city || 'Lieu non renseigné', w - 8), cx, at(17.4), { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6 * fs);
  doc.setTextColor(...MUTED);
  if (rest && rest !== city) doc.text(fitText(doc, rest, w - 8), cx, at(21.2), { align: 'center' });

  doc.setFontSize(6.4 * fs);
  doc.setTextColor(...INK);
  doc.text(
    new Date(`${plan.date}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
    cx,
    at(rest && rest !== city ? 25 : 22.6),
    { align: 'center' }
  );
  boxRule(doc, at(27.4));

  // échelle mesurable + date d'étude
  const half = w / 2;
  const leftCx = x + half / 2;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.1);
  doc.line(x + half, at(27.4), x + half, at(38.6));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8 * fs);
  doc.setTextColor(...MUTED);
  doc.text('Échelle', leftCx, at(31), { align: 'center' });
  doc.text("Date d'étude", x + half * 1.5, at(31), { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8 * fs);
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
    doc.setFontSize(5.8 * fs);
    doc.text(`${formatMeters(bar.meters)} m`, leftCx, at(38.6), { align: 'center' });
  }
  boxRule(doc, at(40.4));

  // valeurs conservées
  const maxDs = Math.round(plan.elements.reduce((m, e) => Math.max(m, e.ds ?? 0), 0));
  statRow(doc, at(44), 'DS maximale', `${maxDs} m`, fs);
  statRow(doc, at(47.2), 'Coordonnées', formatCoord(plan.center[0], plan.center[1], 5), fs);
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
  const maxH = showCompany ? MAP.maxH - 22 : MAP.maxH;
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
  const bandY = MAP.y + imgH + 5;
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
    doc.text('Légende', LEG.x, bandY + 5.4);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.2);
    doc.setTextColor(...MUTED);
    doc.text(
      fitText(
        doc,
        'Les différents matériels seront positionnés en fonction de leur distance de sécurité respective, conformément à la réglementation en vigueur.',
        LEG.w - 22
      ),
      LEG.x + 21,
      bandY + 5.4
    );
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.12);
    doc.line(LEG.x, bandY + 8, LEG.x + LEG.w, bandY + 8);

    // 2 colonnes, police réduite tant que ça tient
    const top = bandY + 12.4;
    const inner = LEG.w - 4;
    const colW = inner / 2;
    const colX = [LEG.x, LEG.x + colW + 4];
    const avail = LEG.bottom - top;

    let fontPt = 6.2;
    let capacity = 0;
    for (const f of [6.2, 5.8, 5.4, 5.0, 4.6]) {
      capacity = Math.floor(avail / (f * 0.72));
      fontPt = f;
      if (capacity * 2 >= rows.length) break;
    }
    const rowStep = fontPt * 0.72;
    const perCol = Math.min(capacity, Math.ceil(rows.length / 2));

    rows.forEach((r, i) => {
      const col = Math.floor(i / perCol);
      const line = i % perCol;
      if (col > 1) {
        // ponytail: au-delà de ~2 colonnes on déborde sur une 2e page plutôt que d'inventer une mise en page
        doc.addPage('a4', 'landscape');
        drawFrame(doc);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...INK);
        doc.text(`LÉGENDE (suite) — ${plan.titre}`, LEG.x, 20);
        return;
      }
      legendRow(doc, r, colX[col], top + line * rowStep + 2, colW, icons.get(`${r.kind}|${r.color}`) ?? null, fontPt);
    });
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
