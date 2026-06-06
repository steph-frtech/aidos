# EL_PLAN.md — AIDOS / « compound du besoin » track plan (executed by `/long-run`)

This is the **compound-requirements long-run index** — the track that forces the user to explain their app level by level, above the wall, so the besoin *compounds* and follows the KRD §23 verticale (`product → … → entity` + invariant/policy bands). `/long-run` parses this file and executes the steps **sequentially**: per step `step-ELnn` (fallback `step-executor`) implements it, then `step-verifier` validates/corrects it; advance **only after a pass**, **resume from cache**.

Brief complet par étape : voir docs/plan/ROADMAP-compound-requirements.md (chaque Detail y pointe).

Each `## ELxx` entry has: **Objectif** (the one capability), **Detail** (the shared roadmap row), **Inputs** (prior EL ids + cited existing steps consumed), **Criteres de done** (the computed done-condition). Discipline every step: **above-the-wall** (produces Ideas via `idea-intake`, never a kernel write), **mirror-first** (red mirror before code), **determinism-first** (the LLM judges nothing; the code does), **forcing-gate** (a level is computed enough, never declared). "Done" is computed, never declared. Subsystems: **Runtime · Kernel · Mirror · Archive · Workbench**.

---

## EL00
**Objectif:** Runtime — graver la cible de l'app ÉMISE : Hono front+back + TypeScript pur-fonctionnel + ses propres MCP + Skills (ADR-only).
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** S52, ADR 0040
**Criteres de done:** property test de parité vert ∧ above-the-wall (ADR seul, aucune écriture kernel) ∧ émission déterministe byte-identique ∧ frontière constructrice≠construite tranchée.

## EL01
**Objectif:** Runtime — spike de nécessité du track : prouver qu'une boîte texte-libre S64 est insuffisante, harvest l'Idea-ancre.
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL00
**Criteres de done:** sortie spike falsifiable (backlog ordonné ≠ prompt plat) ∧ confiné `/spike`, aucune écriture vérité ∧ harvest → Idea draft.

## EL02
**Objectif:** runtime/besoin — grammaire CLOSE `BesoinLevel` : 7 rungs SOURCE ordonnés + bandes transversales `invariant`/`policy`.
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL01
**Criteres de done:** miroir property rouge vert (ordre total clos, hors-grammaire = refus dur) ∧ saga/temporal/globalinvariant hors-scope déclarés ∧ determinism-first ∧ above-the-wall.

## EL03
**Objectif:** runtime/besoin — record `BesoinGraph` ordonné append-only (LevelNode + arêtes constrains/seeds), content-adressé via `records.Hash`.
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL02, S53
**Criteres de done:** property rouge vert (même réponses → même graph_hash, round-trip sans perte, projets disjoints) ∧ aucun champ Version/Mirror ∧ determinism-first ∧ above-the-wall.

## EL04
**Objectif:** Runtime / Kernel — attacher les 4 métadonnées par-vérité à chaque nœud en réutilisant truthtyping + scope + authority.
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL03, S14, S15, S16
**Criteres de done:** fixtures rouges par métadonnée manquante vertes ∧ `truth_kind` cohérent (un seul enum source) ∧ routage `/spike` via idea_capture→grill→spike ∧ determinism-first.

## EL05
**Objectif:** Runtime / Kernel — table déclarée `LevelToProposes(level) → ProposesKind | NoEmit`, jointure honnête avec `ideas.ProposesKinds()`.
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL02, EL04
**Criteres de done:** property rouge vert (totale, close, aucun alias silencieux, `journey`/`view` = NoEmit) ∧ chaque non-mapping justifié par ADR ∧ determinism-first ∧ above-the-wall.

## EL06
**Objectif:** runtime/besoin — config déclaré `BesoinThresholds` (seuils above-the-line) + métrique `OptionSpace` énumérable par paire de rungs.
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL03, EL05
**Criteres de done:** property rouge vert (EL07 et EL11 lisent le même record, OptionSpace = comptage pur) ∧ seuils déclarés jamais appris ∧ paire non-énumérable = OpenQuestion ∧ above-the-wall.

## EL07
**Objectif:** runtime/besoin — fonction de forçage pure `CanDescend(graph, level) → Verdict` avec anti-vacuité `ShrinkOptionSpace>0`.
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL04, EL06
**Criteres de done:** fixture-table rouge par niveau verte (parsable-mais-non-contraignant = not_enough, forward-dep = OpenQuestion portée) ∧ `enough` calculé jamais déclaré ∧ determinism-first ∧ above-the-wall.

## EL08
**Objectif:** runtime/besoin — ancre cascade `AnchorsAbove` + `Descend` + héritage de contrainte mesuré `ShrinkOptionSpace` (le compound prouvé).
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL07, S46
**Criteres de done:** fixture rouge verte (descente prématurée refusée, |OptionSpace| strictement plus petit sous ancre figée) ∧ rouvrir une ancre exige un ChangeSet (anti-overwrite §9) ∧ determinism-first.

## EL09
**Objectif:** Runtime / Mirror — gate `BesoinCompleteness(graph) → {complete, monsters[]}`, la loi de complétude appliquée au BESOIN.
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL07, EL10
**Criteres de done:** fault-injection rouge verte (casser le lien nœud↔miroir-de-niveau vire au rouge) ∧ détection de monstre = fonction pure ∧ aucun miroir réel écrit ∧ above-the-wall.

## EL10
**Objectif:** Runtime / Mirror — table neuve `LevelMirrorForm(level)` (rungs hors `derive-mirror`) + validateurs `view`/`journey` neufs.
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL02, EL05
**Criteres de done:** property rouge vert (totale sur 8 rungs, sortie ≡ derive-mirror pour les 5 couverts, validateurs view/journey échouent sur invalide) ∧ determinism-first ∧ above-the-wall.

## EL11
**Objectif:** Runtime / Hooks — hook `Stop:besoin-gate` (binaire Go distinct, scopé sessions BesoinGraph) : OU entre ¬enough et monstre.
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL07, EL09, EL06, S04
**Criteres de done:** fault-injection rouge par disjonct verte (¬enough bloque, monstre bloque, sans BesoinGraph = no-op) ∧ verdict calculé jamais LLM ∧ le hook RENFORCE le mur (n'en retire jamais).

## EL12
**Objectif:** Runtime — arbre de décision déterministe `BranchTree(level, body)` + classification d'altitude par schema-mismatch.
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL07, EL04
**Criteres de done:** fixture par niveau verte (corps incomplet laisse une branche, off-altitude échoue le schéma) ∧ arbre/verdict/altitude = fonctions pures, LLM exclu ∧ alimente `/grill` jamais le kernel.

## EL13
**Objectif:** Runtime — skill ombrelle `/compound-besoin` (backing pur-Go) : interview niveau-par-niveau dispatchant grill/view/action.
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL12, EL15, CE05
**Criteres de done:** Godog rouge vert (3 réponses ferment 3 branches, réponse floue → `/spike`, off-altitude rejeté par schéma) ∧ LLM isolé au dialogue, le code juge ∧ n'écrit que `besoin` via l'MCP EL15.

## EL14
**Objectif:** Runtime / Kernel — bande transversale `/besoin-invariant` : interview des invariants ∀ croisés + policies (bande policy EL02).
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL12, EL04
**Criteres de done:** property rouge vert (invariant contraint latéralement, ∃-au-lieu-de-∀ refusé, complétude flagge le manquant) ∧ ban de circularité (§8) ∧ au plus une Idea{policy} via idea_capture.

## EL15
**Objectif:** Archive / MCP — MCP `besoin-intake` (Go MCP SDK) : porte capacité au-dessus du BesoinGraph, read/state + capture par rung + validate.
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL07, EL05, EL10, S55
**Criteres de done:** Testcontainers vert (round-trip JSONB, append-only, projets isolés RLS, Pact par outil, écriture kernel refusée côté GRANT, journey = NoEmit) ∧ fail-closed `BlockReason` ∧ determinism-first.

## EL16
**Objectif:** Runtime / MCP — émetteur déterministe `EmitIdeas(graph) → []Idea` via la porte, gouverné par `LevelToProposes`.
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL15, EL05, EL08
**Criteres de done:** Godog rouge vert (2 rungs mappants → 2 drafts, journey NoEmit → 1 Idea, ré-émission idempotente, unverifiable via draft d'abord) ∧ `HasMirror` toujours false ∧ hand-off net S64.

## EL17
**Objectif:** Runtime / MCP — `RedBacklog(graph)` : tri topologique des Ideas selon constrains/seeds + forme de miroir annexée via `LevelMirrorForm`.
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL16, EL10
**Criteres de done:** property rouge vert (tri topo total déterministe, cycle = `BESOIN_CYCLE`, refs résolvent @version, NoEmit en anchors_above jamais en liste) ∧ tri = algorithme pur ∧ forme annexée jamais écrite.

## EL18
**Objectif:** Runtime / Archive — capitalisation du besoin (`/compound` à l'élicitation) : ancre réutilisable + mémoire procédurale via `firewall.ViaIdea`.
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL16, CE05, S27, S33
**Criteres de done:** property rouge vert (`WroteKernel` false, provenance reconstruit jusqu'au graph_hash, réutilisation sous noms canonicalisés, anti-faux-positif) ∧ strictement via ViaIdea, jamais ToKernel ni fitness.

## EL19
**Objectif:** Workbench — route `/compound-besoin` (wizard tunnel niveau-par-niveau) + `/compound-besoin/doc` (générateur du requirements doc).
**Detail:** docs/plan/ROADMAP-compound-requirements.md
**Inputs:** EL15, EL16, EL17, EL07, FN03, FN04
**Criteres de done:** Playwright e2e rouge vert (étape verrouillée tant que ¬enough, scénario vide ne débloque pas, doc byte-identique, « Projeter » fait surgir les Ideas live) ∧ l'écran PROPOSE jamais n'écrit le Kernel ∧ thémé + bilingue FR-default ∧ 2 pages Mintlify.
