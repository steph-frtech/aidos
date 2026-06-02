# mirrors schema · reflects: kernel.composes · test_kind: acceptance · cert_language: gherkin · authority: above
# Materialized from the `mirrors` schema for the runner (bootstrap exception: the mirrors
# schema lands at S06; this .feature is the human-readable journey source, mirrored by the
# Go fixture composes_fixture_test.go which IS the executable red→green proof).
#
# KRD §108 (composes, the 7th link) · §109 (aggregate_complete(L) := own_mirror(L)==GREEN ∧
# ∀ child via composes : aggregate_complete(c)) · §110 (drill-down / fall-back-up) · §112
# (weighted, thresholded activation — a cosmetic change below the declared activation_threshold
# does NOT reopen the parent's emergent invariant; weights/thresholds are DECLARED, never learned).
Feature: Truth is compositional — a composite is green only if its own mirror and all its children are green

  Background:
    Given a composite layer P with an own_mirror and a composes link to child C
    And the composes weight of P→C is "load-bearing"
    And P's activation_threshold is declared above the line

  Scenario: A red child reddens the aggregated parent
    Given P's own_mirror is GREEN
    And child C's aggregate is RED
    When the aggregate of P is computed recursively
    Then the aggregate of P is RED

  Scenario: All-green own mirror and children make the parent green
    Given P's own_mirror is GREEN
    And every composes-child of P has aggregate GREEN
    When the aggregate of P is computed recursively
    Then the aggregate of P is GREEN

  Scenario: A green own mirror with a red child is NOT green (own invariant alone is not enough)
    Given P's own_mirror is GREEN
    And exactly one load-bearing child of P is RED
    When the aggregate of P is computed recursively
    Then the aggregate of P is RED
    And the drill-down path names the red child

  Scenario: A cosmetic child change below threshold does not redden the parent
    Given P's own_mirror is GREEN
    And only a "cosmetic" child of P changed
    And the activation is below P's activation_threshold
    When the aggregate of P is computed recursively
    Then the aggregate of P is GREEN

  Scenario: A cycle in the composes DAG yields a typed error, never an infinite recursion
    Given P composes C and C composes P (a cycle)
    When the aggregate of P is computed recursively
    Then a typed cycle error is returned naming the layers on the cycle
    And the aggregate never recurses forever and never invents an edge
