/** Rendu des pictogrammes : tracés Feather, fichiers fournis et icônes personnalisables. */

import { PATHS, type Kind } from './elements';
import personnageSvg from './icons/personnage.svg?raw';
import personnelJcoSvg from './icons/personnel_jco.svg?raw';
import sonSvg from './icons/son.svg?raw';
import borneIncendieUrl from './icons/borne_incendie.svg?url';
import extincteurUrl from './icons/extincteur.svg?url';
import accueilSecoursUrl from './icons/point_accueil_secours.svg?url';
import camionPompierUrl from './icons/camion_pompier.svg?url';
import enginUrl from './icons/engin.svg?url';
import electriciteUrl from './icons/electricite.svg?url';

/** Tracés seuls (sans `<svg>`), réutilisables dans une autre composition SVG. */
export function kindGlyph(kind: Kind, color = 'currentColor', strokeWidth = 1.7): string {
  return (
    `<g fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">` +
    `${PATHS[kind] ?? ''}</g>`
  );
}

/** SVG inline (style Feather : tracé 1.7, 24×24). `color` = currentColor par défaut. */
export function kindIconSvg(kind: Kind, size = 20, color = 'currentColor'): string {
  const tinted = tintedSvg(kind, color, size);
  if (tinted) return tinted;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">` +
    `${kindGlyph(kind, color)}</svg>`
  );
}

/** Pictogrammes fournis en fichiers, aux couleurs d'origine (non personnalisables). */
const FILE_ICON: Partial<Record<Kind, string>> = {
  bouche_incendie: borneIncendieUrl,
  extincteur: extincteurUrl,
  accueil_secours: accueilSecoursUrl,
  camion_pompier: camionPompierUrl,
  engin: enginUrl,
  electricite: electriciteUrl,
};

/**
 * Pictogrammes personnalisables : la couleur de l'élément remplace la couleur principale
 * du dessin (`from`), ou teinte tout le dessin quand celui-ci est une image (`mask`).
 */
const TINTED: Partial<Record<Kind, { svg: string; recolor: { from: string } | 'mask' }>> = {
  surveillance: { svg: personnageSvg, recolor: { from: '#4eac4c' } },
  personnel_jco: { svg: personnelJcoSvg, recolor: { from: '#ea1f4c' } },
  son: { svg: sonSvg, recolor: 'mask' },
};

export const isTintable = (kind: Kind) => kind in TINTED;

/** SVG prêt à être inséré : taille imposée, en-tête XML retiré. */
function sized(svg: string, size: number): string {
  return svg
    .replace(/<\?xml[^>]*\?>\s*/, '')
    .replace(/<svg([^>]*)>/, (_, attrs: string) => {
      const kept = attrs.replace(/\s(width|height)="[^"]*"/g, '');
      return `<svg${kept} width="${size}" height="${size}" aria-hidden="true">`;
    });
}

function tintedSvg(kind: Kind, color: string, size: number): string | null {
  const t = TINTED[kind];
  if (!t) return null;
  if (t.recolor !== 'mask') return sized(t.svg.split(`fill="${t.recolor.from}"`).join(`fill="${color}"`), size);
  // image embarquée : un filtre remplit les pixels opaques de la couleur choisie
  const id = `tint-${kind}-${color.replace('#', '')}`;
  const head = t.svg.match(/<svg[^>]*>/)?.[0] ?? '';
  const body = t.svg.slice(t.svg.indexOf(head) + head.length, t.svg.lastIndexOf('</svg>'));
  const filter = `<defs><filter id="${id}"><feFlood flood-color="${color}"/><feComposite in2="SourceAlpha" operator="in"/></filter></defs>`;
  return sized(`${head}${filter}<g filter="url(#${id})">${body}</g></svg>`, size);
}

/** Icône pour l'interface (HTML) : image pour les pictogrammes fichiers, SVG inline sinon. */
export function kindIcon(kind: Kind, color = 'currentColor'): string {
  const file = FILE_ICON[kind];
  if (file) return `<img class="pf-img" src="${file}" alt="" width="20" height="20">`;
  return kindIconSvg(kind, 20, color);
}

/** Source d'image d'une icône (PDF) : URL du fichier, ou SVG encodé en data URL. */
export function iconSource(kind: Kind, color: string): string {
  const file = FILE_ICON[kind];
  if (file) return file;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(kindIconSvg(kind, 64, color))}`;
}

