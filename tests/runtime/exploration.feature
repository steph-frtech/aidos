# mirrors schema · reflects: runtime.exploration (grill/spike/harvest over ideas.Idea) · test_kind: gherkin
# cert_language: godog · authority: above · liveness: live
#
# The §75 exploration gestures as a Runtime journey over the S27 Idea lifecycle (KRD §118): /grill
# challenges an intention ABOVE the wall and routes it on a verdict; a fuzzy intention goes to /spike
# (ratchet OFF, T0, throwaway, writes confined to /spike); /harvest proposes a DRAFT Truth (a kernel
# delta with NO frozen version and NO mirror — the freeze is a separate later /goal).
#
# Materialized source: conceptually stored in the `mirrors` schema, persisted to Postgres at S06
# (bootstrap exception, CLAUDE.md §6). This file is the LIEN PORTEUR of the journey.

Feature: A fuzzy idea spikes, harvest yields a DRAFT Truth

  Scenario: A fuzzy intention is routed to /spike (ratchet OFF, T0)
    Given an Idea with intent "something about smarter retries, not sure how", provenance "human", status "draft"
    When I grill it and the intention is "fuzzy"
    Then the Idea status becomes "spiking"
    And the spike zone is ratchet OFF at rigor "T0"
    And the verdict "fuzzy" and the provenance "human" are recorded

  Scenario: A spike's writes are confined to /spike
    Given an Idea with intent "smarter retries", provenance "human", status "spiking"
    When the spike writes to "/spike/retry-probe.go"
    Then the write is allowed
    When the spike writes to "/kernel/retry.policy"
    Then the write is blocked with BlockReason code "SPIKE_WRITE_ESCAPES_ZONE"
    And how_to_fix contains "confine_write_to_/spike"

  Scenario: Harvest produces a DRAFT Truth (proposal, not a freeze)
    Given an Idea with intent "retry with capped exponential backoff", provenance "human", status "spiking"
    When I harvest it
    Then the Idea status becomes "harvested"
    And a DRAFT-Truth proposal is produced
    And the proposal has no frozen version and no mirror
    And harvesting did not write the kernel or a mirror

  Scenario: Harvest cannot freeze the kernel directly
    Given an Idea with intent "retry with capped exponential backoff", provenance "human", status "spiking"
    When harvest attempts to write the "kernel" schema directly
    Then the write is blocked with BlockReason code "HARVEST_CANNOT_FREEZE"
    And how_to_fix contains "write_mirror_run_goal_freeze"

  Scenario: A sharp intention skips /spike
    Given an Idea with intent "checkout must accept a promo code", provenance "human", status "draft"
    When I grill it and the intention is "sharp"
    Then the Idea status becomes "grilled"

  Scenario: A bad idea is rejected and traced
    Given an Idea with intent "log every keystroke forever", provenance "human", status "draft"
    When I grill it and the intention is "bad"
    Then the Idea status becomes "rejected"
    And the rejection is recorded with provenance "human"
