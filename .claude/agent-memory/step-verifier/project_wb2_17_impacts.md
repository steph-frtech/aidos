---
name: wb2-17-impacts
description: §WB2-17 (after WB2-16) /v2/ai-lab gagne LA VAGUE DE ROUGE — specs existantes du DAG impactées (rouge → vert quand validé), additif à l'écran WB2-15/16, ZÉRO corrections, verified-green
metadata:
  type: project
---

§WB2-17 (after WB2-16) /v2/ai-lab gagne LA VAGUE DE ROUGE (l'autre face): à DROITE les specs DÉJÀ là (EXISTING_DAG) que le besoin TOUCHE en ROUGE(impactées non résolues)→RÉSOLUTION rouge→vert quand le besoin est validé. CONSISTENT PARTOUT: liste(WB2-17)+grille+cellules+graphe lisent le MÊME prédicat impactResolved(=cellFullyHandled||allPlacementsHandled de v1). ADDITIF à l'écran WB2-15(placement)/WB2-16(descente) donc reachability DÉJÀ acquise(GrilleScreen.tsx:99 href=/v2/ai-lab).

TWIN lib/v2/ai-lab.ts ré-exporte la machinerie d'impact v1 lib/ai-lab.ts SANS FORK(ADR0007: impactResolved/cellFullyHandled/allPlacementsHandled/validateImpacts/EXISTING_DAG/existingSpec/mergeImpacts + types DagImpact/ExistingSpec) + AJOUTE 3 PURES&TOTALES: needImpacts(raw)=validateImpacts(clamp ids DAG seuls, id inventé d-inexistant-ghost JETÉ), impactRows(placements,impacts)→ImpactRow[]{spec,reason,resolved(via impactResolved),voyant red|green}(spec inexistante ignorée=totalité), validateAllPlacements(placements)(« j'ai tout validé »→chaque proposed→validated, realized PRÉSERVÉ) + impactTally(rows)→{red,green,total}/allImpactsResolved(rows)(length>0 && every resolved). NeedSample gagne impactsRaw? optionnel; NEED_SAMPLES checkout-multi(5 vrais impacts d-produit-shop/d-controle-pay/d-action-checkout/d-operation-createorder/d-entite-order +1 ghost)/secret-field(d-entite-payment +1 ghost).

MIROIR 32/32 RÉEL re-run(15 WB2-15+10 WB2-16+7 WB2-17): clamp(ids DAG seuls ghost jeté)/DÉTERM needImpacts 2×/DÉTERM impactRows 2× property mode none|all/AU PLACEMENT tout ROUGE(green=0 red=length allImpactsResolved=false)/VALIDER TOUT→tout VERT(red=0 green=length allImpactsResolved=true)=CRITÈRE DONE/CONSISTANT secret-field entité×S rouge→vert/validateAllPlacements préserve realized+cardinalité.

SCREEN AiLabClient additif: section « La vague de rouge » data-testid v2-ai-lab-impacts data-all-green + tally v2-ai-lab-impact-tally data-red/green/total + bouton v2-ai-lab-validate-all(disabled quand allGreen) + 1 ligne/impact v2-ai-lab-impact-<specId> data-voyant red|green data-resolved + badge ROUGE/VERT v2-ai-lab-impact-voyant-<id>. rows recalculés useMemo à chaque validation. onPickSample passe s.impactsRaw→needImpacts; onValidateAll→validateAllPlacements. ZÉRO fetch/POST(grep WALL CLEAN) mur tient.

NOTE-E2E-LOCATOR: `[data-testid^="v2-ai-lab-impact-d-"]` NE collisionne PAS avec v2-ai-lab-impact-voyant-<id> car les specIds commencent par "d-" et voyant testid commence par "v2-ai-lab-impact-v" — préfixe "-d-" exclut correctement les "-voyant-". OK.

e2e 4/4 VÉRIFIÉ LIVE par moi(build→next start -p 3417→PLAYWRIGHT_WEB_PORT=3417 PLAYWRIGHT_BASE_URL=http://localhost:3417, 4 passed 3.6s, kill exact pid ss -ltnp grep :3417). WB2-17 test=checkout-multi→vague rouge visible data-all-green=false green=0 red>0+ghost absent(clamp)+chaque ligne data-voyant=red→Valider tout→data-all-green=true red=0 green=redBefore+chaque ligne green+bouton disabled+writes[].

VERIFIED-GREEN ZERO CORRECTIONS: vitest ai-lab.test 32/32 + lib/v2+app/v2 217/217(était 210,+7) tsc EXIT0 biome CLEAN-4 build OK /v2/ai-lab(ƒ route présente .next/server/app/v2/ai-lab/page.js) i18n v2AiLab fr30==en30(+impactHeading/impactHint/validateAllBtn/impactRed/impactGreen) page KEYS wire 30. DETERMINISM-FIRST: needImpacts/impactRows/impactTally/allImpactsResolved/validateAllPlacements PURES no-LLM, jugement « quelles specs impactées » BRUT=irréductible cerveau gauche CLAMPÉ par validateImpacts(code gagne), repro mirror property. docs 3-layer(Implémentation L9/Méta L31/Méta-méta L41) docs.json:523-524 mint validate PASS dca9a72==origin/main. code HEAD 70167da==origin/build/s00-s47(0 ahead). prod:3000 PAS actif ici(curl 000 avant ET après).

OQ by-design NON-bloquants: Linear MCP unauth(seuls authenticate/complete surfacent, issue Sxx·WB2-17 non déplaçable)/vrai-Claude-cerveau-gauche-impacts-non-branché(impactsRaw d'exemples déclarés, runtime branchera)/mcp__mintlify-aidos transitoire « Failed to initialize docs filesystem »(push réussi index suivra)/text-destructive-foreground réutilisé(cohérent panneaux livrés).

SCAR-CONFIRMÉ(3e fois WB2-16+WB2-17): étape ADDITIVE à écran existant(/v2/ai-lab) → reachability DÉJÀ acquise via GrilleScreen.tsx:99, PAS un orphan-screen — le scar orphan WB2-14/15 ne s'applique QUE aux NOUVEAUX écrans /v2/<x>. executor report ACCURATE COMPLET(32/32+217/217+4/4 RÉELS ZÉRO false-green, reachability correctement notée déjà-acquise, OQ honnêtes) — 2e WB2 additif consécutif sans omission.
