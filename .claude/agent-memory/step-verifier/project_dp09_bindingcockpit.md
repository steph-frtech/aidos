---
name: dp09-bindingcockpit
description: DP09 environments cockpit (propose→ChangeSet→approve, matrice = projection pure DP07) verified green after 1 biome FORMAT fix in the new e2e spec — the "Biome clean" false-claim scar recurs (6th)
metadata:
  type: project
---

DP09 — cockpit /environments « déclarer/éditer un binding » en propose → ChangeSet → approbation. VERIFIED GREEN après 1 correction.

**La correction (le scar récurrent, 6e occurrence)**: biome FORMAT error dans le NOUVEAU spec e2e `tests/e2e/environments-cockpit.spec.ts` (multi-line expect que le formatter replie) — l'executor a re-claim « propre » alors que `npx biome check` sur les 7 fichiers changés sortait exit 1. Fix `biome check --write` + commit da97966 pushé. **Why:** depuis DP01 chaque étape DP (sauf DP03/04/07/08 partiels) a un écart biome dans le NOUVEAU fichier e2e ou test. **How to apply:** TOUJOURS `npx biome check <tous les fichiers du commit>` — ne jamais croire le rapport, même quand les étapes précédentes étaient propres.

**Vérifié réellement (rien sur parole):**
- vitest 2153/2153 (baseline 2139 + 14 DP09, 6 lois: parité ∀ resolveWith≡resolveConnection, pin cockpit-vide = adresse Go eb382dcf…, déterminisme property, portes fail-closed A1+DP08, enveloppe S20 anti-tamper PROPOSAL_ADDRESS_MISMATCH/NOT_DRAFT, mur S58 GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET) ; tsc 0.
- e2e 32/32 EN UN RUN sur :3210 (cockpit 4 + environments 4 + connections 4 + endpoints-fitness 4 + v3 16) — le motif DP standard tient.
- Pins hash partagés 3 lieux chacun (connections.test/spec + cockpit, endpoint-fitness.test/spec + cockpit) = parité, déjà re-dérivés du Go en DP07/DP08, pas re-dérivés ici.
- i18n fr56==en56 (namespace environments). Mur: zéro fetch, server actions → route() S58, propose seul, wall-probe à l'écran. Déterminisme: réducteur pur, sha256 content-addressed, APPLIED_AT constant (jamais d'horloge).
- Docs: 2 pages 3 couches, docs.json:577-578, mint validate+broken-links clean, 80803b1==origin/main, live 200×2.
- validation_humaine TOUJOURS 0 hits (les 2 exigences utilisateur n'existent pas encore — non-régression N/A, constant depuis DP01).
- Prod :3000 intouchée (200), :3210 relâché.

**OpenQuestions by-design (jamais residual):** apply réel au truth-store Postgres porté par la porte changeset/CLI (câblage MCP stack.* en DP13) ; miroir matérialisé fichier (bootstrap S06) ; Linear MCP non authentifié (récurrent toute la piste DP).
