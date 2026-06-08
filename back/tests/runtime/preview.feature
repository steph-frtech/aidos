# S94 — Ephemeral preview environment per app (app-builder EPIC 10, ADR 0043 / DP25).
# reflects=runtime.preview · test_kind=gherkin · cert_language=godog · authority=above · liveness=live.
#
# The build-green journey: from the EMITTED surface of a content-addressed STABLE PHASE,
# preview computes a deterministic, content-addressed PreviewPlan keyed on the phase, brings
# the emitted app (a Hono Node/Bun/edge process, NOT a Go binary) up at a per-phase preview
# URL via `pulumi up`, asserts the SERVED-app hash equals the EMITTED-app hash of the phase,
# and tears it down deterministically (`pulumi destroy`). preview writes no truth (the wall).

Feature: Ephemeral preview environment keyed on a content-addressed phase

  Scenario: Build-green — the preview serves the phase's emitted app at a per-phase URL
    Given a content-addressed stable phase "phase-abc123def456"
    And its emitted surface for project "shop" (server, front, infra, datastore)
    And the emitted Pulumi program for the phase
    When I build the preview plan for the phase
    Then the plan is keyed on phase "phase-abc123def456"
    And the preview URL is a per-phase subdomain
    And the boot command runs "pulumi up"
    And the teardown command runs "pulumi destroy"

  Scenario: The preview's served-app hash equals the phase's emitted-app hash
    Given a content-addressed stable phase "phase-abc123def456"
    And its emitted surface for project "shop" (server, front, infra, datastore)
    And the emitted Pulumi program for the phase
    When I build the preview plan for the phase
    And the running preview reports its served-app hash from the phase's emitted bytes
    Then the served-app hash equals the emitted-app hash of the phase

  Scenario: A stale preview serving the wrong hash is refused
    Given a content-addressed stable phase "phase-abc123def456"
    And its emitted surface for project "shop" (server, front, infra, datastore)
    And the emitted Pulumi program for the phase
    When I build the preview plan for the phase
    And the running preview reports a served-app hash "stale-deadbeef"
    Then the hash check is refused with a BlockReason

  Scenario: A preview without a content-addressed phase is refused
    Given an emitted surface for project "shop" with no phase
    And the emitted Pulumi program for the phase
    When I build the preview plan for the phase
    Then the plan is refused with a BlockReason
    And how_to_fix names the content-addressed phase

  Scenario: The same phase always previews at the same URL (idempotent boot)
    Given a content-addressed stable phase "phase-abc123def456"
    And its emitted surface for project "shop" (server, front, infra, datastore)
    And the emitted Pulumi program for the phase
    When I build the preview plan for the phase twice
    Then both plans share the same id and URL
