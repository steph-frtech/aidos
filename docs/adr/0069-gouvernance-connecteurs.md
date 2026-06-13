# ADR 0069 — DP19 : la gouvernance des connecteurs VALIDÉE PAR MESURE sur le mur EXISTANT — GO

- **Statut :** accepté (verdict mesuré, jamais déclaré)
- **Date :** 2026-06-13
- **Étape :** DP19 (`ROADMAP-provisioning-deploy.md` EPIC E — la couche connecteurs, SPIKE-gate, ratchet OFF, rigueur T0)
- **Zone :** `/spike` exclusivement (code jetable, aucune écriture `kernel`/`mirrors`/`fitness`, aucune persistance)

## Contexte

EPIC E ouvre la **couche connecteurs** : un **Connector / Skill / serveur MCP** est une **source déclarée** par laquelle l'app émise (et l'agent qui la construit) touche le monde — une base interne en lecture, un SaaS externe en écriture, une infra cloud. Avant de graver le moindre morceau de cette couche, la roadmap exige de **prouver par mesure** une question de gouvernance, et une seule :

> La gouvernance des connecteurs **tient-elle avec le mur EXISTANT** — un connecteur peut-il être gouverné comme une source déclarée par les **cinq axes déjà construits** (les enforcers `agentimpl`) + le **ledger Merkle d'audit** (`agentrun`), **sans ajouter un nouveau point de confiance unique** ?

Un `no-go` aurait tué/réduit la couche et documenté pourquoi (il aurait fallu un nouveau mur, donc un nouveau risque). Le `go` autorise EPIC E à n'**ajouter** que des gardes runtime, jamais un nouveau mur (§5, « ADD a guardrail, never REMOVE one »).

## La sonde (jetable, déterministe)

Spike `/spike` du 2026-06-13, paquet `back/runtime/spike/dp19connectorgov` (Go) + son jumeau TS `front/web/lib/connector-governance.ts`. Le gate est **pur, total, fail-closed** — aucune base, aucune horloge, aucun aléa, aucune I/O ; même entrée ⇒ même verdict.

**Réutilisation, jamais réinvention (§3, le mur §2).** Le gate ne crée **aucun** nouveau mur :

- **Capacité** — `agentimpl.ToolAllowed` (set-membership pur) : la capability `(server, tool)` du connecteur doit être liée dans l'implémentation gouvernée.
- **Confinement / egress** — `agentimpl.EgressAllowed` : l'hôte d'un connecteur externe doit être dans l'allow-list d'egress.
- **Le ledger Merkle d'audit** — `agentrun.BuildLedger` / `Verify().OK` : chaque action (admise OU refusée) est pliée dans la chaîne tamper-evident existante.

Le spike n'**ajoute** que deux gardes runtime, sous la même forme set-membership / fail-closed :

- **Scope RO/RW** — une écriture par un connecteur RO n'a **aucune porte** (refus avant tout le reste).
- **Amendement A2 (load-bearing) — approbation HUMAINE runtime.** Une écriture par un connecteur RW exige une `ConnectorRuntimeApproval` fraîche, **Granted** par un humain. **PAS `authority.Decide`** : le truth-admitter du Kernel (`back/kernel/authority`) gouverne si une **vérité** peut changer ; il ne gate **jamais** un **effet runtime**. La mention de `authority.Decide` dans les critères antérieurs est **SUPERSEDED** par A2.
- **Amendement A3 (l'invariant load-bearing) — l'IA jamais en direct sur la DB.** Tout chemin IA→DB **doit** passer par un connecteur contrôlé. Un appel IA→DB **direct** est refusé `AI_DIRECT_DB_ACCESS_FORBIDDEN` par set-membership : la cible directe n'est jamais membre de la surface de connecteurs autorisée de l'IA (fail-closed). C'est le **seul** chemin IA→DB légal : via un connecteur Postgres-RO contrôlé.

La **séparation des plans** interne / externe / IA / cloud est portée par le champ `Confinement` que chaque connecteur déclare et que la matrice enregistre.

**Aucun nouveau BlockReason canonique.** Les codes du spike (`AI_DIRECT_DB_ACCESS_FORBIDDEN`, `CONNECTOR_WRITE_NOT_APPROVED`, `CONNECTOR_SCOPE_READ_ONLY`, `CONNECTOR_TOOL_NOT_BOUND`, `CONNECTOR_EGRESS_NOT_ALLOWED`) sont des **constantes jetables** de zone `/spike` ; ils ne sont **jamais** promus dans l'enum `blockreason.Code` (vérité, au-dessus de la ligne) hors d'**idée → miroir → /goal**.

## Les mesures (le verdict est une MESURE, jamais un avis LLM)

`BuildMatrix` sonde **deux connecteurs jetables** — un RO Postgres-RO (interne) et un RW Slack (externe, egress `slack.com`) — et la tentative IA→DB directe. Six cellules, toutes `pass=true` :

| # | Cas mesuré | Plan | Scope | Op | Verdict | Code mesuré |
|---|---|---|---|---|---|---|
| a | connecteur RW (Slack) écriture **SANS** approbation runtime | externe | rw | write | **REFUSÉ** | `CONNECTOR_WRITE_NOT_APPROVED` (A2 HITL, **pas** `authority.Decide`) |
| a' | connecteur RW (Slack) écriture **AVEC** approbation runtime | externe | rw | write | **ADMIS** | — (+ entrée ledger) |
| b | appel IA→DB **DIRECT** | ai | — | read | **REFUSÉ** | `AI_DIRECT_DB_ACCESS_FORBIDDEN` (A3, set-membership fail-closed) |
| b' | appel IA→DB **via** connecteur Postgres-RO contrôlé | interne | ro | read | **ADMIS** | — (seul chemin IA→DB légal) |
| c | connecteur RO (Postgres-RO) **lecture** | interne | ro | read | **ADMIS** | — |
| c' | connecteur RO (Postgres-RO) **écriture** | interne | ro | write | **REFUSÉ** | `CONNECTOR_SCOPE_READ_ONLY` (scope RO, aucune porte) |

**(d) Chaque action — admise OU refusée — produit UNE entrée ledger Merkle VÉRIFIABLE :** `ledger_length = 6`, `ledger_ok = true`, root content-adressée

`a5f508e2804d9e592b241aae5231b58b957dca58fc7e9ab0d7a0ccef992738ab`.

**Verdict global COMPUTÉ (jamais déclaré, §8) :** toutes cellules `pass` ∧ `agentrun.Verify(ledger).OK` ⇒ **go**.

**No-go reproductible prouvé :** une surface non-liée (`Tools=nil`) ou une seule cellule en échec fait basculer le verdict en **no-go**, et le ledger reste vérifiable — le no-go ne fabrique jamais un vert absent, il nomme la cellule fautive.

## Le miroir T0 (RED → VERT)

- **Go** — `back/runtime/spike/dp19connectorgov/connectorgov_fixture_test.go` : **13 tests PASS** (les 4 done-criteria + les axes capacité/confinement réutilisés + le déterminisme + le no-go reproductible + la tamper-evidence Merkle réutilisée).
- **TS (jumeau)** — `front/web/lib/connector-governance.test.ts` : **11 tests vitest PASS** (la matrice mesurée gravée `MEASURED_MATRIX`, sa forme, la parité avec le Go autoritaire).

## Décision

**La gouvernance des connecteurs est VALIDÉE PAR MESURE sur le mur EXISTANT : GO.** Elle réutilise les 5 enforcers (`agentimpl.ToolAllowed`/`EgressAllowed`, set-membership pur fail-closed) + le ledger Merkle (`agentrun.Verify().OK`), et n'ajoute que les gardes runtime A2 (approbation HITL humaine) + A3 (invariant IA-jamais-direct-DB) + le scope RO/RW.

**AUCUN nouveau mur, AUCUN nouveau point de confiance unique, AUCUN nouveau BlockReason canonique.**

## Conséquences

- **EPIC E (DP20+) n'ajoute que des gardes, jamais un nouveau point de confiance unique.** La couche connecteurs se grave par-dessus le mur existant : capacité (`ToolAllowed`), egress (`EgressAllowed`), ledger (`agentrun`), plus les deux gardes runtime A2/A3 et le scope RO/RW — tous fail-closed, tous set-membership. Toute extension reste un **ADD** au sens §5.
- **A2 est load-bearing et tient une distinction de fond :** le Kernel gate la **vérité**, jamais un **effet runtime**. Une écriture de connecteur est admise par une approbation runtime jetable (`ConnectorRuntimeApproval`), pas par `authority.Decide`. Cette séparation est gravée dans le verdict.
- **A3 est load-bearing :** « l'IA jamais en direct sur la DB » est un invariant mesuré, pas un vœu. Le seul chemin IA→DB légal passe par un connecteur contrôlé ; le direct est refusé fail-closed.
- **La gravure passe par idée → miroir → /goal → ChangeSet.** Le code spike est jetable (zone `/spike`, ratchet OFF) ; la promotion de la couche connecteurs en EPIC E ouvre une idée (proposes = la couche connecteurs, provenance human, `has_mirror=false` — propose, ne fige jamais), jamais une écriture en passant. Les codes de refus du spike ne deviennent canoniques que par cette porte.

## Le mur & le cliquet

Zone `/spike` uniquement : aucune écriture `kernel`/`mirrors`/`fitness`, aucune persistance. Ratchet OFF (T0) — mais le mandat déterminisme-first tient : les 5 enforcers + les 2 gardes A2/A3 + le scope sont du **set-membership pur fail-closed** ; le verdict est une **mesure** (jamais un LLM-juge) ; la matrice + le verdict global sont une **donnée close** (`BuildMatrix`). Anti-overwrite vérifié : les suites existantes `agentimpl` et `agentrun` restent vertes, intactes (aucun test existant modifié). Nettoyage : binaire ELF parasite `back/aidosdatafragments` supprimé, 0 ELF parasite restant.

## Preuves

- Le gate pur : `back/runtime/spike/dp19connectorgov/connectorgov.go` (`GateConnectorAction` réutilise `ToolAllowed`+`EgressAllowed`, ajoute scope RO + A2 `ConnectorRuntimeApproval` ; `GateAIDataAccess` = A3 ; `ActionToRun`+`LedgerFor` réutilisent `agentrun.BuildLedger`/`Verify`).
- La matrice gravée comme donnée + verdict computé : `back/runtime/spike/dp19connectorgov/matrix.go` (`BuildMatrix`).
- L'implémentation gouvernée valide (liée aux 2 connecteurs + egress `slack.com`) : `back/runtime/spike/dp19connectorgov/fixture.go`.
- Miroir T0 Go : `back/runtime/spike/dp19connectorgov/connectorgov_fixture_test.go` (**13 PASS**).
- Jumeau TS + matrice gravée : `front/web/lib/connector-governance.ts` (`MEASURED_MATRIX`, `Matrix{rows, ledgerRoot, ledgerOK, ledgerLength, verdict}`).
- Miroir T0 vitest : `front/web/lib/connector-governance.test.ts` (**11 PASS**).
- **Gates :** `go build ./...` GREEN ; `go test ./runtime/spike/dp19connectorgov/... ./runtime/agentimpl/... ./runtime/agentrun/...` GREEN ; `gofmt -l` clean ; `go vet` clean ; `vitest` GREEN (11) ; `biome check` clean (TABS).
