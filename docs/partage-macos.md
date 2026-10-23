# Partager l'app macOS sans le blocage Gatekeeper

Sur un Mac qui n'est pas celui du développeur, macOS refuse d'ouvrir une application
**non signée par un Developer ID Apple et non notariée** :

> Apple n'a pas pu confirmer que « Planete Plan » ne contenait pas de logiciel malveillant
> susceptible d'endommager votre Mac ou de porter atteinte à votre vie privée.

Ce n'est pas un virus : c'est l'attribut `com.apple.quarantine` posé par le transfert
(AirDrop, mail, navigateur) plus l'absence de notarisation. Deux réponses possibles.

## 1. Côté destinataire, tout de suite (gratuit)

Depuis macOS 15 (Sequoia), le clic droit → « Ouvrir » ne suffit plus. Il faut :

1. Glisser `Planete Plan.app` dans **Applications**, puis double-cliquer : le message apparaît.
2. Ouvrir **Réglages Système → Confidentialité et sécurité**, descendre jusqu'à
   « Planete Plan a été bloqué… » et cliquer **Ouvrir quand même** (mot de passe demandé).
3. Relancer l'app : macOS ne redemandera plus.

En Terminal, équivalent (une seule fois) :

```bash
xattr -dr com.apple.quarantine "/Applications/Planete Plan.app"
open "/Applications/Planete Plan.app"
```

Vérifier si un fichier porte l'attribut :

```bash
xattr -p com.apple.quarantine "Planete Plan.app"
```

## 2. Côté développeur, durablement (Apple Developer Program, 99 $/an)

La notarisation supprime le blocage pour tout le monde. Elle exige un compte payant et un
certificat **Developer ID Application** — un certificat « Apple Development » (compte gratuit,
celui utilisé pour Xcode) n'est pas accepté par le service de notarisation.

Une fois le certificat créé et exporté en `.p12`, Tauri signe et notarise automatiquement :

```bash
export APPLE_CERTIFICATE="$(base64 -i DeveloperID.p12)"
export APPLE_CERTIFICATE_PASSWORD="mot-de-passe-du-p12"
export APPLE_SIGNING_IDENTITY="Developer ID Application: <Nom> (<TEAMID>)"
export APPLE_ID="apple@exemple.fr"           # identifiant Apple du compte
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # mot de passe d'application (appleid.apple.com)
export APPLE_TEAM_ID="XXXXXXXXXX"

npm run tauri:build   # signe (hardened runtime) + notarise + agrafe le ticket
```

Contrôle avant envoi :

```bash
codesign -dv --verbose=2 "src-tauri/target/release/bundle/macos/Planete Plan.app"
spctl -a -vvv -t install "src-tauri/target/release/bundle/macos/Planete Plan.app"
xcrun stapler validate "src-tauri/target/release/bundle/macos/Planete Plan.app"
```

`spctl` doit répondre `accepted / source=Notarized Developer ID`.

## 3. Alternative sans compte Apple

Distribuer le build web plutôt que le `.app` : `npm run build` produit `dist/`, ouvrable en
double-clic (`index.html`) ou servi par n'importe quel hébergement statique. Aucun blocage
Gatekeeper. Différence : les dialogues natifs d'enregistrement sont remplacés par les
téléchargements du navigateur.
