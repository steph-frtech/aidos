# EL13 — the umbrella skill /compound-besoin: the level-by-level FORCED interview.
# Acceptance mirror (Godog, N0): the LLM LEADS the dialogue, the CODE JUDGES.
# reflects=besoin.interview.level-by-level · test_kind=gherkin · cert_language=godog ·
# authority=above · liveness=live.
#
# The three done-criteria of EL13 are each a scenario below:
#   1. an interview at `product` closes its branches with 3 answers → the level passes `resolved`;
#   2. a FUZZY (unverifiable) answer routes to /spike (idea_capture → idea_grill → idea_spike),
#      NOT a descent;
#   3. an OFF-ALTITUDE answer (an entity attributes body submitted at `product`) is REJECTED BY SCHEMA.
#
# The wall: the interview writes NO truth and NO mirror — it returns the BesoinGraph to be appended via
# the EL15 MCP besoin-intake. The LLM never declares `resolved`; CanDescend (EL07) computes it.

Feature: /compound-besoin — the level-by-level forced interview (LLM assists, the code judges)

  As the umbrella elicitation skill
  I lead the dialogue one level at a time
  But every verdict (enterable level, resolved, routing, altitude) is computed by code

  Background:
    Given a fresh BesoinGraph for the project "demo-checkout"

  Scenario: the product level is resolved when three answers close its branches
    Given the enterable level is "product"
    When I record a non-vacant product answer that names an intent, right-sized scenarios and a retained view archetype
    Then the recorded routing is "record"
    And the product level is resolved
    And no kernel truth was written by the interview

  Scenario: a fuzzy answer routes to /spike, never a descent
    Given the enterable level is "product"
    When I record a product answer the metadata classifies as unverifiable
    Then the recorded routing is "spike"
    And the spike route is "idea_capture,idea_grill,idea_spike"
    And the product level is not resolved
    And the BesoinGraph is unchanged by the interview

  Scenario: an off-altitude answer is rejected by schema
    Given the enterable level is "product"
    When I record an entity attributes body submitted at the product level
    Then the recorded routing is "off_altitude"
    And the block reason names the schema mismatch
    And the BesoinGraph is unchanged by the interview

  Scenario: the LLM never declares resolved — the code recomputes it
    Given the enterable level is "product"
    When I record a schema-valid product answer that selects no view archetype
    Then the recorded routing is "record"
    And the product level is not resolved
    And at least one open branch remains
