# RUBINKS

Un jeu de rôle pixel art sur l'école, la trahison, et la survie.

---

## DÉPLOIEMENT

### 1. Déployer le backend (Render.com)

1. Fork ou importe ce repo sur GitHub
2. Connecte-toi sur [render.com](https://render.com)
3. Clique **New → Web Service**
4. Sélectionne ton repo GitHub
5. Render détecte automatiquement le `render.yaml`
6. Clique **Deploy**
7. Note l'URL fournie par Render (ex: `https://rubinks-server.onrender.com`)

### 2. Configurer l'URL WebSocket dans game.js

Ouvre `game.js` et cherche la ligne :

```js
let WS_URL = 'wss://rubinks-server.onrender.com';
```

Remplace par l'URL de ton serveur Render (garde le préfixe `wss://`).

### 3. Déployer le frontend (Vercel)

1. Connecte-toi sur [vercel.com](https://vercel.com)
2. Clique **New Project → Import Git Repository**
3. Sélectionne ton repo
4. Vercel détecte le `vercel.json` automatiquement
5. Clique **Deploy**

---

## JOUER

### Solo (1 joueur)

- Ouvre le jeu dans le navigateur
- Sélectionne **1 joueur**
- Le jeu démarre en local, aucun serveur nécessaire

**Contrôles :**
- `ZQSD` ou `Flèches` — déplacer le leader (le groupe suit en file indienne)
- `Maj` (Shift) maintenu — **courir**
- `ESPACE` / `ENTRÉE` — interagir avec les PNJ, valider
- En combat : `↑↓` pour naviguer le menu, `ENTRÉE` pour valider
- Esquive : appuie sur la flèche affichée `←↑→↓` dans le temps imparti

### Local 2-4 joueurs (même PC)

- Sélectionne **2, 3 ou 4 joueurs**
- Choisis **LOCAL**
- Tous les joueurs partagent le même clavier
- Le menu de combat indique clairement **TON TOUR** pour chaque joueur

### En ligne 2-4 joueurs (PCs différents)

**Créateur de room :**
1. Sélectionne le nombre de joueurs
2. Choisis **EN LIGNE**
3. Appuie sur **C** pour créer une room
4. Un code à 4 chiffres s'affiche — partage-le aux autres

**Joueurs rejoignant :**
1. Sélectionne **EN LIGNE**
2. Appuie sur **J** pour rejoindre
3. Entre le code à 4 chiffres
4. La partie démarre quand tous les joueurs sont connectés

---

## ATTRIBUTION DES PERSONNAGES

**Le nombre de héros jouables = le nombre de joueurs** (pas systématiquement les 4).
1 joueur → RUBINS seul · 2 joueurs → RUBINS + KAYA · 3 → + MAEL · 4 → + ZARA.
Dans tous les cas, les 3 alliés (THOMAS, CÉLESTINE, CARLA) combattent avec vous au 1er combat.

| Ordre de connexion / joueur | Personnage |
|---|---|
| 1er | RUBINS (violet) |
| 2ème | KAYA (rose) |
| 3ème | MAEL (cyan) |
| 4ème | ZARA (orange) |

---

## ZONES

1. **Extérieur** — Ensoleillé, les PNJ alliés vous attendent
2. **RDC** — Sombre, l'horloge trône au centre
3. **1er étage** — Oppressant, trahison inévitable
4. **2ème étage** — Salle de classe, combat final

---

## SYSTÈME D'ESQUIVE

Quand un ennemi attaque :
1. Le nom de l'attaque s'affiche
2. Après **0.8s** : une flèche apparaît `←↑→↓`
3. Appuie sur la **bonne flèche** dans **0.6s**
4. **Succès** = 0 dégâts | **Échec** = dégâts complets

Le buff **Stoïcisme** élargit la fenêtre d'esquive de +40%.

---

## PRÉREQUIS

- Node.js 18+ (pour le serveur)
- Navigateur moderne : Chrome, Firefox, Safari

```bash
npm install  # installe ws
node server.js  # démarre le serveur WebSocket
```
