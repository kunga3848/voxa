# Voxa — voix off réalistes et clonage de voix

> **Version actuelle : 1.0.0-beta.1 (bêta de test)**

## Bêta : tester sans rien installer

La bêta fonctionne en **mode test (cloud)** par défaut : l'app utilise le moteur public Chatterbox Multilingual hébergé par Resemble AI sur Hugging Face. Les testeurs n'ont ni moteur à installer ni carte graphique à avoir.

| | Mode test (cloud) | Mon moteur |
|---|---|---|
| Installation | Aucune | Moteur Voxa sur un PC NVIDIA, un Mac M1+ ou un serveur |
| Quota | Quota GPU gratuit limité par jour (plus élevé avec un jeton Hugging Face gratuit) | Illimité |
| Formats | WAV | WAV et MP3 |
| Vitesse | Non appliquée | Oui |
| Voix clonées et historique | Gardés sur l'appareil du testeur | Sur le moteur, partagés entre appareils |
| Confidentialité | Textes et échantillons envoyés aux serveurs Hugging Face | Tout reste chez toi |

On bascule dans **Réglages › Moteur de voix**. Le mode test dépend d'un service public tiers : il peut être lent, saturé ou changer sans préavis. Il sert aux tests, pas à la production.

**Faire un retour** : Réglages › « Signaler un problème » copie un rapport technique (version, moteur, dernière erreur) à coller dans le message.

### Publier une nouvelle bêta

```
git tag v1.0.0-beta.2 && git push --tags
```
GitHub fabrique le .exe, le .dmg, l'.apk et le paquet moteur, puis crée une **pré-version** (Releases) avec tous les fichiers. La version web est publiée sur GitHub Pages si elle est activée (Settings › Pages › Source : GitHub Actions ; gratuit pour un dépôt public).

Pense à mettre à jour `app/package.json` (`version`) et `app/src/version.js` avant chaque tag.

---

Voxa se compose de deux parties :

- **Le moteur** (`engine/`) : un serveur Python qui fait tourner le modèle **Chatterbox Multilingual** (Resemble AI, licence MIT : usage commercial autorisé). Il génère les voix off, clone les voix et garde l'historique. C'est lui qui a besoin d'une machine puissante.
- **L'app** (`app/`) : l'interface minimaliste en français et en anglais. La même interface devient la version **web**, l'app **Windows (.exe)**, l'app **macOS (.dmg)** et l'app **Android (.apk)**. Elle se connecte au moteur.

```
 Téléphone / PC / Mac  ──(Wi-Fi ou Internet)──▶  Moteur Voxa (ton PC NVIDIA, ton Mac M1+ ou un serveur GPU)
```

## 1. Lancer le moteur

Prérequis : **Python 3.11** et **FFmpeg** (pour le MP3 et la vitesse).

| Machine | Vitesse de génération |
|---|---|
| PC avec carte NVIDIA (6 Go de VRAM ou plus) | Rapide, recommandé |
| Mac Apple Silicon (M1, M2, M3, M4) | Correcte |
| Processeur seul | Lente (plusieurs fois la durée de l'audio) |

**Windows** : double-clique sur `engine/start.bat`.
**macOS / Linux** : `./engine/start.sh` dans un terminal.

Le premier lancement installe tout et télécharge le modèle (environ 3 Go) : compte 10 à 20 minutes. Ensuite le moteur démarre en moins d'une minute et affiche `http://localhost:8000`.

**La version web est servie directement par le moteur** : ouvre `http://localhost:8000` dans ton navigateur.

Installer FFmpeg : `winget install ffmpeg` (Windows) ou `brew install ffmpeg` (Mac).

## 2. Obtenir les installeurs (.exe, .dmg, .apk)

Les installeurs sont fabriqués automatiquement par GitHub, gratuitement (le .dmg exige un Mac, GitHub en fournit un).

1. Crée un dépôt sur github.com et envoie-y ce dossier :
   ```
   git remote add origin https://github.com/TON-COMPTE/voxa.git
   git push -u origin main
   ```
2. Ouvre l'onglet **Actions** du dépôt : la compilation démarre seule (environ 10 minutes).
3. À la fin, clique sur l'exécution terminée : les fichiers `voxa-windows-latest`, `voxa-macos-latest`, `voxa-android` et `voxa-engine` sont à télécharger en bas de la page.
4. Pour publier une version officielle avec une page de téléchargement : `git tag v1.0.0 && git push --tags`. Une **Release** apparaît avec tous les fichiers.

## 3. Utiliser l'app sur le téléphone ou un autre ordinateur

1. Le téléphone et l'ordinateur du moteur doivent être sur le **même Wi-Fi**.
2. Trouve l'adresse IP de l'ordinateur du moteur (`ipconfig` sur Windows, Réglages › Wi-Fi sur Mac), par exemple `192.168.1.20`.
3. Dans l'app : **Réglages › Adresse du moteur** → `http://192.168.1.20:8000`.
4. Sur Windows, accepte la demande du pare-feu au premier lancement du moteur (réseaux privés).

## 4. Mettre le moteur en ligne (accès depuis partout)

Loue un serveur GPU (RunPod, Vast.ai, Lambda, OVH…) et lance le conteneur fourni :

```
docker build -t voxa -f engine/Dockerfile .
docker run --gpus all -p 8000:8000 -v voxa-data:/app/engine/data -e VOXA_API_KEY=un-mot-de-passe-long voxa
```

`VOXA_API_KEY` protège le moteur : saisis la même clé dans **Réglages › Clé d'accès** de l'app. Place un proxy HTTPS devant (Caddy ou Cloudflare Tunnel) avant de le rendre public.

## 5. Ajouter des voix premium à la bibliothèque

Dépose des échantillons de comédiens dans `engine/library/` (voir `engine/library/README.md`). Ils apparaissent pour tous les utilisateurs dans **Voix › Bibliothèque**. N'utilise que des voix dont tu as l'accord écrit.

## Réglages de génération

- **Expressivité** : intensité émotionnelle (0,5 = neutre ; 0,7 et plus = publicité, narration dramatique).
- **Rythme** : plus bas = débit plus posé. Pour une voix très expressive, baisse-le vers 0,3.
- **Variation** : plus haut = plus vivant, moins prévisible.
- **Vitesse** et **Pause entre phrases** : appliquées après génération.
- Les textes longs sont découpés en phrases puis recollés : pas de limite pratique à quelques pages.

## Limites à connaître

- L'**APK** est une version de test non signée : installable directement (autorise « sources inconnues »), mais le Play Store exige une signature avec ta propre clé.
- Le **.dmg** n'est pas signé par Apple : au premier lancement, fais clic droit › Ouvrir. Windows peut afficher SmartScreen › « Informations complémentaires » › « Exécuter quand même ». La signature officielle demande un compte Apple Developer (99 $/an) et un certificat Windows.
- Pas d'app **iPhone** : elle nécessite un Mac, Xcode et un compte Apple Developer. La version web fonctionne dans Safari en attendant.
- Le clonage reproduit une voix à partir d'un échantillon court : plus l'échantillon est propre (sans musique, sans écho), meilleur est le résultat.

## Variables du moteur

| Variable | Rôle | Défaut |
|---|---|---|
| `VOXA_PORT` | Port du serveur | `8000` |
| `VOXA_API_KEY` | Clé d'accès obligatoire | aucune |
| `VOXA_DATA` | Dossier des voix et de l'historique | `engine/data` |
| `VOXA_MAX_CHARS` | Taille maximale d'un texte | `20000` |
| `VOXA_MOCK=1` | Tester l'interface sans modèle (son de test) | désactivé |

## Développement

```
cd app && npm install
npm run serve      # interface sur http://localhost:5173
npm run desktop    # app de bureau en local
```

L'interface est en HTML/CSS/JavaScript sans compilation : `app/index.html` et `app/src/`. Les textes FR/EN sont dans `app/src/i18n.js`.
