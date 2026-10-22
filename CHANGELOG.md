# Journal des modifications

Toutes les évolutions notables de **Planete Plan** sont consignées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

- Notification discrète quand une mise à jour est disponible : « Installer maintenant » / « Plus tard » (report jusqu'au prochain lancement), avec progression du téléchargement.
- Revérification automatique toutes les 4 h en plus du contrôle au démarrage.
- Fichier `CHANGELOG.md`.

### Modifié

- L'application s'appelle désormais **Planete Plan** (nom de fenêtre, bundle macOS, installateur Windows, titres des releases).
- Rail : icône de l'application suivie du nom, en Inter Black.

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
