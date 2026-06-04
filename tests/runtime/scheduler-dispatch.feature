Feature: The scheduler MCP shell dispatches the queue at a tick without ever writing truth
  # Acceptance / JOURNEY mirror (Gherkin/Godog, N0) for AIDOS build-agent step BA23 —
  # the scheduler MCP server (scheduler_tick + scheduler_assignments + scheduler_fence).
  # reflects=runtime.scheduler-dispatch, test_kind=acceptance, cert_language=gherkin,
  # liveness=live, authority=below. Conceptually stored in the mirrors schema, materialized
  # here for the runner (bootstrap exception, CLAUDE.md §6).
  #
  # This drives the dispatch capability THROUGH the MCP tool scheduler_tick: ONE tick runs
  # the pure Schedule planner, applies the four transition columns under the scheduler role
  # (below the line), and surfaces the dispatch view. It proves the dependency gate, the
  # dead-agent reclaim (no human action), and the write-path epoch fence.
  #
  # THE WALL (CLAUDE.md §2): the tick writes leases/telemetry BELOW the line — never a
  # truth schema. Every decision is the pure planner; the shell only sequences + applies.

  Scenario: one tick reclaims a dead-agent lease, blocks a dep-gated item, leases the head
    Given the scheduler shell holds the canonical dispatch fixture queue
    And the now is "2026-06-03T12:00:00Z" with lease window until "2026-06-03T12:05:00Z"
    When the scheduler shell runs one tick through scheduler.tick
    Then the item "redset:checkout#dead" was reclaimed and re-leased at epoch 3
    And the item "redset:checkout#proj" stays "blocked" on its unresolved dependency
    And the item "redset:checkout#mirror" is "claimed" by a role-matched agent
    And the tick wrote no truth above the waterline

  Scenario: resolving the upstream then re-ticking unblocks and leases the dependent
    Given the scheduler shell holds the canonical dispatch fixture queue
    And the upstream mirror "redset:checkout#mirror" is resolved
    And the now is "2026-06-03T12:00:00Z" with lease window until "2026-06-03T12:05:00Z"
    When the scheduler shell runs one tick through scheduler.tick
    Then the item "redset:checkout#proj" is "claimed" by a role-matched agent

  Scenario: a stale-epoch write is refused at the fence with AGENT_LEASE_FENCED
    Given the scheduler shell holds the canonical dispatch fixture queue
    When a write bearing epoch 1 is fenced against current epoch 2 through scheduler.fence
    Then the write is refused with BlockReason code "AGENT_LEASE_FENCED"

  Scenario: the assignments are read back after a tick
    Given the scheduler shell holds the canonical dispatch fixture queue
    And the now is "2026-06-03T12:00:00Z" with lease window until "2026-06-03T12:05:00Z"
    When the scheduler shell runs one tick through scheduler.tick
    And the assignments are read through scheduler.assignments
    Then at least one assignment is recorded
