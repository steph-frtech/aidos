# EL14 — the transversal band /besoin-invariant: the lateral interview of invariants ∀ and policies.
# Acceptance mirror (Godog, N0): the human STATES the invariant, the CODE JUDGES.
# reflects=besoin.invariant.lateral-band · test_kind=gherkin · cert_language=godog ·
# authority=above · liveness=live.
#
# The done-criteria of EL14 are each a scenario below:
#   1. an invariant attached at `operation` is constrained LATERALLY — it constrains operation AND
#      every SOURCE rung above (the cross-product "true on all paths");
#   2. an ∃ (a single example) is REFUSED — ∃-instead-of-∀ is INVARIANT_IS_EXAMPLE_NOT_FORALL;
#   3. completeness FLAGS the missing crossing invariant (a resolved rung that requires one but has none);
#   4. the CIRCULARITY BAN (§8) refuses a self-authored invariant;
#   5. at most ONE Idea{Proposes:policy} via the legal idea_capture door (a policy band → exactly one;
#      a ∀ invariant → none).
#
# The wall: the band writes NO truth and NO mirror — it returns the BesoinGraph to be appended via the
# EL15 MCP, and at most one Idea{Proposes:policy} GUIDANCE. The LLM never declares the verdict.

Feature: /besoin-invariant — the transversal band of invariants ∀ and policies (the code judges)

  As the lateral elicitation band
  I record the invariants ∀ and policies that cross the levels
  But every verdict (∀ vs ∃, the lateral constraint, the routing, completeness) is computed by code

  Background:
    Given a fresh BesoinGraph for the project "demo-checkout"

  Scenario: an invariant attached at operation constrains every rung above (lateral)
    When I record a forall invariant attached at "operation"
    Then the recorded routing is "record"
    And the crossed levels include "operation"
    And the crossed levels include "product"
    And no kernel truth was written by the band

  Scenario: an example (∃) is refused — ∃ instead of ∀
    When I record an example statement attached at "operation"
    Then the recorded routing is "off_altitude"
    And the block reason code is "INVARIANT_IS_EXAMPLE_NOT_FORALL"
    And the BesoinGraph is unchanged by the band

  Scenario: a self-authored invariant is refused by the circularity ban
    When I record a self-authored invariant attached at "operation"
    Then the recorded routing is "off_altitude"
    And the block reason code is "INVARIANT_CIRCULAR_SELF_AUTHORED"
    And the BesoinGraph is unchanged by the band

  Scenario: a policy band emits at most one Idea{Proposes:policy}
    When I record a policy band attached at "operation"
    Then the recorded routing is "record"
    And exactly one policy idea is emitted with provenance human
    And no kernel truth was written by the band

  Scenario: completeness flags the missing crossing invariant
    Given a resolved "operation" rung that requires a crossing invariant
    Then the band completeness flags one monster "NEED_LEVEL_MISSING_INVARIANT"
