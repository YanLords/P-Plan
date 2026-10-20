# Plan de feu

Générateur **local** de plans de disposition de feux d'artifice — équivalent de
[PlanFeu](https://planfeu.jacques-prevot.fr/web/) (Jacques Prevot Artifices), sans compte,
sans serveur, sans envoi de données.

Cartographie du site de tir, placement des éléments, distances de sécurité, export PDF.

## Ce que fait l'application

- **Carte** : fond plan (OpenStreetMap) ou satellite (Esri World Imagery), zoom/pan, échelle.
- **Éléments** : artifice (avec cercle de distance de sécurité), barriérage, zone public,
  accès secours, point accueil secours, point d'eau, extincteur, échelle, marqueur libre.
- **Catalogue** : 780+ articles importés de la base articles JCO (réf, calibre, distance de
  sécurité). Clic = placement au centre de la carte, glisser = positionnement.
- **Édition** : libellé, référence, calibre, distance de sécurité, notes ; sommets de
  barriérage / zone déplaçables ; suppression (bouton ou touche `Suppr`).
- **GPS automatique** (WGS84) sur chaque élément, dans le panneau et dans le PDF.
- **Export PDF A4 paysage** : page 1 = carte + cartouche (compteurs, DS max, centre, échelle,
  fond) ; page 2+ = légende détaillée numérotée (réf, calibre, DS, GPS).
- **Fichiers** : plan `.planfeu.json` (enregistrer / ouvrir) + autosauvegarde locale.
- **Historique** : `⌘Z` / `⇧⌘Z` (annuler / rétablir) sur les 100 dernières modifications,
  via deux boutons dans la barre de titre.

## Démarrage

```bash
npm install
npm run dev          # http://127.0.0.1:5173 (navigateur)
npm run tauri:dev    # fenêtre desktop Tauri
```

## Build

```bash
npm run build           # frontend seul (dist/)
npm run tauri:build     # .app/.dmg (macOS) ou .msi/.exe (Windows)
```

## Catalogue artifices

```bash
npm run import:artifices                       # source par défaut (base articles JCO)
npm run import:artifices -- /chemin/articles.csv
```

Le script lit le CSV `;` (colonnes `Distance sécurité`, `ref`, dénomination, famille),
extrait le calibre depuis la famille (`bombe_050mm` → 50 mm) et écrit
`src/data/artifices.json`.

## Tests

```bash
npm test        # node --test : conversions m/px, parsing distances, aire, échelle
npm run check   # svelte-check (0 erreur attendu)
```

## Raccourcis

| Touche | Action |
| --- | --- |
| `Entrée` | terminer le tracé (barriérage / zone) |
| `⌘Z` / `Ctrl+Z` | annuler la dernière modification |
| `⇧⌘Z` / `Ctrl+Y` | rétablir |
| `Échap` | annuler le tracé en cours, sinon désélectionner |
| `Suppr` | supprimer l'élément sélectionné |

## Limites assumées (v0.1)

- Pas de géocodage / recherche d'adresse : on se positionne à la souris.
- Fond de carte = réseau requis. L'export PDF embarque l'image, donc le PDF reste
  consultable hors ligne.
- Pas de gestion multi-plans dans une session, pas d'i18n.
- Un seul fond par plan (plan ou satellite).

## Stack

Svelte 5 (runes) + Vite + TypeScript, Leaflet (carte), jsPDF (export), Tauri 2 (desktop).
Thème aligné sur la suite Pyroutils (accent `#FCA04B`, rail 76 px, Feather-style icons).
