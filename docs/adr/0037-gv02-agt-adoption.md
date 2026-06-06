# ADR 0037 — GV02 : adoption du Microsoft agent-governance-toolkit (AGT) — ce qu'on adopte / n'adopte pas, et pourquoi le **mur** reste le garant

- Status: Accepted
- Date: 2026-06-06
- Step: GV02 (Runtime — un ADR de décision + un miroir de parité ADR↔code ; pas de nouvel enforcer)
- KRD: §84 (spike-gate), CLAUDE.md §2 (le mur), §6/§8 (determinism-first : policy déclarée = source, enforcer = projection), §11 (Linear = tracker)
- Inputs: GV01 (cross-check : rapport de conformité OWASP Agentic Top-10 + table d'adoption AGT — `back/runtime/governance/{owasp.go,adoption.go}` + miroir property vert ; verdict `Stop=false`)

## Contexte

GV01 a produit, par un cross-check **déterministe** (table déclarée, pas un « LLM auditeur »),
le rapport de conformité de la gouvernance d'agents d'AIDOS (S52 `agentlayer` ; BA13
`GateAction` + enforcers d'axes déclarés ; BA28/BA29 `agentrun`/`agentloop` ledger) contre
**les 10 risques OWASP Agentic Top-10 (2025)** et **les 5 piliers du Microsoft
agent-governance-toolkit (AGT, MIT)** : policy-as-YAML, audit tamper-evident (Merkle), evals
OWASP, identité/trust, SRE (SLO/error-budget/circuit-breaker).

**Constat de GV01 (les chiffres, calculés — `governance.Count()` / `governance.Verdict()`) :**

- **8/10** risques OWASP **déjà couverts fail-closed** par le mur **structurel** d'AIDOS
  (AAI01–AAI08) : le mur (S04 `agentlayer.MayWrite` toujours faux au-dessus de la ligne),
  les axes `GateAction` (zone/path/egress/exec/capacity/skill/budget/determinism), le
  memory-firewall (S30), l'identité prouvée (BA18), le red-wave de blast-radius (S20/S22).
- **2/10 partiels** — des **écarts réels** : **AAI09** (Untraceability & Repudiation) — le
  ledger hashe chaque run mais n'a **pas** de chaîne Merkle inter-lignes (une ligne supprimée
  ou réordonnée ne laisse aucun signal) ; **AAI10** (Economic & Resource Exhaustion) — des
  caps durs par action/run existent mais **pas** d'error-budget/circuit-breaker sur un *taux*
  d'échecs entre runs.
- **Verdict d'adoption : `Stop=false`** — il reste des écarts réels, donc la roadmap GV03→GV06
  est justifiée ; **0 pilier rejeté**, **1 déjà-couvert** (identité BA18), **4 adopt-as-augment**.

GV02 ne livre **pas** de nouvel enforcer : il **grave la décision d'adoption** en un ADR
**accepté**, et il **épingle cette décision au code** par un miroir de parité (déterminisme-first :
le document est une *projection* de la table autoritaire `adoptionTable`, jamais une affirmation
parallèle qui pourrait dériver).

## Décisions

1. **Ce qu'on ADOPTE — comme AUGMENTATIONS du mur, jamais comme remplacement (4 piliers).**
   Chaque pilier adopté l'est **uniquement** avec son miroir de preuve, et **le mur structurel
   reste autoritaire** : l'AGT le **prouve / l'étend**, il ne le **remplace** jamais (on
   n'abandonne JAMAIS le mur pour le middleware default-allow de l'AGT).

   | Pilier (clé code) | Décision | Step | Ce qu'on adopte (et pourquoi le mur reste garant) |
   |---|---|---|---|
   | `tamper_evident_audit_merkle` | `adopt_augment` | **GV03** | Écart réel AAI09 : une **chaîne Merkle** sur le ledger `agentrun` rend toute suppression/réordonnancement détectable (la racine change → vérif rouge). Le ledger reste **sous la ligne** (télémétrie append-only) ; il ne peut écrire aucune vérité. Le mur reste le garant : l'audit *prouve* l'inviolabilité, il ne gouverne pas. |
   | `owasp_agentic_evals` | `adopt_augment` | **GV04** | On transforme les 10 risques en **miroirs de conformité déterministes** (fault-injection par risque : injecter la violation → rouge). Ce sont des **miroirs** (sous la ligne) qui *certifient* en continu la couverture que le mur assure déjà ; ils n'introduisent aucun default-allow. |
   | `policy_as_yaml` | `adopt_augment` | **GV05** | Un **compilateur `policy.yaml → GateAction`** : la YAML déclarée (source lisible/auditable) compile vers les enforcers Go existants, avec **miroir d'équivalence**. determinism-first : la policy déclarée est *source*, l'enforcer Go est *projection*. La YAML ne peut qu'**égaler ou resserrer** le mur, **jamais l'élargir** (prouvé) — donc le mur reste au moins aussi fort. |
   | `sre_slo_error_budget_circuit_breaker` | `adopt_augment` | **GV06** | Écart réel AAI10 : un **error-budget + circuit-breaker** aligné sur les budgets BA11, qui trippe sur un *taux* d'échecs/burn entre runs (sous chaque cap dur). C'est un **resserrement** supplémentaire au-dessus des caps existants ; il n'ouvre rien. |

2. **Ce qu'on N'ADOPTE PAS (déjà-couvert structurellement — rien à ajouter, 1 pilier).**

   | Pilier (clé code) | Décision | Step | Pourquoi rien à ajouter |
   |---|---|---|---|
   | `identity_trust` | `already_covered` | GV06 (surface seulement) | **BA18** prouve déjà `owner_agent` comme le **content-hash** de l'impl gouvernée (`MintToken`/`VerifyToken`) et le scheduler **fence** les leases périmées. Le pilier identité de l'AGT n'ajoute **rien de structurel** ; GV06 ne fait que le **surfacer** dans le panneau d'audit (aucun nouvel enforcer). |

3. **Ce qu'on REJETTE (0 pilier).** Aucun pilier de l'AGT n'est adopté **tel quel** s'il
   remplacerait une garantie structurelle par un default plus mou. Concrètement, **le
   middleware de gouvernance default-allow** de l'AGT (où une action non explicitement
   refusée passe) est **incompatible** avec la posture d'AIDOS : nos axes sont **default-deny
   fail-closed** (allow-list vide ⇒ rien ne passe). On **n'importe donc pas** cette posture ;
   on garde la nôtre, et l'on n'emprunte à l'AGT que les pièces qui **resserrent ou prouvent**
   le mur. Le compteur `Rejected` est `0` parce qu'on **ré-implémente** chaque pilier dans la
   posture du mur — on ne rejette pas l'*idée*, on rejette la *posture default-allow*.

4. **POURQUOI LE MUR RESTE LE GARANT (la décision portée par cet ADR).** Le mur est
   **structurel** (S04, défense en profondeur : hook `PreToolUse` + absence de GRANT
   Postgres) — il refuse **par construction**, pas par configuration. Tout pilier AGT adopté
   est **soit un miroir** (qui *certifie* sous la ligne — GV03/GV04), **soit une projection
   d'une policy déclarée vers les enforcers existants** (GV05), **soit un resserrement
   supplémentaire** (GV06) : **aucun** n'est un point de décision *au-dessus* du mur, **aucun**
   ne peut élargir ce que le mur autorise. La règle invariante, épinglée par le miroir de
   parité, est : **sur chaque ligne non-rejetée, `WallIsGarant = true`** — le mur est
   l'autorité que le pilier augmente, jamais celle qu'il remplace.

5. **La décision est DÉTERMINISTE et ÉPINGLÉE AU CODE (determinism-first, CLAUDE.md §6/§8).**
   La table d'adoption (`back/runtime/governance/adoption.go`, `adoptionTable`) est la
   **source autoritaire unique**. Cet ADR en est une **projection** : `ADRParity()` dérive,
   pilier par pilier, exactement les lignes ci-dessus, et le **miroir de parité**
   (`adoption_adr_test.go`) vérifie — sans aucun LLM — que (a) les lignes de l'ADR égalent la
   table, (b) le mur est garant sur chaque ligne non-rejetée, (c) les compteurs du résumé
   (4 / 1 / 0) égalent `Verdict()`, et (d) **ce fichier ADR** existe, est **`Accepted`**, et
   nomme chaque pilier + sa décision. Un ADR `Proposed`, manquant, ou qui oublierait un pilier
   passe **rouge**. Le document ne peut donc pas diverger du code.

6. **Élargir l'adoption, adopter la posture default-allow, ou rétrograder le mur sont des
   changements de VÉRITÉ.** La liste (4 adopt / 1 covered / 0 reject), l'invariant
   « mur = garant sur chaque ligne », et le statut `Accepted` sont des vérités déclarées
   (au-dessus de la ligne). Les modifier passe par **idée → miroir → /goal → approbation
   humaine** (CLAUDE.md §2), jamais par une édition silencieuse.

7. **GV02 respecte le mur et n'écrit aucune vérité.** GV02 écrit un ADR (document de décision,
   provenance) + un miroir de parité + un panneau Workbench (lecture seule au-dessus de la
   ligne ; le panneau /governance *rejoue* le cross-check pur, il ne *propose* rien à écrire).
   Aucune écriture dans `kernel`/`mirrors`/`fitness`.

## Conséquences

- **GV03** livre le ledger **tamper-evident (Merkle)** sur `back/runtime/agentrun/ledger.go`
  (miroir property rouge d'abord : altérer/supprimer une ligne → la racine change → rouge).
- **GV04** livre les **10 miroirs OWASP Agentic** déterministes (fault-injection par risque).
- **GV05** livre le compilateur **`policy.yaml → GateAction`** + miroir d'équivalence (la YAML
  ne peut qu'égaler/resserrer le mur).
- **GV06** aligne identité/trust + contrôles **SRE** (error-budget/circuit-breaker) sur BA et
  ajoute le panneau d'audit `/agents` « Governance / Audit » + e2e + 2 pages Mintlify.
- Le mur reste intact ; aucun des neuf `phases` du contrat de step n'est altéré (garde
  ajoutée, jamais retirée — méta-loop §5).

## OpenQuestions

- **OQ-GV02-rejected-zero** : le compteur `Rejected=0` traduit qu'on **ré-implémente** chaque
  pilier dans la posture du mur plutôt que d'importer la posture default-allow de l'AGT ; si une
  future revue veut tracer explicitement « posture default-allow = REJETÉE » comme une ligne de
  table à part entière, ce serait un raffinement de vérité (idée → miroir → /goal), pas une
  édition de cet ADR.
- **OQ-GV02-linear** : le `linear-server` MCP n'est pas authentifié dans cette session isolée
  (OAuth requis) ; l'issue `GV02 · …` (projet AIDOS `aidos-2a9085453be8`, label `adr`) n'a pu être
  créée/déplacée en `Done` par l'agent — à faire au prochain run authentifié (CLAUDE.md §11,
  best-effort, ne bloque pas le step).
