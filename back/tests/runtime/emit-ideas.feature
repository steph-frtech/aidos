# EL16 — the deterministic emitter EmitIdeas(graph) → []Idea, via the legal idea-intake door,
# GOVERNED by the closed table LevelToProposes (EL05).
#
# Acceptance mirror (Godog, N0): the human's BesoinGraph is projected into the backlog of Ideas.
# The CODE JUDGES — the mapping is a closed pure table (EL05), never an LLM cast. For each `resolved`
# LevelNode whose rung MAPS, EmitIdeas emits exactly one Idea{Proposes = LevelToProposes(level),
# Intent = the verbatim utterance, Provenance = {human, utterance verbatim}, Status = draft};
# NoEmit rungs (journey/view/invariant) emit NOTHING (their constraint lives in anchors_above).
# node_id reuses records.Hash → the Idea is content-addressed + idempotent.
#
# reflects=besoin.emit-ideas.governed-by-leveltoproposes · test_kind=gherkin · cert_language=godog ·
# authority=above · liveness=live.
#
# The done-criteria of EL16 are each a scenario below:
#   1. a graph with two MAPPING rungs (product + entity) emits exactly TWO draft Ideas, provenance human;
#   2. a graph with product + journey emits exactly ONE Idea (journey is NoEmit) — not two, no cast;
#   3. re-emission of the same graph is byte-identical (idempotence — same ids, same order);
#   4. an `unverifiable` rung reaches `spiking` only AFTER existing as a captured `draft` first
#      (idea_capture(draft) → idea_grill → idea_spike — never a direct spike cast);
#   5. EVERY emitted Idea has NO mirror (HasMirror always false) — emission writes no truth, no kernel.
#
# The wall (CLAUDE.md §2): EmitIdeas writes NO kernel and NO mirror. It is a pure projection above the
# line; promotion is the app-builder writing the mirror via /goal (hand-off S64). The LLM never judges.

Feature: EmitIdeas(graph) → []Idea — the deterministic emitter governed by LevelToProposes (the code judges)

  As the projection from the BesoinGraph to the backlog of Ideas
  I emit one draft Idea per resolved MAPPING rung and none per NoEmit rung
  But the mapping is the closed pure table LevelToProposes (EL05), never an LLM cast, and I write no truth

  Scenario: two mapping rungs emit exactly two draft ideas with human provenance
    Given a BesoinGraph with a resolved "product" rung and a resolved "entity" rung
    When I EmitIdeas over the graph
    Then exactly 2 ideas are emitted
    And every emitted idea has status "draft"
    And every emitted idea has provenance source "human"
    And an emitted idea proposes "product"
    And an emitted idea proposes "entity"
    And no emitted idea carries a mirror
    And no kernel truth was written by the emitter

  Scenario: a NoEmit journey rung does not emit — product plus journey emits exactly one idea
    Given a BesoinGraph with a resolved "product" rung and a resolved "journey" rung
    When I EmitIdeas over the graph
    Then exactly 1 idea is emitted
    And an emitted idea proposes "product"
    And no emitted idea proposes "journey"
    And no kernel truth was written by the emitter

  Scenario: re-emission is byte-identical (idempotence)
    Given a BesoinGraph with a resolved "product" rung and a resolved "entity" rung
    When I EmitIdeas over the graph twice
    Then the two emissions are byte-identical

  Scenario: an unverifiable rung reaches spiking only after existing as a captured draft first
    Given an emitted draft idea from an unverifiable rung
    When the idea is grilled then spiked
    Then the idea reaches status "spiking"
    And a direct spike from draft is refused

  Scenario: only resolved rungs emit — a drafting rung emits nothing
    Given a BesoinGraph with a resolved "product" rung and a drafting "entity" rung
    When I EmitIdeas over the graph
    Then exactly 1 idea is emitted
    And an emitted idea proposes "product"
    And no emitted idea proposes "entity"
