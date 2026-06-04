# ROADMAP — GOUVERNANCE : cross-check + adoption (Microsoft agent-governance-toolkit) (`/long-run`-exécutable, spike-gated)

> Sujet **GV** (ids `GV01+`). Lancer : `/long-run {planPath:'docs/plan/ROADMAP-governance.md', startFrom:'GV01'}`.
> **Spike-gate** : `GV01` est le cross-check ; il décide quelles pièces de l'AGT ajoutent une valeur réelle vs la gouvernance déjà **structurelle fail-closed** d'AIDOS (S52/BA). Si rien ne manque → arrêt.
> Discipline : **mirror-first** · **le mur reste plus fort que le middleware default-allow** (on n'abandonne JAMAIS le mur structurel ; l'AGT l'**augmente** et le **prouve**) · **determinism-first** (policy déclarée = source ; les enforcers Go = projection ; jamais l'inverse).
> But (`microsoft/agent-governance-toolkit`, MIT) : policy YAML, audit tamper-evident (Merkle), OWASP Agentic Top-10 evals, identité/trust, SRE (SLO/error-budget/circuit-breaker).

## GV01
**Objectif:** Cross-check — auditer la gouvernance AIDOS (S52 `agentlayer` ; BA `GateAction`+enforcers ; `agentrun/ledger`) contre l'AGT + les 10 risques OWASP Agentic ; rapport d'écarts ; périmètre d'adoption.
**Detail:** docs/plan/ROADMAP-governance.md
**Inputs:** S52, BA13, BA29
**Criteres de done:** rapport de conformité (couverture OWASP, écarts réels vs déjà-couvert) ; verdict d'adoption documenté (rien-à-ajouter ⇒ arrêt).

## GV02
**Objectif:** Runtime — ADR « adoption AGT » : adopter audit Merkle + miroirs OWASP + policy-as-YAML→enforcers + trust/SRE ; le mur structurel reste autoritaire.
**Detail:** docs/plan/ROADMAP-governance.md
**Inputs:** GV01
**Criteres de done:** ADR accepté listant précisément ce qu'on adopte/n'adopte pas + pourquoi le mur reste le garant ∧ tracké Linear.

## GV03
**Objectif:** Runtime — journal d'audit **tamper-evident (Merkle)** sur `back/runtime/agentrun/ledger.go` (ledger inviolable + Decision-BOM).
**Detail:** docs/plan/ROADMAP-governance.md
**Inputs:** GV02, BA29
**Criteres de done:** miroir property ROUGE d'abord — altérer une ligne du ledger → la racine Merkle change → vérification rouge ; append-only, déterministe.

## GV04
**Objectif:** Mirror — les **10 risques OWASP Agentic Top-10** comme miroirs de conformité déterministes (fault-injection par risque).
**Detail:** docs/plan/ROADMAP-governance.md
**Inputs:** GV02, BA13
**Criteres de done:** chaque risque a un miroir ; injecter la violation correspondante → le miroir passe rouge ; tous verts sur l'état courant.

## GV05
**Objectif:** Runtime — compilateur `policy.yaml → GateAction` : la policy YAML (source déclarée) compile vers les enforcers fail-closed existants + miroir d'équivalence.
**Detail:** docs/plan/ROADMAP-governance.md
**Inputs:** GV04, BA13
**Criteres de done:** miroir property ROUGE d'abord — pour toute action, la YAML produit **exactement** le même `BlockReason`/verdict que les enforcers Go (équivalence prouvée) ; la YAML ne peut qu'égaler ou resserrer, jamais élargir (determinism-first).

## GV06
**Objectif:** Runtime + Workbench — aligner identité/trust + contrôles SRE (circuit-breaker/error-budget) sur BA + panneau `/agents` « Governance / Audit » + e2e + 2 pages Mintlify.
**Detail:** docs/plan/ROADMAP-governance.md
**Inputs:** GV05
**Criteres de done:** la route rend l'audit (ledger Merkle, conformité OWASP, verdicts policy) thémée+bilingue ∧ e2e vert ∧ pages « Pour moi » live ∧ `/self-test` reste vert.
