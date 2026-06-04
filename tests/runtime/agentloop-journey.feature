Feature: An agent run drives a red work item to green without ever writing truth
  # Acceptance / JOURNEY mirror (Gherkin/Godog, N0) for AIDOS build-agent step BA19 —
  # the agentloop MCP server. reflects=runtime.agentloop, test_kind=acceptance,
  # cert_language=gherkin, liveness=live, authority=below. Conceptually stored in the
  # mirrors schema, materialized here for the runner (bootstrap exception, CLAUDE.md §6).
  #
  # This is the N0 happy-path of the WHOLE mono-agent loop driven THROUGH the MCP tool
  # agentloop.drive (idle → claim → gate → green → ledger), with the deterministic fake
  # provider (a ScriptedGenerator). It is distinct from the per-action N2 fixtures
  # (drive_fixture_test.go): those pin one action's gate verdict; THIS proves the whole
  # journey closes a goal and records an AgentRun ledger that never wrote truth.
  #
  # THE WALL (CLAUDE.md §2): launching a run is BELOW the line (the run records an
  # AgentRun ledger, telemetry). Any TRUTH the run would propose goes through
  # propose → ChangeSet → approval — never a direct write. The journey asserts the run
  # records ZERO above-waterline writes, and a kernel-write turn is REFUSED in place.

  Scenario: a governed run claims a red item, gates each action, and closes the goal green
    Given a governed agent implementation "agent:builder@v1" with the target tool bound
    And a red work item "redset:checkout#1" on goal "g-checkout" with one red mirror
    And a scripted session that writes the allowed projection then runs the mirror green
    When the loop drives the run through agentloop.drive
    Then the run result is "green"
    And every recorded action is authorised
    And the run wrote no truth above the waterline
    And the run records the agent identity "agent:builder@v1" and the work item "redset:checkout#1"

  Scenario: a run whose model attempts a kernel write has that action refused in place
    Given a governed agent implementation "agent:builder@v1" with the target tool bound
    And a red work item "redset:checkout#1" on goal "g-checkout" with one red mirror
    And a scripted session whose first turn attempts a write to the "kernel" schema
    When the loop drives the run through agentloop.drive
    Then one recorded action is refused with BlockReason code "AGENT_WRITE_ABOVE_WATERLINE"
    And the run wrote no truth above the waterline

  Scenario: a run abandons when it exhausts its declared budget before closing
    Given a governed agent implementation "agent:builder@v1" with the target tool bound
    And a red work item "redset:checkout#1" on goal "g-checkout" with one red mirror
    And a scripted session whose turn costs exceed the declared budget
    When the loop drives the run through agentloop.drive
    Then the run result is "abandoned"
    And the run wrote no truth above the waterline

  Scenario: watching a recorded run replays its action timeline deterministically
    Given a governed agent implementation "agent:builder@v1" with the target tool bound
    And a red work item "redset:checkout#1" on goal "g-checkout" with one red mirror
    And a scripted session that writes the allowed projection then runs the mirror green
    And the loop drove the run through agentloop.drive
    When the run is watched through agentloop.watch
    Then the watched timeline lists every recorded action in order
    And the watched result is "green"
