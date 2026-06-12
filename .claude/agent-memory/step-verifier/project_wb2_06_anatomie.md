---
name: wb2-06-anatomie
description: WB2-06 verifier verdict — /v2/anatomie/[kernel] six paires-miroir autour du mur, twin pur lib/v2/anatomy.ts + voyants computés; FOUND+FIXED a red property test (whitespace-id counterexample)
metadata:
  type: project
---

§WB2-06 (after WB2-05 grille) /v2/anatomie/[kernel] = l'ANATOMIE 1-pour-1 d'un kernel : les SIX PAIRES-MIROIR autour du MUR (PAIR_KINDS jeu clos ordonné : spec_doc·behavior_results·scenarios_tests·model_projection·contract_code·evidence). AU-DESSUS=déclaré(humain side:above) EN DESSOUS=prouvé(machine side:below read-only). Remplace le stub anatomie de WB2-04/05 (cible du clic arbre+grille — ids résolvent).

TWIN lib/v2/anatomy.ts PURE/TOTALE/DÉTERMINISTE no LLM/clock/rng/IO: computeVoyant(declared,proven) = table de vérité (declared∧pass→green ; declared∧fail→red ; tout-le-reste→amber, le rouge SEUL porté par échec-machine sous déclaré) ; buildAnatomy pose declared.side=above proven.side=below, compute voyant par paire + overall=PIRE-des-six(voyantRank red2>amber1>green0) + counts ; validateAnatomy rejette empty_kernel_id(trim)/pair_kind_unknown/duplicate_pair/missing_pair ; syntheticPairStates(id) hash djb2 déterministe peuple écran (OQ: synthétique tant que store kernels n'expose pas voyants réels, même pattern WB2-04/05 syntheticComposes).

ÉCRAN page.tsx(Server, getTranslations v2Anatomie 22 keys)→AnatomyClient.tsx(client, useMemo buildAnatomy+syntheticPairStates, useState openKind clic toggle→détail) themed+bilingue FR-default. Cartes 6 paires (au-dessus déclaré / ligne "le mur" / en dessous prouvé read-only) + voyant 🟢🔴🟡 + résumé global counts+overall. ACTION-CAPABLE clic paire→détail (declared/proven/readonly testids). MUR clean: projection lecture, aucune écriture-vérité, aucun fetch/POST.

DONE-CRIT MET (twin pur paires+voyants + property + e2e mur-dessiné/bas-read-only/voyants-déterministes).

VERIFIED-GREEN AFTER 1 CORRECTION:
- (1) PROPERTY RED found re-running vitest (executor reported 8/8 but it was NOT): anatomy.test.ts determinism + synthetic tests used fc.string({minLength:1}) for kernelId → fast-check counterexample " " (single space). validateAnatomy rejects whitespace-only (kernelId.trim()===""→empty_kernel_id) so buildAnatomy(" ",states).ok===false → assertion expect(a.ok&&b.ok).toBe(true) RED. FIX: added arbId()=fc.string({minLength:1}).filter(s=>s.trim()!=="") and replaced all 6 fc.property string generators → 8/8 green, lib/v2 full 63/63 green.
- After fix: tsc EXIT0 (behavior-capture pre-existing filtered), biome clean 4 files, next build "Compiled 13.0s" /v2/anatomie/[kernel] ƒ dynamic, SSR curl :3206 carries ALL e2e testids (title/wall/wall-note/kernel-id/6 pairs data-voyant/overall data-overall/above-below faces), determinism verified (k0 green/red/amber/amber/amber/green identical across reloads→overall red), zzz999 renders 6, coexistence /v2/grille 200 ∧ / 200. Wall grep clean (only doc-comments + kernel param). docs 2 pages 3-layer (Implémentation/Méta/Méta-méta) docs.json:501-502 mint validate PASS HEAD 690771c==origin/main.

SCAR (NEW, RECURRING for V2 twins): property-test kernelId/id generator MUST exclude whitespace-only when the validator does kernelId.trim()===""→reject. fc.string({minLength:1}) generates " " which is non-empty by length but blank by trim → buildAnatomy returns ok:false → any property asserting .ok fails. Use arbId()=fc.string({minLength:1}).filter(s=>s.trim()!==""). Check ALL future V2 twins with a trim-based empty check.
SCAR (CONFIRMED): executor reported vitest "8/8 GREEN" but the property suite was actually RED on the whitespace counterexample — ALWAYS re-run vitest yourself, never trust the report's green claim (fast-check found it deterministically, executor likely ran a cached/partial run or before final edit).
SCAR (respected): next start -p 3206 self-kill via exact lsof -ti tcp:3206 pid; prod :3000 re-confirmed 200. NEVER pkill next.

OQ (by-design, non-blocking): synthetic PairStates until kernel store exposes real voyants (same as WB2-04/05) ; Linear MCP unauth (only authenticate stubs) ; no docs/plan/WB2-06.md (spec derived from WB2-04/05 substrate + objective, 6 pairs verbatim from objective). executor report ACCURATE on files/docs/wall BUT WRONG on vitest green (was red).
