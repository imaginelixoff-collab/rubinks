# 🚀 Mettre RUBINKS en ligne (jouer à 2 sur 2 PC)

Il y a **2 morceaux** à déployer :

1. **Le serveur** (`server.js`) → **Render.com** — c'est lui qui relie les 2 joueurs (WebSocket).
2. **Le site** (`index.html` + `game.js`) → **Vercel** — c'est la page que tes amis ouvrent.

> Les deux sont **gratuits**. Comptes nécessaires : **GitHub** (pour héberger le code) + **Render** + **Vercel**.

---

## Étape 0 — Mettre le code sur GitHub

1. Crée un compte sur [github.com](https://github.com) si tu n'en as pas.
2. Crée un **nouveau dépôt** (repository), par ex. `rubinks`, **public**.
3. Pousse le dossier `rubinks/` dedans. En ligne de commande, depuis le dossier `rubinks/` :
   ```bash
   git init
   git add .
   git commit -m "RUBINKS"
   git branch -M main
   git remote add origin https://github.com/TON_PSEUDO/rubinks.git
   git push -u origin main
   ```
   (Remplace `TON_PSEUDO`. Le `.gitignore` exclut déjà `node_modules`.)

---

## Étape 1 — Déployer le serveur sur Render

1. Va sur [render.com](https://render.com) → connecte-toi avec GitHub.
2. **New +** → **Web Service** → choisis ton dépôt `rubinks`.
3. Render détecte `render.yaml` tout seul. Vérifie :
   - **Build Command** : `npm install`
   - **Start Command** : `node server.js`
   - **Plan** : Free
4. **Create Web Service**. Attends 1-2 min.
5. Note l'URL fournie, du type `https://rubinks-server-xxxx.onrender.com`.
   → Pour le jeu, l'URL WebSocket est la même en **`wss://`** :
   **`wss://rubinks-server-xxxx.onrender.com`**

> ⚠️ Sur le plan gratuit, le serveur "s'endort" après 15 min d'inactivité. La 1ʳᵉ connexion
> après une pause met ~30 s à réveiller le serveur — c'est normal.

---

## Étape 2 — Brancher le site sur ton serveur

Deux options :

**A. Plus simple (sans toucher au code)** — ajoute le paramètre `?ws=` à l'URL du site :
```
https://ton-site.vercel.app/?ws=wss://rubinks-server-xxxx.onrender.com
```
Partage **cette** URL (avec le `?ws=...`) à tes amis. C'est tout.

**B. En dur dans le code** — ouvre `game.js`, trouve la ligne `'wss://rubinks-server.onrender.com'`
et remplace-la par ton URL Render. Recommit + push (Vercel redéploie tout seul).

---

## Étape 3 — Déployer le site sur Vercel

1. Va sur [vercel.com](https://vercel.com) → connecte-toi avec GitHub.
2. **Add New… → Project** → importe ton dépôt `rubinks`.
3. Laisse les réglages par défaut (Vercel lit `vercel.json`). **Deploy**.
4. Tu obtiens une URL type `https://rubinks.vercel.app`.

---

## Étape 4 — Jouer à 2 en ligne

1. **Toi (hôte)** : ouvre le site → **2 joueurs** → **EN LIGNE** → **C** (Créer).
   Un **code à 4 chiffres** s'affiche.
2. **Ton ami** : ouvre la même URL → **2 joueurs** → **EN LIGNE** → **J** (Rejoindre) →
   tape le code → **ENTRÉE**.
3. Dès que vous êtes 2, la partie démarre. **L'hôte se déplace** dans l'école (l'autre suit
   l'écran) ; **en combat, chacun joue son perso et fait ses propres esquives**.

---

## Notes

- **L'hôte (joueur 1) pilote l'exploration** ; le joueur 2 voit la même scène en temps réel.
  En **combat**, les deux jouent leur tour et esquivent indépendamment.
- Si le serveur dort (plan gratuit), patiente ~30 s à la création/jointure de la première room.
- Le **solo** et le **multi local (même PC)** ne nécessitent **aucun** serveur.
