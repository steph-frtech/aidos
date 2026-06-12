---
name: project-wb2-21-emetteurs
description: §WB2-21 (after WB2-20) /v2/emetteurs — l'émission DEPUIS les entités, twin pur ré-exporte emit/project de S35 (DDL·Go·TS byte-stable), verdict PASS verified-green ZERO corrections
metadata:
  type: project
---

§WB2-21 (after WB2-20) NOUVEL écran /v2/emetteurs = L'ÉMISSION DEPUIS LES ENTITÉS (S34/S35, CLAUDE.md §3 N3, ADR0007 no-fork, KRD §23): à partir d'une source d'entité (nom + attributs ORDONNÉS typés sur jeu scalaire clos) AIDOS rend DÉTERMINISTIQUEMENT ses 3 projections — DDL Postgres(CREATE TABLE) + struct Go(sqlc) + type TS — plus le CONTRAT partagé (champs que 3 cibles DOIVENT partager: ni ajout/retrait/renommage). Une source → N projections jamais doublement typée.

DONE-CRITERIA = property re-émission byte-identique ; e2e voir le DDL + les types émis. TOUS MET.

TWIN lib/v2/emetteurs.ts PUR/TOTAL/DETERM no-LLM RÉ-EXPORTE emit/project/entityId VERBATIM de S35 lib/entity-source.ts (lui-même miroir byte-id du Go back/kernel/entities) SANS FORK + AJOUTE vue V2 par cible: DISPLAY_TARGETS[pg-ddl,go-sqlc,ts-types] (ordre AFFICHAGE DDL-d'abord ≠ ordre canonique émission TARGETS[Go,TS,DDL]) / TARGET_META(label/lang/ext clos) / ENTITY_CASES clos(order=ENTITY_ORDER, order-changed=ENTITY_ORDER_CHANGED de entity-source-data, AUCUNE entité inventée) / emitView(entity)→EmitView|BlockReason (émission groupée 3 cibles + contrat=attributs ordre source + BlockReason S13 sur AST malformé fail-closed) / reEmitStable(entity,rounds=16)→ré-émet N fois confirme byte-identique au 1er tour (PREUVE pureté, jamais jugement LLM) / appPreview(entity)→AppPreview(table+colonnes+nullabilité+PK, required→NOT NULL, identifier→PRIMARY KEY, ordre source préservé) / isBlockedView garde discrimine BlockReason vs EmitView via .code.

MIROIR 15 fast-check RÉEL(re-émission byte-id critère done property / emit pur 2 appels octets+hash id / emitView 3 cibles ordre affichage / header protégé+source_hash / contrat=attributs ordre source / NO add/drop/rename chaque champ dans 3 cibles (go capitalisé id→Id) / required⇔NOT NULL / identifier⇔PRIMARY KEY exactement 1 / ordre préservé+table minuscules / appPreview déterm / type inconnu→BlockReason severity blocking / sans attribut→BlockReason+allStable false / ENTITY_CASES clos réutilise S35 / Order DDL=CREATE TABLE+PRIMARY KEY+type Order struct+export type Order / Order amputé discount empreinte distincte DDL sans discount) → 270/270 (était 255, +15).

SCREEN page.tsx 39 KEYS→EmetteursClient useState selectedId+reEmitted useMemo emitView/appPreview/reEmitStable: choisir entité(bouton/cas)→Émettre(v2-emetteurs-emit aria-disabled)→source-hash+contrat(pastilles v2-emetteurs-contract-{name})+3 projections(v2-emetteurs-bytes-{target} octets+path+output-hash)+aperçu table(v2-emetteurs-preview-{col} data-nullable/data-pk)→Ré-émettre(v2-emetteurs-reemit)→report data-all-stable+v2-emetteurs-reemit-{tgt} data-stable+v2-emetteurs-all-stable / Réinitialiser / propose data-proposes=goal (mur intact lit+propose→/goal ZÉRO écriture). Wall grep clean zéro fetch/POST.

e2e 5 VÉRIFIÉ LIVE PAR MOI(build13.5s /v2/emetteurs ƒ 127pages→PORT=3412 next start→PLAYWRIGHT_WEB_PORT=3412+BASE_URL 5passed 4.0s: voir DDL CREATE TABLE "order"+PRIMARY KEY+type Order struct+export type Order+contrat 5 champs+aperçu id PK discount nullable customer non-nullable writes[]/re-émission 3 cibles data-stable=true data-all-stable=true/Order amputé DDL sans discount+contrat sans pastille/propose data-proposes=goal/hub /v2/grille→/v2/emetteurs) kill exact ss:3412 pid2315140 prod:3000 inactif(000).

REACHABILITY /v2/emetteurs BRANCHÉ GrilleScreen.tsx:127-131 href=/v2/emetteurs testid v2-grille-gesture-emetteurs clé gestureEmetteurs fr"Les émetteurs — DDL · Go · TS depuis les entités"==en"The emitters — DDL · Go · TS from entities" — EXECUTOR A BRANCHÉ LE HUB (3e nouvel écran consécutif sans omission de reachability: WB2-19/20/21).

VERIFIED-GREEN ZERO CORRECTIONS: vitest 15/15+270/270, tsc0, BIOME CLEAN(6 fichiers exit 0 — executor claim "Biome clean" VRAI cette fois, casse la série SCAR de 3 false-claims WB2-18/19/20), build13.5s, i18n v2Emetteurs fr39==en39 + gestureEmetteurs fr==en, DETERMINISM-FIRST(emit/project réutilisé S35 byte-id au Go autoritaire + repro mirror reEmitStable+property, no-LLM dans le path), wall clean, docs 3-layer(Implémentation:9/Méta:31/Méta-méta:41) docs.json:531-532 mint validate PASS, code 05eee45==origin/build/s00-s47, docs 37298c4==upstream pushed.

OQ by-design: Linear MCP unauth(issue WB2-21 non créée/déplacée, OAuth+restart requis cf linear-tracker memory)/Mintlify-index-lag possible.

SCAR-CASSÉ: la série "executor claim Biome clean FAUX" (3 consécutifs WB2-18 noExplicitAny / WB2-19 noNonNull / WB2-20 noUnusedImports) S'ARRÊTE à WB2-21 — biome réellement clean. MAIS toujours re-run biome même exit 0 claim (discipline acquise). Reachability nouvel-écran: 3e consécutif branché par executor (scar orphan résolu durablement). Report ACCURATE COMPLET(15/15+270/270+5/5 e2e+reachability+docs réels, ZÉRO false-green, ZÉRO gap omis) — 1er WB2-NOUVEL-écran totalement propre sans correction verifier.
