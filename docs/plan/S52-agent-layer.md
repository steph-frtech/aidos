# S52 — The agent as a GOVERNED LAYER (CoucheAgent in the kernel, AgentRun in the runtime)

Subsystem: AIDOS Kernel + Runtime | Home: `back/kernel/agentlayer` (the source) + `back/runtime/agentrun` (the runtime events) | Workbench route: `/agents`

## Objectif

Land the **agent as a governed layer**: model an agent's *role / rights / objective / tools / skills / hooks / limits* as a **`CoucheAgent`** — a first-class **SOURCE** layer in the kernel (extending the S02/S35 metamodel), keyed by a new layer-kind in the taxonomy (`agent | equipe_agents | orchestration`). A *modelled agent* is a layer (versioned, content-addressed, above the line); a *single execution* is **not** a layer — it is a runtime event (`AgentRun`) below the line. The wall is the heart: the mirror MUST prove that an agent role attempting a write **above the waterline** (`kernel` / `mirrors` / `fitness`) is **refused** with a `BlockReason` code **`AGENT_WRITE_ABOVE_WATERLINE`** (reusing the S04 wall), and that a BDD-writer agent can **propose** a scenario but it **requires human authority approval** (S16) — it cannot self-approve. The phrase to engrave (KRD law): **« en KRD un agent n'est jamais une autorité — c'est une couche gouvernée ; il propose, exécute, explore, mais ne déclare jamais seul ce qui est vrai. »** The done invariant: **an agent-role write above the waterline is `AGENT_WRITE_ABOVE_WATERLINE`-blocked, and a BDD-writer agent's proposed scenario stays un-admitted until a human authority approves it.**

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (two Go packages — the `CoucheAgent` source in the kernel, the `AgentRun` runtime events in the runtime), **persistence** (Atlas migrations for the `kernel.agent_layer` AST node and the runtime `AgentRun`/`AgentAction`/`AgentAssignment` tables), a **behaviour proof** (BDD mirror), and a **visualization** (Next route). It does **not** warrant a new hook, a new MCP server, or a new Skill (justified below).

- **Go package — the source (above the line)** `back/kernel/agentlayer/` — the `CoucheAgent` AST type, a **SOURCE** layer embedding the S02 `Layer` metamodel (`back/kernel/records` `KindLayer`) and adding the new **layer-kind** discriminator `agent | equipe_agents | orchestration` to the S02/S35 record taxonomy (extended, never replaced — a `SemanticDiff` `add` on the metamodel, §Règle anti-écrasement). Real Go close to the FR names:

  ```go
  // Package agentlayer models an agent as a GOVERNED LAYER — a SOURCE in the kernel,
  // above the waterline, versioned and content-addressed. A modelled agent IS a layer;
  // a single execution is NOT (that is an AgentRun, back/runtime/agentrun). The agent
  // proposes / executes / explores but NEVER declares alone what is true.
  package agentlayer

  // LayerKind extends the S02/S35 metamodel taxonomy with the agent triad. It is a NEW,
  // closed addition — never a replacement of the existing record/layer kinds.
  type LayerKind string

  const (
      LayerKindAgent        LayerKind = "agent"         // one modelled agent
      LayerKindEquipeAgents LayerKind = "equipe_agents" // a team of agents
      LayerKindOrchestration LayerKind = "orchestration" // an orchestration of agents/teams
  )

  // Provider is the closed set of model providers (no free-text — pinned by ADR).
  type Provider string

  // AgentSpec is the governed-rights core of a CoucheAgent. Rights are DECLARED, never
  // learned (CLAUDE.md §8). The two false constants below are STRUCTURAL guarantees of
  // the wall — they are not toggles a screen can flip.
  type AgentSpec struct {
      ID       string `json:"id"`       // content-hash of the canonical body (S02 scheme)
      Nom      string `json:"nom"`      // the agent's name
      Role     string `json:"role"`     // what it is for (e.g. "bdd-writer", "executor")
      Objectif string `json:"objectif"` // its declared objective
      Modele   string `json:"modele"`   // the model id (e.g. "claude-opus-4-8")
      Provider Provider `json:"provider"`

      // Rights above/below the waterline. PeutModifierNoyau and PeutModifierFitness are
      // ALWAYS false — encoded as the zero value AND re-asserted by Validate; no agent,
      // ever, writes the kernel or the fitness (the wall, §2; CLAUDE.md §8 anti-Goodhart).
      PeutProposerVerite  bool `json:"peut_proposer_verite"`            // may PROPOSE a candidate-truth (idea→mirror→/goal)
      PeutModifierNoyau   bool `json:"peut_modifier_noyau"`             // MUST be false (kernel is above the line)
      PeutModifierMiroir  bool `json:"peut_modifier_miroir"`           // may a mirror-writer agent propose a mirror? (still needs approval)
      PeutModifierFitness bool `json:"peut_modifier_fitness"`          // MUST be false (NIVEAU 3 read-only)

      ZonesLecture   []string `json:"zones_lecture"`   // schemas/paths it may read
      ZonesEcriture  []string `json:"zones_ecriture"`  // schemas/paths it may write — NONE above the waterline
      StopConditions []string `json:"stop_conditions"` // declared halt rules (e.g. "red set still red")
  }

  // CoucheAgent is the governed-layer SOURCE. It carries its bindings, policies,
  // authority, scope and version. It reuses S16 Authority and S15 Scope verbatim —
  // it does NOT fork them.
  type CoucheAgent struct {
      Layer          records.Layer       `json:"layer"`            // the S02 metamodel base (role: SOURCE; authority: above)
      Kind           LayerKind           `json:"kind"`             // agent | equipe_agents | orchestration
      Spec           AgentSpec           `json:"spec"`
      SkillsAutorises    []SkillBinding   `json:"skills_autorises"`
      OutilsMCPAutorises []MCPBinding     `json:"outils_mcp_autorises"`
      HooksObligatoires  []AgentHookPolicy `json:"hooks_obligatoires"`  // non-bypassable hooks the agent MUST run under
      PolitiqueMemoire   AgentContextPolicy `json:"politique_memoire"`  // memory/context read policy (defers to S30 firewall)
      PolitiqueContexte  AgentContextPolicy `json:"politique_contexte"`
      PolitiqueEcriture  WritePolicy        `json:"politique_ecriture"` // what it may write — NONE above the line
      PolitiqueEvolution EvolutionAgentPolicy `json:"politique_evolution"`
      Autorite       authority.AuthorityGraph `json:"autorite"`     // S16 — who approves the agent's proposals
      Scope          scope.TruthScope         `json:"scope"`        // S15 — where/when the agent layer holds
      Version        string                   `json:"version"`      // == ID (content-addressed, S02)
  }

  // SkillBinding / MCPBinding / AgentHookPolicy / AgentContextPolicy /
  // EvolutionAgentPolicy / WritePolicy — the governed-capability records.
  type SkillBinding        struct { SkillName string `json:"skill_name"`; Enabled bool `json:"enabled"` }
  type MCPBinding          struct { Server, Tool string `json:"server","tool"`; Enabled bool `json:"enabled"` }
  type AgentHookPolicy     struct { Phase, Hook string `json:"phase","hook"`; Mandatory bool `json:"mandatory"` }
  type AgentContextPolicy  struct { ReadZones []string `json:"read_zones"`; FirewallDefersToS30 bool `json:"firewall_defers_to_s30"` }
  type EvolutionAgentPolicy struct { MaySelfPlay bool `json:"may_self_play"`; WritesOnlyBranchesReportsIdeas bool `json:"writes_only_branches_reports_ideas"` }
  type WritePolicy         struct { AllowedWriteZones []string `json:"allowed_write_zones"`; AboveWaterlineForbidden bool `json:"above_waterline_forbidden"` }
  ```

  Plus a pure **`Validate(CoucheAgent) → error`** (shape: `Kind` is one of the three taxonomy members; `Spec.PeutModifierNoyau == false` AND `Spec.PeutModifierFitness == false` — *always*, a `CoucheAgent` that claims otherwise is invalid; no `ZonesEcriture` entry resolves above the waterline (reuse the **S04 `Classify`** waterline predicate — do not fork it); `Autorite`/`Scope` well-formed via S16/S15 `Validate`). And the pure **`MayWrite(spec, target) → Decision`** that *reuses the S04 wall `Classify`*: any write `target` resolving above the waterline ⇒ `deny` with `BlockReason{code: AGENT_WRITE_ABOVE_WATERLINE}` regardless of the agent's role; and **`Propose(agent, scenario) → Proposal`** for a BDD-writer agent (`PeutModifierMiroir == true`) yielding a `proposed` (never `admitted`) proposal that **must** route through `idea → mirror → /goal → AuthorityGraph admission (S16)`. Pure functions only, no I/O.

- **Go package — the runtime (below the line, NOT layers)** `back/runtime/agentrun/` — the **runtime events** that record a single execution. These are explicitly *not* layers, not truth, not versioned/frozen — they are append-only telemetry of what an agent *did*:

  ```go
  // Package agentrun records the RUNTIME events of an agent execution. A run is NOT a
  // layer (CoucheAgent is the layer); it is what happened when the layer ran once.
  package agentrun

  // AgentRun is one execution of a CoucheAgent against a red work item. Below the line.
  type AgentRun struct {
      ID          string        `json:"id"`            // content-hash of the run body (S01 scheme)
      Agent       string        `json:"agent"`         // the CoucheAgent @version that ran
      Goal        string        `json:"goal"`          // the /goal it served (S29)
      RedWorkItem string        `json:"red_work_item"` // the red set item it worked
      ContextPack string        `json:"context_pack"`  // the ContextPack it was given (S30/firewall-gated)
      Actions     []AgentAction `json:"actions"`
      Result      string        `json:"result"`        // green | still_red | blocked | abandoned
      StartedAt   string        `json:"started_at"`    // RFC3339, supplied (no arg-less clock)
      EndedAt     string        `json:"ended_at"`
  }

  // AgentAction is one attempted action inside a run. `autorisee` is the wall verdict;
  // `raison_blocage` carries the BlockReason when refused.
  type AgentAction struct {
      Type          string                 `json:"type"`           // read | write | propose | run_mirror | …
      Cible         string                 `json:"cible"`          // the target (schema/path/op)
      Avant         json.RawMessage        `json:"avant"`          // state before (below-line writes only)
      Apres         json.RawMessage        `json:"apres"`          // state after
      Autorisee     bool                   `json:"autorisee"`      // allowed by the wall?
      RaisonBlocage *blockreason.BlockReason `json:"raison_blocage,omitempty"` // why refused (S13)
  }

  // AgentAssignment leases a red work item to an agent for a bounded window.
  type AgentAssignment struct {
      Agent       string `json:"agent"`        // the CoucheAgent @version
      RedWorkItem string `json:"red_work_item"`
      LeaseJusqua string `json:"lease_jusqua"` // RFC3339, supplied
      Statut      string `json:"statut"`       // leased | running | released | expired
  }
  ```

  Plus a pure **`Record(run) → AgentRun`** (deterministic id = content-hash; no clock — timestamps supplied) and a pure **`ApplyWall(action, spec) → AgentAction`** that stamps `Autorisee`/`RaisonBlocage` via the S04 wall `Classify` (every above-waterline write action lands `Autorisee=false` with `AGENT_WRITE_ABOVE_WATERLINE`). No I/O.

> Explicitly **out of scope** (would be monsters / out of slot here): **no new hook** — the **S04 PreToolUse wall already** refuses any agent write above the line at the schema/path level and ships its own fault-injection (§5 hook honesty; a new hook needs a real failed run first); this step *reuses* that wall, it does not add a second one. **No new MCP server** — no new backend capability is exposed; `MayWrite`/`Propose`/`Record` are pure logic called in-process, and the S27 idea-intake door already receives proposals. **No Skill** — declaring a `CoucheAgent` is the generic "declare a source" gesture (S35), not a distinct replayable multi-step gesture. **No codegen** — there is no Go/TS/DDL projection to emit *from* an agent layer at this step (an agent layer governs; it does not generate an emitted-app artifact). **No actual kernel write / freeze** — a proposal becomes truth only through the S29 `/goal` flow via the `aidos` CLI role, a later wiring; record an OpenQuestion if a distinct agent-orchestration capability emerges.

## Ubiquitous language (à épingler au /grill-with-docs)

À épingler contre `back/kernel/CONTEXT.md` + `back/runtime/CONTEXT.md` (prose **française**, **vous**) :

- **CoucheAgent (couche gouvernée).** Une **couche** au sens KRD §21 : versionnée, content-addressée, **au-dessus de la ligne** (un *source*), qui modélise le **rôle / les droits / l'objectif / les outils / les skills / les hooks / les limites** d'un agent. Modéliser un agent, **c'est** poser une couche. Ce n'est **ni** un ACL, **ni** un profil de permission isolé : c'est une vérité gouvernée par sa propre **AuthorityGraph** (S16) et son **TruthScope** (S15).
- **AgentRun (événement d'exécution, PAS une couche).** Une **exécution unique** d'un agent n'est **jamais** une couche : c'est un **événement de runtime**, sous la ligne, append-only, non figé, non versionné comme une vérité. On distingue rigoureusement *l'agent modélisé* (couche, vérité gouvernée) de *l'agent qui s'exécute* (trace de runtime). C'est la frontière de tout ce step.
- **taxonomie layer-kind : `agent | equipe_agents | orchestration`.** Trois nouveaux membres **ajoutés** à la taxonomie des couches (S02/S35) — un agent seul, une équipe d'agents, une orchestration d'agents/équipes. Ajout, jamais remplacement.
- **AgentSpec.** Le cœur des **droits déclarés** : `PeutProposerVerite` (il peut *proposer*), `PeutModifierNoyau = false` **toujours**, `PeutModifierFitness = false` **toujours**, `PeutModifierMiroir` (un agent BDD-writer peut *proposer* un miroir — jamais l'auto-approuver), `ZonesLecture` / `ZonesEcriture` (aucune au-dessus de la ligne), `StopConditions`. Les droits sont **déclarés, jamais appris** (CLAUDE.md §8).
- **le mur (la ligne de flottaison).** `kernel / mirrors / fitness` sont **au-dessus de la ligne** : aucun agent, quel que soit son rôle, n'y écrit. Une tentative d'écriture au-dessus de la ligne est **refusée** par le `BlockReason` **`AGENT_WRITE_ABOVE_WATERLINE`** (S04). « Un agent n'est jamais une autorité. »
- **proposer ≠ déclarer.** Un agent BDD-writer **propose** un scénario (`Propose`) ; le scénario reste **`proposed`**, jamais **`admitted`**, tant qu'une **autorité humaine** (S16 `AuthorityGraph`) ne l'a pas approuvé. L'agent **ne peut pas s'auto-approuver** : c'est la circularité que le mur interdit (CLAUDE.md §8, test-as-goal jamais écrit par l'agent).
- **La phrase à graver :** « en KRD un agent n'est jamais une autorité — c'est une couche gouvernée ; il propose, exécute, explore, mais ne déclare jamais seul ce qui est vrai. »

> **Avoid** (faux synonymes à ne pas employer) : « rôle IAM », « politique RBAC/ACL », « sandbox de permissions », « agent autonome », « agent décisionnaire ». Le `CoucheAgent` n'est aucun de ceux-là : c'est une **couche de vérité gouvernée**, sans autorité propre.

## Test minimal (done)

**Done = une écriture d'un rôle agent au-dessus de la ligne est bloquée (`AGENT_WRITE_ABOVE_WATERLINE`), et un agent BDD-writer ne peut que *proposer* un scénario — il reste non-admis tant qu'une autorité humaine ne l'approuve pas.** Restated **failing-first** as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner. Two artifacts, by nature.

- **CoucheAgent governance fixture** (`test_kind: fixture`, `cert_language: fixture`, `authority: above`) — reflects `kernel.agent_layer` "bdd-writer" + the runtime `AgentRun`, as `state → command → events`:

  ```
  # mirrors schema · reflects: kernel.agent_layer "bdd-writer" · test_kind: fixture · authority: above
  mirror reflects "bdd-writer" {

    given couche_agent {
      kind: "agent"
      spec {
        nom: "bdd-writer", role: "bdd-writer", objectif: "propose red scenarios",
        modele: "claude-opus-4-8", provider: "anthropic",
        peut_proposer_verite: true,
        peut_modifier_noyau:   false,   # ALWAYS false
        peut_modifier_miroir:  true,    # may PROPOSE a mirror
        peut_modifier_fitness: false,   # ALWAYS false
        zones_lecture:  [ kernel, mirrors, ideas, brain ],
        zones_ecriture: [ ideas ],      # NONE above the waterline
        stop_conditions: [ "red set still red" ]
      }
      autorite { domain: "checkout", truth_kind: "behavioral", approvers: [ product_owner ], escalation: [ architecture_board ] }
    }
      when validate { }
        -> events: [ AgentLayerValid ]
        -> spec.peut_modifier_noyau   == false
        -> spec.peut_modifier_fitness == false

    # THE done case (1) — an agent role attempting a write ABOVE the waterline is REFUSED
    given agent_run { agent: "bdd-writer" }
      when agent_action { type: "write", cible: "kernel.truth" }
        -> action.autorisee == false
        -> no kernel write occurs
        -> action.raison_blocage.code == "AGENT_WRITE_ABOVE_WATERLINE"
        -> action.raison_blocage.how_to_fix contains "idea_then_mirror_then_goal_then_approval"

    # the same agent attempting to write mirrors / fitness — equally refused
    given agent_run { agent: "bdd-writer" }
      when agent_action { type: "write", cible: "mirrors.mirror" } -> action.autorisee == false, code == "AGENT_WRITE_ABOVE_WATERLINE"
    given agent_run { agent: "bdd-writer" }
      when agent_action { type: "write", cible: "fitness.grammar" } -> action.autorisee == false, code == "AGENT_WRITE_ABOVE_WATERLINE"

    # THE done case (2) — a BDD-writer agent may PROPOSE a scenario, but it is NOT admitted; it needs human authority
    given couche_agent { id: "bdd-writer" }
      when propose { scenario: "checkout charges tax on EU orders" }
        -> events: [ ScenarioProposed ]
        -> proposal.status == "proposed"     # never "admitted"
        -> proposal.requires_authority == "product_owner"   # S16 — the human approver
        -> NO kernel/mirror write occurs (it must route idea → mirror → /goal → approval, S27/S29/S16)

    # an agent CANNOT self-approve its own proposal — the circularity the wall forbids
    given proposal { id: "checkout-tax", proposed_by: "bdd-writer" }
      when approve { approver: "bdd-writer" }
        -> events: [ Blocked ]
        -> block_reason.code == "AGENT_WRITE_ABOVE_WATERLINE"   # an agent is never an authority
        -> proposal.status == "proposed"     # still un-admitted; only a human authority (S16) admits

    # a single execution is NOT a layer — it is a runtime AgentRun event, below the line
    given agent_run { agent: "bdd-writer", goal: "g-checkout-tax", red_work_item: "rwi-1", started_at: "2026-06-02T18:00:00Z" }
      when record { ended_at: "2026-06-02T18:05:00Z", result: "still_red" }
        -> events: [ AgentRunRecorded ]
        -> run.version == null    # a run has no freeze — it is not a layer, not a truth
        -> run is stored below the waterline (runtime), not in kernel/mirrors
  }
  ```

- **Invariant (∀) — property test (rapid, Go), `authority: below`:** for **any** generated `CoucheAgent` (any role, any provider, any objectif, any subset of read/write zones) and **any** write target string: (1) `Validate` rejects any spec with `PeutModifierNoyau == true` or `PeutModifierFitness == true` — those two are **always** false (the wall is structural, not a toggle); (2) `MayWrite(spec, target)` returns `deny` with `BlockReason{code: AGENT_WRITE_ABOVE_WATERLINE}` **iff** `target` resolves above the waterline (reusing the **S04 `Classify`** predicate), regardless of the agent's `role` — a "BDD-writer", an "executor", an "orchestrator" are *all* refused above the line; (3) `Propose` always yields `status == "proposed"` (**never** `admitted`) and a non-empty `requires_authority` — an agent **never** self-admits; (4) an `AgentRun` **never** carries a `version`/freeze nor a `mirror` field (a run is unrepresentable as a layer — the type makes it so); (5) `Record` is deterministic and total: same input run ⇒ same id (content-hash, no clock). The taxonomy is closed: a `LayerKind` outside `{agent, equipe_agents, orchestration}` ⇒ `Validate` errors.

All start **red** (no `agentlayer` package, no `agentrun` package, no `kernel.agent_layer` node, no runtime `AgentRun`/`AgentAction`/`AgentAssignment` tables, no `MayWrite`/`Propose`/`Validate`/`Record`). That red **is** the `/goal`. The canonical done case is green only when an agent-role write above the waterline is `Blocked` with `AGENT_WRITE_ABOVE_WATERLINE` (no truth write) for **every** role, while a BDD-writer's `Propose` yields a `proposed` (never `admitted`) scenario that a human authority (S16) must approve — i.e. **un agent n'est jamais une autorité ; c'est une couche gouvernée ; il propose, exécute, explore, mais ne déclare jamais seul ce qui est vrai.**

## Postgres migration (Atlas, append-only)

Declarative, expand-only, append-only — never alter/drop a prior table; reuse the S02 content-hash record substrate (do **not** fork the scheme).

- **`kernel.agent_layer`** (the SOURCE, **above the line**): `id text PK` (= hash of the canonical JSONB body), `body jsonb NOT NULL` (holding `kind`, `spec`, the bindings/policies, `autorite`, `scope`), `version text NOT NULL`, `superseded_by text NULL`, `created_at timestamptz NOT NULL`. A `CHECK` enum pins the layer-kind inside the body lane: `CHECK ((body->>'kind') IN ('agent','equipe_agents','orchestration'))`. **GRANTs:** the agent DB role gets **SELECT only** on `kernel.agent_layer` (the wall, §2/S04) — **no** INSERT/UPDATE/DELETE; only the `aidos` writer role writes truth, via an approved ChangeSet. (This row is *itself* governed by the wall it describes.)
- **`runtime.agent_run`, `runtime.agent_action`, `runtime.agent_assignment`** (the runtime events, **below the line** — NOT truth, NOT layers): content-addressed append-only rows in a `runtime` schema (`id text PK`, `body jsonb NOT NULL`, `created_at timestamptz NOT NULL`). **No `version`/freeze and no `mirror` column** — by construction a run cannot carry what would make it a layer/truth. `agent_action.body` carries `autorisee bool` + the `raison_blocage` BlockReason; a `CHECK` pins `agent_run.body->>'result' IN ('green','still_red','blocked','abandoned')` and `agent_assignment.body->>'statut' IN ('leased','running','released','expired')`. **GRANTs:** the agent DB role gets **INSERT/SELECT** on `runtime.*` (runtime telemetry is below the waterline — an agent records its own runs) but **no grant whatsoever** on `kernel`/`mirrors`/`fitness` (the wall holds; this is exactly the asymmetry the fixture proves).

## Visualisation UI

- **Workbench route:** `front/web/app/agents/page.tsx` (new route `/agents`; do **not** touch existing routes). **Themed** (ADR 0010 — ccup zinc + blue-600 tokens, shadcn, Geist, radius `0.5rem`; never hardcode `zinc-*`/hex) and **bilingual** (ADR 0011 — `next-intl`, FR default, strings in `front/web/messages/{fr,en}.json`). It lists the **agent layers** (one card per `CoucheAgent`: `kind` badge `agent|equipe_agents|orchestration`, `nom`, `role`, `objectif`, `modele`/`provider`, and the **rights panel** showing `PeutProposerVerite` / `PeutModifierNoyau=false` / `PeutModifierMiroir` / `PeutModifierFitness=false`, the read/write zones, the bound skills/MCP tools/mandatory hooks, the `AuthorityGraph` approver, the `TruthScope`). Below it, a **recent `AgentRun`** card (agent, goal, red work item, result, and the actions list with each action's `Autorisee` verdict; the **above-waterline write action shown RED** with its `AGENT_WRITE_ABOVE_WATERLINE` BlockReason `code` + `how_to_fix`). **Action-capable** (*tout se fait par écran*, CLAUDE.md §6.7): a **« Proposer un scénario »** control bound (via the `action` gesture) to the BDD-writer agent's `Propose` op — clicking it produces a **`proposed`** proposal that visibly routes to `idea → mirror → /goal → approbation` and is **not** admitted from the screen (truth-writes go through propose → ChangeSet → human approval, never a direct write from the UI); and an **« Enregistrer un run »** control that records an `AgentRun` (a below-the-line write, executed directly). The page makes visible that **un agent propose, jamais ne déclare**. Reads via the SELECT-grant role; renders the fixture, does not re-implement governance.
- **Playwright e2e:** `tests/e2e/agents.spec.ts` — navigate to `/agents`; assert an agent layer card names `kind: agent`, `role: bdd-writer`, and the rights panel shows `PeutModifierNoyau` and `PeutModifierFitness` as **false** (locked); assert the recent `AgentRun` shows the above-waterline write action **red** with `AGENT_WRITE_ABOVE_WATERLINE` and a `how_to_fix` naming `idea → mirror → /goal → approval`; click **« Proposer un scénario »** and assert the result is a **`proposed`** (not `admitted`) proposal requiring a human authority, with **no** kernel/mirror write; assert that a self-approve attempt is refused (the agent is never an authority). Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Wall / completeness obligations (§2)

The wall is the **heart** of this step, not a side-constraint. The agent **proposes** via `idea → mirror → /goal → ChangeSet → human approval`; it **never** writes truth directly:

- **The agent never writes the kernel/mirrors/fitness.** The `kernel.agent_layer` row is written only by the `aidos` CLI role through an approved ChangeSet — never by the agent (GRANTs above). `Spec.PeutModifierNoyau` and `Spec.PeutModifierFitness` are **always** false (structural, re-asserted by `Validate`), and `MayWrite` refuses *every* above-waterline target for *every* role via the S04 `Classify` predicate. The fixture's done case and the rapid invariant are the proof the wall fires for the agent layer.
- **Propose ≠ declare.** A BDD-writer agent's `Propose` yields a `proposed` proposal that must route through the **S27** idea-intake door, acquire its mirror, and pass the **S16** `AuthorityGraph` admission with a **human** approver — it can never self-admit (the circularity the wall forbids, CLAUDE.md §8: the agent writes means-tests, never truth-tests).
- **Completeness (no monster).** The `agent_layer` layer has its living mirror (the governance fixture), each governance branch has a fixture row (validate / above-line-write-refused / propose-not-admitted / self-approve-refused / run-is-not-a-layer), and `AgentRun` is provably *not* a layer (no version, no mirror). An agent layer without its governance fixture, or a `Propose` path that admits without a human authority, is a **monster** — the **Stop**/completeness hook blocks the step.
- **Anti-overwrite (§9).** Adding the layer-kind triad to the S02/S35 metamodel is a **SemanticDiff `add`** (an additive metamodel extension), recorded via a ChangeSet — never an in-place rewrite of the existing record/layer kinds. Any change to a prior contract it depends on (S02 records substrate, the S04 wall `Classify`/`AGENT_WRITE_ABOVE_WATERLINE` BlockReason, S16 `AuthorityGraph`, S15 `TruthScope`, S29 `/goal`, S30 firewall) goes through a **ChangeSet + SemanticDiff**, never a silent edit; never hand-edit `back/gen/**`.

## Note déterminisme-first (§6/§8)

Whatever can be a **deterministic pure function MUST be code**, and it is **authoritative**:

- **Pure functions (code, authoritative):** `Validate(CoucheAgent)` (shape + the two always-false rights + the taxonomy enum), `MayWrite(spec, target)` (reuses the S04 `Classify` waterline predicate — a deterministic path/schema classifier, **never** an "LLM permission agent"), `Propose` (always `proposed`, never `admitted`; pure), `Record(run)` / `ApplyWall(action, spec)` (content-hash id, no clock, no rng), the layer-kind matching, the JSONB canonicalization and content-addressing (S02 scheme). All carry a **reproducibility mirror** (the rapid property: same input → same output; `MayWrite` total and deterministic; `Record` id stable).
- **The gated LLM exception:** **none at this step.** An agent's *generation* (writing scenario prose during a run) happens at build time **outside** this governance surface; here we model and govern the agent, and **every** governance decision (may-write, propose-vs-admit, run-recording) is a pure function — there is no judgment call to delegate to an LLM. An agent deciding its own rights, or self-approving, would be a **determinism gap** *and* a wall breach — both block the step. (CLAUDE.md §8: « the agent writes the code at build time; it does not sit in the runtime loop doing what a function could. »)

## Mintlify two-page doc mandate (every step)

Ship the step's **« Pour moi »** pages on `aidos.mintlify.app` (repo `steph-frtech/docs`, clone `.aidos-docs/`), **bilingue, français d'abord, `vous`**, KRD terms verbatim:

- **Concept page** `steps/concept/s52-couche-agent.mdx` — *l'agent comme couche gouvernée* : la distinction couche (CoucheAgent) vs exécution (AgentRun), la taxonomie `agent | equipe_agents | orchestration`, et la phrase à graver. Written in Phase 1 (`/grill-with-docs`).
- **Internals page** `steps/internals/s52-couche-agent.mdx` — the three layers **Implémentation · Méta · Méta-méta** (the `agentlayer`/`agentrun` packages, the migrations + GRANTs, the wall reuse, the propose-not-declare gate). Phase 1 writes **Méta**/**Méta-méta**; **Implémentation** is completed at green.
- **Update « Pour les futurs utilisateurs »** (`guide/*`, `concepts/*`) — this step ships a user-facing concept (how AIDOS governs the agents that build your app: *they propose, they never declare*) and a Workbench panel (`/agents`), so refresh the guide accordingly.

The step is **not done** until its « Pour moi » pages are live — `mint validate` + `mint broken-links` clean, pushed to `steph-frtech/docs` `main`, verified via `mcp__mintlify-aidos`. Convention: `.agents/skills/grill-with-docs/MINTLIFY-DOCS.md`; syntax: the `mintlify` skill.

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/kernel/agentlayer/**`, `back/runtime/agentrun/**`, the new `back/migrations/<new>.sql` (the `kernel.agent_layer` node + the `runtime.*` tables + GRANTs), the `mirrors`-stored governance fixture/property materialized to `tests/`, `tests/e2e/agents.spec.ts`, `front/web/app/agents/**`, and the `next-intl` message additions in `front/web/messages/{fr,en}.json` — and otherwise **adds new files**. It introduces a new contract (the `CoucheAgent` source, the `agent | equipe_agents | orchestration` layer-kind triad, the bindings/policies, the `AgentRun`/`AgentAction`/`AgentAssignment` runtime events) and changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement; the migration is **expand-only / append-only** and never alters or drops a prior table; an `AgentRun` is **kept** (append-only), never deleted. Adding the layer-kind triad to the S02/S35 metamodel is a **SemanticDiff `add`** via a ChangeSet, not an in-place edit. Any change to a **prior contract** it depends on — the S02 record substrate, the S04 wall `Classify` / the `AGENT_WRITE_ABOVE_WATERLINE` BlockReason (S13), S16 `AuthorityGraph`, S15 `TruthScope`, S29 `/goal`, S30 firewall, or the wall GRANT set — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated, S20) plus a **SemanticDiff** (S21), never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance, §8).

## Prompt a lancer

```text
You are step-executor for AIDOS step S52 — "The agent as a GOVERNED LAYER" (CoucheAgent in the kernel,
AgentRun in the runtime). Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the
agent has NO write grant to kernel/mirrors/fitness), front=Next.js (the Workbench). Homes = back/kernel/
agentlayer (the SOURCE layer) AND back/runtime/agentrun (the runtime events) ONLY. Follow the CLAUDE.md §6
per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §21 (Layer — the single meta-type from which every truth is built;
role SOURCE|PROJECTION, owner human|ai|derived, authority above|below), §13.8 (AuthorityGraph admission —
who approves/vetoes/escalates; "toute vérité above-the-line doit avoir un propriétaire d'autorité
explicite"), §44.5 (BlockReason: code, severity, explanation, how_to_fix[] — "tout refus doit être
actionnable"). Read CONTEXT-MAP.md + back/kernel/CONTEXT.md (Layer, four qualifying attributes, waterline,
test-as-goal vs test-as-means — the agent writes means-tests, NEVER truth-tests) + back/runtime/CONTEXT.md.
Read the prior steps you REUSE: S02 (the KRDCore records substrate — back/kernel/records, the KindLayer
metamodel + the content-hash scheme; do NOT fork it; ADD the layer-kind triad as a SemanticDiff `add`), S04
(the wall — back/hooks/pretooluse/wall.go `Classify` is the pure waterline predicate; the agent DB role has
NO write grant on kernel/mirrors/fitness; REUSE Classify, do not fork the wall), S13/back/runtime/blockreason
(the BlockReason shape + the CLOSED Code registry — CodeAgentWriteAboveWaterline already exists; reuse it,
invent NO new code), S15 (TruthScope), S16/back/kernel/authority (AuthorityGraph + Decide — a human authority
admits; an agent never self-approves), S27 (idea-intake — the only door a proposal routes through), S29
(/goal), S30 (MemoryFirewall — the ContextPack the run is given is firewall-gated; memory proposes, the
kernel declares; the agent layer's context policy DEFERS to S30). For any Next.js 16 / Atlas / Go / rapid API
doubt use context7 or node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language (prose française, vous) against back/kernel/CONTEXT.md + back/runtime/CONTEXT.md: a
    "CoucheAgent" is a GOVERNED LAYER (a SOURCE, above the line, versioned, content-addressed) modelling an
    agent's role/rights/objectif/tools/skills/hooks/limits; an "AgentRun" is a single EXECUTION — a RUNTIME
    EVENT below the line, NOT a layer, NOT a truth, never versioned/frozen. The layer-kind taxonomy GAINS
    "agent | equipe_agents | orchestration" (additive). "PeutModifierNoyau" and "PeutModifierFitness" are
    ALWAYS false. "Propose ≠ déclare": a BDD-writer agent PROPOSES a scenario (status `proposed`), it stays
    un-admitted until a HUMAN authority (S16) approves; an agent NEVER self-approves. Engrave the phrase:
    "en KRD un agent n'est jamais une autorité — c'est une couche gouvernée ; il propose, exécute, explore,
    mais ne déclare jamais seul ce qui est vrai." Do NOT use "IAM role", "RBAC/ACL", "permission sandbox",
    "autonomous/decisional agent" as synonyms. Resolve every branch before coding — especially: which write
    targets resolve above the waterline (defer to S04 Classify, do NOT redefine it); what "proposed, not
    admitted" means exactly; that a run carries no version/mirror. If a term shifts, update CONTEXT.md / write
    an ADR inline.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized for the
    runner. Two artifacts, by nature:
      - CoucheAgent governance fixture (cert_language: fixture, authority: above), reflecting
        kernel.agent_layer "bdd-writer" + the runtime AgentRun, as state→command→events. Rows: validate ->
        AgentLayerValid with peut_modifier_noyau==false AND peut_modifier_fitness==false ; an agent_action
        write to kernel.truth -> autorisee==false, NO kernel write, raison_blocage.code==
        AGENT_WRITE_ABOVE_WATERLINE, how_to_fix names idea→mirror→/goal→approval (THE done case 1) ; the same
        write to mirrors.* and fitness.* -> equally refused with AGENT_WRITE_ABOVE_WATERLINE ; propose a
        scenario -> ScenarioProposed, proposal.status=="proposed" (NEVER "admitted"), requires_authority is
        the human approver, NO kernel/mirror write (THE done case 2) ; a self-approve attempt (approver ==
        the proposing agent) -> Blocked, still "proposed" (an agent is never an authority) ; record an
        AgentRun -> AgentRunRecorded, run.version==null, stored below the waterline (NOT a layer).
      - property invariant (rapid, authority: below): for ANY CoucheAgent and ANY target string — Validate
        rejects peut_modifier_noyau/peut_modifier_fitness==true (always false); MayWrite denies with
        AGENT_WRITE_ABOVE_WATERLINE iff target is above the waterline (REUSE S04 Classify), regardless of
        role; Propose always yields status "proposed" (never "admitted") + a non-empty requires_authority (no
        self-admit); an AgentRun never carries a version/freeze nor a mirror field (unrepresentable in the
        type); Record is deterministic+total (same input → same content-hash id, no clock); a LayerKind
        outside {agent, equipe_agents, orchestration} ⇒ Validate errors.
    Run them; watch them go RED (no agentlayer/agentrun packages, no kernel.agent_layer node, no runtime
    tables, no Validate/MayWrite/Propose/Record). That red IS the /goal. Do NOT write a truth-test you would
    then satisfy — mirror the human intention only.

(c) TDD red→green→refactor, in back/kernel/agentlayer (the source) AND back/runtime/agentrun (the runtime
    events) ONLY (plus the back/migrations/ files). Outside-in. REUSE: the S02 content-hash record substrate
    for both row shapes (do NOT fork it); the S04 wall Classify as the waterline predicate inside MayWrite/
    ApplyWall (do NOT redefine the waterline); the S13 blockreason.CodeAgentWriteAboveWaterline (invent NO
    new code); the S16 authority.AuthorityGraph + S15 scope.TruthScope verbatim in the CoucheAgent. If a real
    tool choice arises WITHIN a frozen slot, search AT MOST 3 current (May 2026) options, pick the SIMPLEST,
    never touch the mandatory minimum (Godog, rapid, the fixture interpreter, Atlas, sqlc/pgx, Go hook
    binaries are FIXED). The likely genuine choices: the canonical-JSONB shape of the agent_layer body and
    the runtime run/action/assignment bodies (reuse S02's content-hash scheme); the Provider enum
    representation; the layer-kind CHECK enum. Record a short ADR (docs/adr/) ONLY if a genuine choice is made
    (e.g. the additive layer-kind extension of the S02 metamodel, or the AgentRun type making version/mirror
    unrepresentable). The migration is expand-only/append-only; GRANT the agent role SELECT only on
    kernel.agent_layer (the wall) and INSERT/SELECT on runtime.* (runtime telemetry is below the waterline),
    and NO grant on kernel/mirrors/fitness writes (the wall, §2/S04). Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, biome check at the
    monorepo root, eslint in front/web, and the new fixture + property. Self-certify on the COMPUTATIONAL
    only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce validate / the
    above-waterline write refusal (for kernel AND mirrors AND fitness) / propose-not-admitted /
    self-approve-refused / record-a-run, state the cause, propose. Check completeness: the agent_layer layer
    has its living mirror and each governance branch has a fixture row (KRD §33); no monster (no governance
    branch without a fixture row; a Propose path that admits without a human authority; an AgentRun
    representable as a layer) — else Stop blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED, action-capable). Create front/web/app/agents/
    → /agents, THEMED (ADR 0010 ccup tokens, shadcn, no hardcoded zinc/hex) and BILINGUAL (ADR 0011 next-intl,
    FR default, strings in front/web/messages/{fr,en}.json). List the agent layers (kind badge, nom, role,
    objectif, modele/provider; a rights panel showing PeutProposerVerite / PeutModifierNoyau=false /
    PeutModifierMiroir / PeutModifierFitness=false, read/write zones, bound skills/MCP/hooks, the
    AuthorityGraph approver, the TruthScope), plus a recent AgentRun card (the above-waterline write action
    shown RED with AGENT_WRITE_ABOVE_WATERLINE + how_to_fix). ACTION-CAPABLE (tout se fait par écran): a
    « Proposer un scénario » control bound (the `action` gesture) to the BDD-writer's Propose op — it produces
    a `proposed` proposal that routes to idea→mirror→/goal→approbation and is NOT admitted from the screen
    (truth-writes go propose → ChangeSet → human approval, never a direct write); and an « Enregistrer un run »
    control that records an AgentRun (a below-the-line write, executed directly). Read via the SELECT-grant
    role; render the fixture, do not re-implement governance. Do NOT touch existing routes. Add
    tests/e2e/agents.spec.ts (use the playwright-e2e skill) asserting: the agent card with kind:agent,
    role:bdd-writer and PeutModifierNoyau/PeutModifierFitness shown false (locked); the AgentRun's
    above-waterline write action red with AGENT_WRITE_ABOVE_WATERLINE and a how_to_fix naming
    idea→mirror→/goal→approval; clicking « Proposer un scénario » yields a `proposed` (not admitted) proposal
    requiring a human authority with NO kernel/mirror write; a self-approve attempt refused.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that
    agentlayer (kernel) and agentrun (runtime) are deep, well-named modules with a clean boundary — the LAYER
    lives above the line in the kernel, the RUN lives below the line in the runtime; that Validate/MayWrite/
    Propose/Record are pure and REUSE the S02 substrate + the S04 Classify + the S16 AuthorityGraph + the S15
    TruthScope without duplicating them; that PeutModifierNoyau/PeutModifierFitness are structurally false;
    that the AgentRun type makes version/mirror unrepresentable; that the migration/GRANTs keep the wall
    intact (kernel.agent_layer SELECT-only, runtime.* read/append, kernel/mirrors/fitness unwritable);
    boundaries match the CONTEXT.md files. Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the two Go packages (pure logic/schema), the Atlas
    migrations (persistence), the governance fixture + property (behaviour proof), and the Next route
    (visualization). Do NOT add a new hook (the S04 PreToolUse wall ALREADY refuses agent writes above the
    line and ships its own fault-injection — this step REUSES it, it does not add a second wall), no MCP
    server (no new backend capability; MayWrite/Propose/Record are pure logic; the S27 idea-intake receives
    proposals), no Skill (declaring a CoucheAgent is the generic "declare a source" gesture, S35), no codegen
    (an agent layer governs; it emits no Go/TS/DDL projection), no kernel write/freeze (a proposal becomes
    truth only through the S29 /goal flow via the aidos CLI role, a later wiring). A new artifact may ADD a
    guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. If a BlockReason code, the exact agent_layer /
  AgentRun JSONB shape, the Provider enum, the layer-kind CHECK enum, or the wall predicate is not pinned by
  KRD §21/§13.8/§44.5 / an existing migration / ADR / CONTEXT.md / the S02/S04/S13/S15/S16 packages, do NOT
  guess — record an OpenQuestion (provenance) and STOP on that branch. In particular: do NOT invent a new
  BlockReason code (CodeAgentWriteAboveWaterline already exists — reuse it); do NOT give a CoucheAgent
  PeutModifierNoyau/PeutModifierFitness == true (always false); do NOT give an AgentRun a version or a mirror
  field (a run is not a layer); do NOT add a "trusted-agent" bypass (every role is refused above the line);
  do NOT let an agent self-approve (an agent is never an authority); do NOT add a layer-kind beyond
  {agent, equipe_agents, orchestration}; do NOT redefine the waterline (reuse S04 Classify).
- You NEVER write a truth-test (a new invariant you would then satisfy — the circularity). The governance
  fixture is a means-test toward the human red, not a new truth; the mirror a proposed scenario must acquire
  is the HUMAN's /goal (S27/S29), not one you author to pass the gate.
- Any change to a prior contract (S02 records / the layer-kind metamodel, the S04 wall, the BlockReason shape
  S13, S15 TruthScope, S16 AuthorityGraph, S27 idea-intake, S29 /goal, S30 firewall, the wall GRANTs) goes
  through a ChangeSet + SemanticDiff (S20/S21) — adding the layer-kind triad is a SemanticDiff `add`. Add new
  files; never silently rewrite a prior artifact, never hand-edit back/gen/**. An AgentRun is kept
  (append-only), never deleted.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the governance fixture passes — Validate yields AgentLayerValid with
peut_modifier_noyau==false AND peut_modifier_fitness==false; an agent-role write to kernel (AND mirrors AND
fitness) is autorisee==false with AGENT_WRITE_ABOVE_WATERLINE (how_to_fix names idea→mirror→/goal→approval)
and NO truth write occurs (THE done criterion 1: an agent write above the waterline is blocked); a BDD-writer
agent's Propose yields a `proposed` (never `admitted`) scenario requiring a human authority, with NO
kernel/mirror write (THE done criterion 2: it proposes, it does not declare); a self-approve attempt is
refused (an agent is never an authority); an AgentRun records below the line with version==null (a run is not
a layer); the rapid invariant holds (Validate rejects the two always-false rights; MayWrite denies iff above
the waterline regardless of role; Propose never self-admits; AgentRun has no version/mirror; Record
deterministic+total; the layer-kind enum is closed); /agents renders the layers + a recent run with the red
above-waterline action and an action-capable « Proposer un scénario » control, with a passing Playwright e2e;
GRANTs prove kernel.agent_layer SELECT-only + runtime.* read/append while kernel/mirrors/fitness stay
unwritable by the agent; the migration is append-only/expand-only. The « Pour moi » Mintlify pages
(steps/concept/s52-couche-agent.mdx + steps/internals/s52-couche-agent.mdx) are live (mint validate +
broken-links clean, pushed). You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (CoucheAgent governance fixture, rapid property), where stored (mirrors schema)
  and materialized (tests/).
- Tests run: command + pass/fail counts (fixture, rapid/go test, biome, eslint, playwright).
- UI route: /agents — what it renders (agent layers + rights panel + recent AgentRun with the red
  above-waterline action; the « Proposer un scénario » / « Enregistrer un run » controls), e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes go through the aidos CLI role, not the agent); the
  layer-kind triad added to the S02/S35 metamodel as a SemanticDiff `add`; any other prior-contract change →
  ChangeSet + SemanticDiff (note the change_type), else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. no /goal admission wiring for proposals yet (S29 later), no agent-orchestration runtime
  loop, no hook/MCP, Provider enum coverage, layer-kind coverage (agent vs equipe_agents vs orchestration),
  BlockReason codes reused.
- Mintlify: the two « Pour moi » pages (paths) + mint validate / broken-links result + push status.
- Next safe step: the smallest stable next tooth (e.g. wire a proposed scenario into the S29 /goal admission
  gate, or the equipe_agents / orchestration governance over multiple CoucheAgents) and why it is safe to
  chain.
```

## KRD references

- **KRD §21** — Layer: the single meta-type from which every truth is built (`role` SOURCE|PROJECTION, `owner` human|ai|derived, `authority` above|below) — the metamodel the `CoucheAgent` extends with the `agent | equipe_agents | orchestration` layer-kind.
- **KRD §13.8** — AuthorityGraph admission: every above-the-line truth carries an explicit authority owner; an agent's proposal needs a **human** approver — it is never its own authority (S16).
- **KRD §44.5** — BlockReason: `code`, `severity`, `explanation`, `how_to_fix[]` — "tout refus doit être actionnable"; this step reuses `AGENT_WRITE_ABOVE_WATERLINE` (S04/S13), inventing no new code.
- **CLAUDE.md §2** (the wall — the agent never writes truth; the only door is idea → mirror → /goal → approval), **§8** (done is computed; the agent writes means-tests, never truth-tests; weights/rights are declared, never learned), **§6** (the per-step loop; determinism-first; the Mintlify two-page mandate; *tout se fait par écran*).
- **Prior steps reused:** **S02** (KRDCore records substrate + the `KindLayer` metamodel + content-hash scheme), **S04** (the wall — `Classify` waterline predicate + GRANTs + `AGENT_WRITE_ABOVE_WATERLINE`), **S13** (the BlockReason shape + closed Code registry), **S15** (TruthScope), **S16** (AuthorityGraph — the human authority that admits), **S27** (idea-intake — the only door a proposal routes through), **S29** (/goal), **S30** (MemoryFirewall — the firewall-gated ContextPack the run is given; the agent's context policy defers to it).
- **ADR 0010** (ccup theme tokens), **ADR 0011** (bilingual `next-intl`, FR default) — the Workbench `/agents` route conventions.
