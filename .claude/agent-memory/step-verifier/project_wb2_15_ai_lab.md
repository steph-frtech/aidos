---
name: wb2-15-ai-lab
description: §WB2-15 (after WB2-14) /v2/ai-lab=le CERVEAU GAUCHE place un besoin NL sur la verticale (clamp à l'espace déclaré 7×8×6) — verified GREEN after 1 reachability correction (orphan screen)
metadata:
  type: project
---

§WB2-15 (after WB2-14) /v2/ai-lab = l'AI LAB « modèle corrigé » (ROADMAP-fke FK11, FKE-38) : le CERVEAU GAUCHE (chat Claude NL, à gauche) PLACE un besoin sur la VERTICALE — chaque morceau tombe à un (niveau × facette × paire). Le placement est le SEUL jugement LLM irréductible, VÉRIFIÉ par le code (CLAMPÉ à l'espace déclaré ; une cellule inventée est JETÉE, jamais coercée) ; le mur tient (PROPOSE ambre, jamais d'écriture-vérité).

**TWIN** lib/v2/ai-lab.ts PURE/TOTAL/DETERM no-LLM RÉUTILISE l'évaluateur v1 lib/ai-lab.ts (FK11, ADR0007 no fork) : ré-importe+ré-exporte validatePlacements/placementsByLevel/isTruthWriteRequest→WallRefusal/placementKey/MIRROR_PAIRS/VERTICAL_LEVELS/ALL_FACETS. AJOUTE la seule chose neuve : placeNeed(message, raw) → soit WallRefusal (isTruthWriteRequest) soit {refused:false, placements:validatePlacements(raw)} CLAMPÉS ; fallbackPlacements(message) PUR (produit×F×spec, vide→[]) ; PLACEMENT_SPACE 7×8×6=336 cellules + SPACE_COUNTS + placementSlug/cellBySlug/isDeclaredCell (bijection) ; levelsTouched/countsByLevel ; NEED_SAMPLES registre clos (checkout-multi fan-out ≥3 niveaux + 1 cellule inventée galaxie jetée ; secret-field entité×S×model + facette Z inventée jetée). placementKey = `${level}|${facet}|${pairId}|${kernel??""}`.

**MIROIR** lib/v2/ai-lab.test.ts vitest+fast-check **15/15 RÉEL** (re-run confirmed) : espace 7×8×6=336 / isDeclaredCell prédicat clamp / rejet cellule inventée / BIJECTION slug↔cellule 336 unique + cellBySlug inconnu→undefined / DÉTERMINISME placeNeed 2× identique / LE CLAMP property ∀ placement gardé est déclaré (rawPlacementArb mêle niveaux/facettes/paires INVENTÉS) / LE MUR ∀ message écriture-vérité→WallRefusal code AI_LAB_DIRECT_TRUTH_WRITE / message ordinaire NE refuse JAMAIS / MULTI-NIVEAUX checkout ≥3 niveaux + galaxie jetée / secret-field clampe Z / FALLBACK déterministe même message→même placement produit / vide→[] / countsByLevel somme exacte / registre ids uniques + chaque sample jette ≥1 entrée.

**SCREEN** page.tsx Server (19 KEYS, NEED_SAMPLES→client) → AiLabClient.tsx client-only : textarea besoin + boutons Placer/Fallback (disabled si vide) + besoins d'exemple → la verticale par niveau (specs AMBRE proposé, data-facet/data-pair tokens ADR0010) ; refus au mur banner data-testid=v2-ai-lab-refusal ; data-count/data-levels sur placed-count. onPlace: sans sample (rawForSample===null) tombe sur fallback ; onFallback vérifie le mur d'abord. WALL clean (ZÉRO fetch/POST, e2e writes[]).

**e2e** tests/e2e/v2-ai-lab.spec.ts 2/2 (executor PLAYWRIGHT_WEB_PORT=3411) : (1) besoin checkout→multi-niveaux (produit ET entité), galaxie absent, facette Z absente, fallback note, aucune écriture POST/PUT/PATCH/DELETE ; (2) écriture-vérité→refus AI_LAB_DIRECT_TRUTH_WRITE + verticale vide. testid placement `v2-ai-lab-placement-entité|S|model|` == placementKey format. NOT re-run (scar prod:3000).

**VERIFIED-GREEN AFTER 1 CORRECTION** (verifier 9f3d401) :
- **REACHABILITY** : /v2/ai-lab ÉCRAN ORPHELIN — aucun lien entrant (grep `/v2/ai-lab` hors app/v2/ai-lab/ = VIDE). GrilleScreen (le hub, rendu /v2/grille+/v2/verticale) branchait operations/workflows/policy mais OMIT ai-lab. → AJOUTÉ `v2-grille-gesture-ai-lab` Link href=/v2/ai-lab + clé bilingue gestureAiLab fr==en. **EXACTEMENT le même scar que WB2-14** (executor omet le geste entrant GrilleScreen sur un nouvel écran /v2/<x>). Confirmé live curl:3413 : /v2/grille carries v2-grille-gesture-ai-lab + href.
- Après fix : vitest lib/v2+app/v2 200/200 (185 prior + 15) tsc0 biome CLEAN-5 build13.4s ƒ /v2/ai-lab + /ai-lab ; i18n v2AiLab fr19==en19 + v2Grille fr13==en13 (gestureAiLab ajouté).

DETERMINISM-FIRST : le CLAMP est code authoritative (jamais LLM) ; le placement NL→cellule est l'exception gated documentée, vérifiée par le clamp ; repro mirror property. Docs 3-layer concept+internals docs.json:519-520 mint validate PASS, b43b067==origin/main (executor docs pushed) ; code HEAD 9f3d401==origin (executor 4e4824e + verifier reachability fix pushed). prod:3000 PAS actif ici (curl 000) — kill exact pid:3413 via ss-ltnp.

OQ by-design : LINEAR MCP unauth (stubs seuls, pas de list/update_issue → issue WB2-15 non déplaçable) ; vrai Claude cerveau-gauche non branché (NEED_SAMPLES déclarés, même frontière que tous les écrans V2 — le mur d'abord, branchement LLM=suivi) ; docs/plan/WB2-15.md absent (roadmap dans ROADMAP-fke.md) ; package.json diff deps WB2 antérieures non lié ; Mintlify search-index lag. Tous NON-bloquants.

**SCAR (RENFORCÉ — 2 occurrences WB2-14 + WB2-15)** : un nouvel écran /v2/<x> est TOUJOURS orphelin tant qu'un geste entrant n'est pas ajouté au hub GrilleScreen (`v2-grille-gesture-<x>` + clé bilingue gesture<X>). L'executor OMET systématiquement ce branchement (WB2-12/13 l'avaient, WB2-14/15 non). Vérifier `grep /v2/<x> hors app/v2/<x>/` = doit être NON-vide. Orphan screen = headless-equivalent = ui-completeness viole.

Executor report : ACCURATE sur le core (200/200 + 15/15 réel, twin/clamp/mur/fallback corrects, docs+e2e réels) SAUF reachability OMISE (le seul gap, fixé par le verifier).
