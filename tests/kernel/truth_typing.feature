# mirrors schema · reflects: kernel.truthtyping · test_kind: acceptance · cert_language: gherkin · authority: above
# Materialized to disk for Godog (the frozen N0 back slot). It proves the two S14 done
# criteria: a truth without a TruthKind is rejected; a non-verifiable truth is routed to /spike.
Feature: Type the true before the ratchet bites
  A truth must declare its epistemic kind and its verification mode;
  the ratchet only bites what is certifiable, the rest goes to /spike.

  Scenario: a truth without a TruthKind is rejected
    Given a candidate truth with no truth_kind set
    When it is classified
    Then it is rejected
    And the BlockReason code is "missing-truth-kind"
    And it is not admitted to the kernel

  Scenario: a non-verifiable truth is routed to /spike
    Given a candidate truth with truth_kind "experiential"
    And verifiability_level "unverifiable"
    When it is classified
    Then it is routed to zone "/spike"
    And it is not admitted to the kernel

  Scenario: a deterministic behavioral truth is admitted to the kernel
    Given a candidate truth with truth_kind "behavioral"
    And verifiability_level "deterministic"
    When it is classified
    Then it is admitted to zone "kernel"

  Scenario: an out-of-enum truth_kind is rejected at the boundary
    Given a candidate truth with truth_kind "vibes"
    When it is classified
    Then it is rejected
    And the BlockReason code is "unknown-truth-kind"
