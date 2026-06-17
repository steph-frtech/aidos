# ADR 0093 — Voir l'enfant desktop Electron émis : capture CDP (pas de serveur VNC)

- **Statut :** accepted (2026-06-17).
- **Déclencheur :** directive propriétaire « la vm pour voir électron » + « affiche avec webuivnc ». L'audit dormant (`docs/audit/dormant-inventory-2026-06-16.md`) notait : le SOURCE de l'enfant desktop Electron est émis (`honoemit.EmitDesktopChild`) mais **aucun chemin pour le VOIR tourner** — un « reste réel côté desktop ».

## Contexte

L'app émise par AIDOS dérive d'une **vue maître** trois enfants distincts (web React / mobile Expo / **desktop Electron**, ADR 0055/0040). Les enfants web et mobile sont visibles (URLs déployées, `/web-preview`). Le desktop child est une **vraie app Electron** (`main.js` + `preload.js` + `index.html` + `renderer.tsx` + `package.json` + les twins Expr/bridge embarqués) — mais son GUI n'était jamais rendu : la capacité « source émise → fenêtre vue » manquait.

« Voir Electron » = booter l'app et **streamer sa fenêtre dans le navigateur** du Workbench. Trois mécanismes possibles :

1. **noVNC** = Xvfb + un serveur VNC (`x11vnc`) + `websockify` + le client noVNC. Stream X11 complet, mais exige `x11vnc`/`websockify` (paquets système → `apt`/sudo indisponible sur l'hôte) et un démon VNC persistant.
2. **CDP screencast** = Electron EST Chromium ; il expose nativement le **Chrome DevTools Protocol** (`--remote-debugging-port`). `Page.captureScreenshot` / `Page.startScreencast` rendent la fenêtre en frames JPEG, sans aucun serveur VNC, sans sudo.
3. **Capture statique** (un screenshot one-shot) — le sous-cas dégénéré du CDP.

## Décision

**On capture via le CDP intégré d'Electron (mécanisme 2), pas de serveur VNC.** Le « webVNC » de la GUI est une **frame JPEG CDP** rendue dans une `<img>`/canvas du navigateur. Concrètement :

1. **Le cœur pur reste le moteur Go** (ADR 0092 : moteur = seule source). `back/runtime/desktoppreview.Plan` projette une `DesktopChild` émise en **bundle lançable** content-addressé (chemins relatifs ; **une seule** réécriture de prép-lancement : `index.html` `./renderer.tsx` → `./renderer.js` l'output esbuild, car un renderer ne peut exécuter ni TSX ni des specifiers bare). PUR, miroir de reproductibilité (même enfant → mêmes octets → même `BundleHash`).
2. **Le Runner est l'exception I/O gatée** (§6/§8) : matérialise → **esbuild** bundle le renderer → lance Electron **headless sous Xvfb** (`--no-sandbox`, sans sudo) avec le port CDP → capture une frame via le CDP intégré (`capture.mjs` embarqué, Node global `WebSocket`) → teardown. Tous les binaires sont **INJECTÉS** (`Toolchain` : node/electron/esbuild/xvfb-run/node_modules) — rien depuis `$PATH`, donc reproductible ; un hôte sans toolchain renvoie **`available=false` gracieusement** (ADR 0074), jamais une exception.
3. **Surface MCP** (`back/mcp/desktop-preview`, ADR 0009) : `desktop_children` + `desktop_bundle` (PURS, gateway-dispatchables) + `desktop_frame` (lourd, gaté). Le Workbench spawne `desktop-preview -capture` pour la vue live (transport robuste pour la capture lourde, ~2 s) ; le panneau `/v3/emetteurs` lit les **3 enfants live** depuis le moteur (pas un twin).
4. **L'outil est `replaceable`** derrière le **port `desktoppreview.Runner`** : noVNC reste une impl alternative si un jour un stream temps-réel multi-frame est requis (Xvfb + websockify), sans toucher le cœur pur.

## Honnêteté (§8)

Sans backend émis attaché, les panneaux du renderer affichent l'**erreur de fetch réelle** (`GET /entities/Order` échoue sur `file://`) — c'est le comportement VRAI de l'app émise en headless. **Aucun stub n'est injecté** : la coquille desktop (titre, panneaux par section, barre d'actions) est rendue telle qu'émise. Attacher le backend émis (données live) est une **OpenQuestion** documentée (additive, non bloquante).

## Conséquences

- **+** « source émise → fenêtre vue » câblé sans dépendance système (pas de `x11vnc`/sudo) ; Electron 31 boote sous Xvfb et la frame est capturée en ~2 s (prouvé : JPEG 13.9 KB 1280×773, `BundleHash` déterministe).
- **+** déterminisme préservé : `Plan`/children/bundle purs (miroirs) ; seule la frame live est non-déterministe, isolée à la plus petite surface.
- **+** mur intact : projection below-the-line, `WroteKernel` toujours `false`.
- **−** la vue est **poll-based** (re-capture par clic), pas un flux continu — suffisant pour un aperçu ; un `Page.startScreencast` continu (SSE/WS) est une amélioration ultérieure derrière le même port.
- **−** l'hôte de prod doit porter le toolchain (electron+esbuild+xvfb) ; absent → fallback gracieux à l'arbre de fichiers du bundle (`source:"demo"`).
- **−** la capture lourde n'est PAS un dispatch gateway synchrone cheap (elle boote un process) — exposée mais spawneée hors du chemin de dispatch (comme `run_mutation`).

## Alternatives écartées

- *noVNC (x11vnc + websockify)* : exige des paquets système (sudo indisponible) + un démon persistant ; gardé comme impl alternative du port si un stream temps-réel devient nécessaire.
- *Emballer la vue web dans Electron* : ce serait nier l'idiome desktop distinct (ADR 0040 : le desktop child a SA vue, menu applicatif + raccourcis) — on rend la VRAIE app Electron émise.
- *Un twin TS qui « simule » la fenêtre* : violation directe d'ADR 0092 (le moteur émet, on RUN ce qu'il émet).
