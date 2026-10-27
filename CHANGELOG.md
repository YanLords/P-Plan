# Journal des modifications

Toutes les évolutions notables de **Planete Plan** sont consignées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

- **Zone public en icône** : `Tab` alterne entre la zone tracée et l'icône (un clic), et un appui prolongé sur l'outil Zone public ouvre le choix des deux, comme les outils cachés de Photoshop.
- **Voie accès secours** : la pointe de flèche peut être masquée, et le bouton « Inverser le sens » retourne le tracé (la flèche suit).

### Modifié

- **Légende PDF** : les zones public en icône ne sont plus dupliquées ; une seule ligne les représente, sans surface.

## [0.3.9] — 2026-10-26

### Ajouté

- Raccourci **Réglages** : `⌘,` (Mac) ou `Ctrl+,` (Windows) ouvre le panneau des réglages.

### Modifié

- **Export PDF plus rapide** : la carte est capturée directement à la résolution imprimée (2000 px) en canvas, sans passer par un PNG intermédiaire. Le fichier produit est inchangé.

## [0.3.8] — 2026-10-26

### Corrigé

- **Cartouche PDF** : l'adresse du spectacle n'est plus imprimée deux fois quand aucune commune n'est identifiable (par exemple « 12 Rue de la Loge », sans code postal). Elle apparaît une seule fois, en gros sous le titre.

### Modifié

- **Plan PDF** : la carte gagne 10 mm en hauteur (140 mm au lieu de 130). Le cartouche et la zone de légende cèdent cette place en bas de page.

## [0.3.7] — 2026-10-23

### Ajouté

- **Copier / coller / dupliquer** un élément : `⌘C`, `⌘V`, `⌘D` (Ctrl sur Windows) et menu contextuel au clic droit sur la carte — Dupliquer, Copier, Coller, Supprimer ; sur une zone vide, « Coller ici » pose la copie à l'endroit cliqué. La copie est décalée d'environ 8 m pour ne pas se superposer à l'original.

### Modifié

- **Légende PDF** : le barriérage tient sur une seule ligne, avec la **somme** des longueurs à couvrir ; les artifices sont regroupés **par couleur** (une ligne par teinte, avec les DS rencontrées).
- **Cartouche PDF** plus compact (44 mm au lieu de 51, bloc entreprise 19 mm au lieu de 22) : la carte récupère la place gagnée.
- **Adresse** : la commune est extraite aussi bien d'un libellé BAN (« 12 Rue de la Loge, 34000 Montpellier ») que Nominatim, et l'adresse complète est imprimée sous le nom de la commune (jusqu'à deux lignes).
- Les raccourcis d'édition ne se déclenchent plus quand le curseur est dans un champ de saisie (⌘C y copie le texte, pas l'élément).

## [0.3.6] — 2026-10-23

### Ajouté

- Nouvel élément **Bouée** (raccourci `u`, orange) : icône de bouée de sauvetage, point déplaçable, fusionnée en une seule ligne de légende dans le PDF quand elle est posée plusieurs fois.

## [0.3.5] — 2026-10-23

### Corrigé

- La fenêtre « Nouveautés » ne s'affichait pas lors de la **première** mise à jour qui introduit le suivi de version (l'ancienne version ne pouvait pas laisser de trace). Trois cas déclenchent désormais l'annonce : marqueur posé par l'application avant son redémarrage, version différente de celle vue au lancement précédent, ou première version après une mise à jour depuis une release antérieure au suivi (détectée par le plan autosauvegardé). Une installation neuve n'affiche rien.

## [0.3.4] — 2026-10-23

### Ajouté

- **Fenêtre « Nouveautés »** à la première ouverture qui suit une mise à jour : le journal des modifications est embarqué dans le binaire et la section de la version installée s'affiche une seule fois, avec un bouton « J'ai lu ». Un CHANGELOG livré sans section pour la version courante ne bloque rien.
- Les notes publiées dans `latest.json` reprennent désormais le contenu du CHANGELOG : l'encart de mise à jour annonce les vraies nouveautés au lieu d'un simple numéro de version.

## [0.3.3] — 2026-10-23

### Modifié

- Les binaires macOS sont désormais signés en **ad-hoc** (`signingIdentity: "-"`) : le bundle est signé dans son ensemble, ce qui évite les variantes « application endommagée » et rend l'ouverture par clic droit fiable.
- Les notes de release rappellent la procédure de première ouverture sur macOS (clic droit → Ouvrir, ou `xattr -dr com.apple.quarantine`) et sur Windows (SmartScreen), et précisent que les mises à jour suivantes ne redéclenchent pas l'alerte.

## [0.3.2] — 2026-10-23

### Modifié

- En-tête du plan : **titre**, **lieu** et **date** sont maintenant des champs encadrés avec libellé, lisibles en permanence. Avant, les deux premiers étaient transparents et n'apparaissaient qu'au survol, et la date se perdait dans la barre.

## [0.3.1] — 2026-10-22

### Ajouté

- Déplacement d'une **zone entière** en glissant son icône : le contour et les poignées suivent le geste, tous les sommets sont translatés ensemble.
- La **bulle du rayon de sécurité** (« DS 40 m ») reste affichée sur le plan, dans la couleur de l'artifice, au lieu de n'apparaître qu'à la souris.

## [0.3.0] — 2026-10-22

### Ajouté

- Notification discrète quand une mise à jour est disponible : « Installer maintenant » / « Plus tard » (report jusqu'au prochain lancement), avec progression du téléchargement.
- Revérification automatique toutes les 4 h en plus du contrôle au démarrage.
- Couleur personnalisable sur un artifice : le cercle de sécurité, l'icône et la ligne de légende du PDF suivent la teinte choisie.
- Zone public (et zone perso, fond de bateau) : bascule **Zone / Icône** dans le panneau — la zone reste enregistrée, seule son icône s'affiche.
- Nouvel élément **Son** et nouvel élément **Fond de bateau** (zone de fond, dessinée sous les autres).
- Le rayon de sécurité et son trait restent visibles sur le plan, même sans sélection (donc à l'impression).

### Modifié

- L'application s'appelle désormais **Planete Plan** (nom de fenêtre, bundle macOS, installateur Windows, titres des releases).
- Rail : icône de l'application suivie du nom, en Inter Black ; les libellés longs passent sur deux lignes.
- « Voie de sortie » devient **Voie accès secours**.
- Le champ Date du plan est plus lisible (icône de calendrier visible, focus accentué).

### Retiré

- Élément **Échelle**.
- Élément **Accès secours**.

### Corrigé

- Les plans enregistrés contenant un type d'élément disparu sont nettoyés à l'ouverture au lieu de casser l'affichage.

## [0.1.1] — 2026-10-22

### Ajouté

- Mise à jour automatique depuis l'application : vérification au démarrage, téléchargement, installation puis redémarrage (Réglages → Mises à jour).
- Garde-fou de redémarrage : un second redémarrage est refusé pendant 20 s, avec compte à rebours.
- Publication automatisée des binaires et du manifeste de mise à jour dans un dépôt public.

## [0.1.0] — 2026-10-22

### Ajouté

- Édition d'un plan de feu sur carte : artifices avec distance de sécurité réglable à la poignée, barriérages, zones public et personnalisées, points d'eau, extincteurs, échelles, accès et accueil secours, agents de surveillance, marqueurs.
- Outil **voie de sortie** : tracé point par point, extrémité terminée par une flèche orientée.
- Déplacement des éléments et des sommets, annulation/rétablissement (⌘Z), raccourcis clavier personnalisables.
- Enregistrement local (autosave) et fichiers `.json` ouvrables/enregistrables.
- Recherche d'adresse avec suggestions en temps réel (Base Adresse Nationale, repli Nominatim).
- Export PDF A4 paysage sur une page : plan, cartouche « schéma de mise en œuvre », échelle mesurable, légende par type, notes des éléments, logo d'entreprise et QR code de contact (vCard).
- Réglages : échelle d'interface, fond de carte, cercles de sécurité, légende, étiquettes, confirmation de suppression, raccourcis, coordonnées d'entreprise.
