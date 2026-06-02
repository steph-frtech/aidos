# Mirror (materialized) — CoucheAgent governance · S52

- **reflects:** `kernel.agent_layer` "bdd-writer" + the runtime `AgentRun` (back/runtime/agentrun)
- **test_kind:** fixture · **cert_language:** fixture · **authority:** above · **liveness:** live
- **stored:** mirrors schema (S06 back-fill) · **materialized:** here + `back/kernel/agentlayer/agentlayer_fixture_test.go`

The done invariant (KRD law): **un agent n'est jamais une autorité — c'est une couche
gouvernée ; il propose, exécute, explore, mais ne déclare jamais seul ce qui est vrai.**
An agent-role write above the waterline is `AGENT_WRITE_ABOVE_WATERLINE`-blocked, and a
BDD-writer agent's proposed scenario stays un-admitted until a HUMAN authority approves it.

```
mirror reflects "bdd-writer" {

  given couche_agent {
    kind: "agent"
    spec {
      nom: "bdd-writer", role: "bdd-writer", objectif: "propose red scenarios",
      modele: "claude-opus-4-8", provider: "anthropic",
      peut_proposer_verite:  true,
      peut_modifier_noyau:   false,   # ALWAYS false (the wall)
      peut_modifier_miroir:  true,    # may PROPOSE a mirror
      peut_modifier_fitness: false,   # ALWAYS false (NIVEAU 3 read-only)
      zones_lecture:  [ kernel, mirrors, ideas, brain ],
      zones_ecriture: [ ideas ],      # NONE above the waterline
      stop_conditions: [ "red set still red" ]
    }
    autorite { domain: "checkout", truth_kind: "behavioral", approvers: [ product_owner ] }
    scope    { region: "EU" }
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
      -> action.raison_blocage.how_to_fix names idea → mirror → /goal → approbation

  # the same agent attempting to write mirrors / fitness — equally refused, every role
  given agent_run { agent: "bdd-writer" }
    when agent_action { type: "write", cible: "mirrors.mirror" } -> autorisee == false, AGENT_WRITE_ABOVE_WATERLINE
  given agent_run { agent: "executor" }
    when agent_action { type: "write", cible: "fitness.grammar" } -> autorisee == false, AGENT_WRITE_ABOVE_WATERLINE

  # a below-the-line write (runtime telemetry) is ALLOWED
  given agent_run { agent: "bdd-writer" }
    when agent_action { type: "write", cible: "runtime.agent_run" } -> autorisee == true

  # THE done case (2) — a BDD-writer agent may PROPOSE a scenario, but it is NOT admitted
  given couche_agent { id: "bdd-writer" }
    when propose { scenario: "checkout charges tax on EU orders" }
      -> events: [ ScenarioProposed ]
      -> proposal.status == "proposed"            # never "admitted"
      -> proposal.requires_authority == [ product_owner ]   # S16 — the HUMAN approver
      -> proposal.route == [ idea, mirror, goal, approbation ]
      -> NO kernel/mirror write occurs

  # an agent CANNOT self-approve its own proposal — the circularity the wall forbids
  given proposal { id: "checkout-tax", proposed_by: "bdd-writer" }
    when approve { approver: "bdd-writer" }
      -> events: [ Blocked ]
      -> block_reason.code == "AGENT_WRITE_ABOVE_WATERLINE"   # an agent is never an authority
      -> proposal.status == "proposed"            # still un-admitted

  # only a HUMAN authority (S16) admits
  given proposal { id: "checkout-tax", proposed_by: "bdd-writer" }
    when approve { approver: "product_owner" }
      -> proposal.status == "admitted"

  # a single execution is NOT a layer — it is a runtime AgentRun event, below the line
  given agent_run { agent: "bdd-writer", goal: "g-checkout-tax", red_work_item: "rwi-1",
                    started_at: "2026-06-02T18:00:00Z" }
    when record { ended_at: "2026-06-02T18:05:00Z", result: "still_red" }
      -> events: [ AgentRunRecorded ]
      -> run.id is content-addressed (Hash of the canonical body, no clock)
      -> run carries NO version and NO mirror   # a run is not a layer, not a truth
      -> run is stored below the waterline (runtime), not in kernel/mirrors
}
```

## Invariant (∀) — property (rapid), authority: below

For ANY generated `CoucheAgent` (any role, provider, objectif, read/write zones) and ANY
write target string:
1. `Validate` rejects any spec with `peut_modifier_noyau == true` OR
   `peut_modifier_fitness == true` (the two are ALWAYS false — structural, not a toggle);
2. `MayWrite(spec, target)` denies with `AGENT_WRITE_ABOVE_WATERLINE` IFF `target` resolves
   above the waterline (REUSES the S04 predicate), regardless of the agent's role;
3. `Propose` always yields `status == "proposed"` (NEVER "admitted") and a non-empty
   `requires_authority` — an agent NEVER self-admits;
4. an `AgentRun` carries NO `version`/freeze and NO `mirror` field (the type makes a run
   unrepresentable as a layer);
5. `Record` is deterministic + total: same input run ⇒ same content-hash id (no clock);
6. the layer-kind taxonomy is CLOSED: a kind outside `{agent, equipe_agents, orchestration}`
   ⇒ `Validate` errors.
