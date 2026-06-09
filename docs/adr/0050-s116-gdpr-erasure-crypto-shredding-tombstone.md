# ADR 0050 — S116 : effacement GDPR par crypto-shredding + tombstone (append-only réconcilié avec le droit à l'oubli)

- **Statut :** accepté
- **Date :** 2026-06-09
- **Étape :** S116 (EPIC 14 — Onboarding, GDPR, métrage & facturation)
- **Slot figé concerné :** Versioning / archive (truth-store) — **Postgres content-addressed, append-only** (mandatory, ADR 0003/0004). Cet ADR ne change pas le slot ; il **réconcilie** l'append-only avec l'effacement.

## Contexte — une tension réelle (à griller d'abord)

Le truth-store d'AIDOS est **append-only et content-adressé** : rien n'est jamais détruit, le hash d'une phase est le digest de son corps, et le DAG des phases stables est immuable (le cliquet, KRD §S40). Or le RGPD impose, pour une **personne réelle** :

- **Art. 20 (portabilité)** — rendre *toutes* ses données sur demande (export).
- **Art. 17 (droit à l'effacement)** — rendre sa **PII irrécupérable** sur demande.

Un `DELETE` naïf **violerait l'append-only** ET **invaliderait tout hash de phase** ayant couvert la ligne (le DAG ne vérifierait plus). C'est la tension que la feuille de route signale explicitement comme « à `/grill-with-docs` d'abord » (OpenQuestion E14).

Deux plans sont en jeu :

1. **Plan compte AIDOS** — suppression *dure* d'un compte + toutes les données de ses projets (au-delà du soft-delete S53).
2. **Plan app émise** — les droits des personnes *des utilisateurs de l'app construite* (export + suppression), la policy « tout PII oubliable » de S103 rendue concrète.

## Options considérées

1. **Hard `DELETE` des lignes PII.** Rejeté : casse l'append-only, invalide les hash de phase, détruit la structure — incompatible avec le cliquet et le DAG.
2. **Anonymisation en place (réécriture des colonnes).** Rejeté : une réécriture mute une ligne append-only (interdit §9) et bouge le hash de phase.
3. **Crypto-shredding + tombstone (retenu).** La PII vit **chiffrée au repos** sous une clé par-sujet ; l'effacement **détruit la clé** et **remplace le ciphertext par un marqueur tombstone fixe**. La ligne append-only et sa **projection structurelle** survivent verbatim ; seule la **clé** est destructible.

## Décision

**Crypto-shredding + tombstone**, avec un **hash de phase calculé sur la projection structurelle** :

- Chaque champ PII est un `PiiCipher{path, ciphertext, keyId}` — **jamais de plaintext persisté**. La clé `keyId` est une DEK par-sujet.
- **Erase** = (a) détruire la/les clé(s) du sujet, (b) écraser chaque ciphertext par le marqueur `Tombstone` fixe (PII-free, déterministe). La **structure** (forme + colonnes non-PII + position dans le log) est intacte.
- Le **hash de phase** (`PhaseDigest`) hashe la forme + les colonnes non-PII + des **marqueurs de tombstone par champ PII** (jamais la valeur/ciphertext). Ce digest est **INVARIANT sous le shredding** : un champ PII (vivant *ou* shredé) hashe le même marqueur → `PhaseHash(cells) == PhaseHash(erase(cells))`. Le chaînage append-only **vérifie encore** après effacement.
- **Sélection = requête déterministe scopée** (`Select(scope, cells)`) : un filtre pur, total, par `(plan, subject, project?, app?)`. Export et erasure **consomment la même** sélection → ce qui est exporté == ce qui est effacé.
- L'effacement est une **décision enregistrée** (`ErasureDecision`, content-adressée via `records.Hash`) — jamais une édition silencieuse (§9). Rien n'est détruit dans le store : une **clé** est shredée et une **décision** est ajoutée (append-only respecté jusque dans l'effacement lui-même).

**Le mur (§2).** Le paquet n'écrit **aucune vérité**. `Erase` rend une **valeur** (`ErasureResult` : cellules tombstone + décision) ; l'atterrissage des lignes tombstone est une écriture **archive sous la ligne**. La PII n'entre **jamais** dans le kernel.

**Determinism-first (§6/§8).** Sélection, export, shredding, marqueur tombstone, digest de phase et id de décision sont des **fonctions pures totales** : même entrée → sortie byte-identique. Le miroir de reproductibilité (rapid Go + fast-check TS, ancrés sur la même fixture) le verrouille ; l'id de décision et le hash de phase sont **byte-identiques Go↔TS** (twin vérifié).

## Conséquences

- L'app émise (et le compte AIDOS) doivent stocker la PII **chiffrée sous une DEK par-sujet** (le provisioning de clés relève du secret-store S91 — forward-dependency, OpenQuestion documentée : ici la DEK est portée par cellule).
- Après suppression, **aucune requête** ne renvoie la PII — **cross-projet ET cross-plan** (property verrouillée). L'export d'un sujet effacé renvoie **vide** (irrécupérable, honnêtement reflété).
- Un sujet **non visé** ne perd **jamais** sa PII (sélection exacte, pas de sur-shred).
- Implémentation : `back/runtime/erasure` (autorité Go), `back/mcp/erasure` (porte MCP, ADR 0009), `front/web/lib/erasure.ts` (twin), route `/gdpr-erasure` (action-capable, ADR 0010/0011), e2e Playwright.

## Limites honnêtes

- La **DEK par-sujet** est ici un attribut de cellule ; son cycle de vie réel (génération, rotation, stockage hors truth-store) est branché sur le secret-store S91 — noté OpenQuestion, ne bloque pas S116.
- Le `Tombstone` est un marqueur fixe ; un marqueur de **longueur égale au ciphertext** (pour des invariants de taille stricts) est un raffinement possible — non requis pour l'invariance du digest (le digest ne hashe pas le ciphertext).
