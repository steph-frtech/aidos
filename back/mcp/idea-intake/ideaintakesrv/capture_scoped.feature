# S64 — « Capturez votre idée » : the project-scoped human-provenance capture door.
#
# Acceptance mirror (Godog, N0 + Testcontainers, N5): a free-text idea captured WITH the user's
# provenance, SCOPED to the active project, lands as a REAL draft `ideas` record and is then VISIBLE
# in that project's live inbox — and ONLY that project's inbox (the per-project inbox that replaces
# the global `/ideas` fixture). The CODE judges: the lifecycle (draft) and the scoping are the pure
# ideas.Capture + the project_id column (S54), never an LLM cast.
#
# reflects=mcp.idea-intake.capture-scoped-human · test_kind=acceptance/integration ·
# cert_language=godog · authority=below (the `ideas` schema is staging ABOVE the wall, never the
# kernel) · liveness=live. Skipped when Docker/Testcontainers is unavailable (by-design
# forward-dependency on a real Postgres).
#
# The done-criterion of S64 is the first scenario: capture → draft idea persisted, visible in the
# live ideas panel, carrying the user's provenance.

Feature: Capturez votre idée — project-scoped human capture into the live ideas inbox

  As a human developing my app on AIDOS
  I capture my own free-text intention with my provenance, scoped to my project
  So that it becomes a real draft idea visible in my project's live inbox — never another project's

  Scenario: a captured human idea is persisted as a draft and visible in the project inbox
    Given an empty live ideas store
    When I capture the idea "je veux une remise au panier" proposing "operation" for project "proj-alpha" with provenance "humain: l'utilisateur Steph"
    Then the captured idea has status "draft"
    And the captured idea has provenance source "human"
    And the captured idea is scoped to project "proj-alpha"
    And the captured idea carries no mirror
    And the live inbox of project "proj-alpha" contains the idea
    And the captured idea provenance detail is "humain: l'utilisateur Steph"

  Scenario: the per-project inbox replaces the global fixture — another project does not see it
    Given an empty live ideas store
    When I capture the idea "je veux une remise au panier" proposing "operation" for project "proj-alpha" with provenance "humain: l'utilisateur Steph"
    And I capture the idea "je veux un export CSV" proposing "operation" for project "proj-beta" with provenance "humain: l'utilisateur Mia"
    Then the live inbox of project "proj-alpha" contains exactly 1 idea
    And the live inbox of project "proj-beta" contains exactly 1 idea
    And the live inbox of project "proj-alpha" does not contain the idea of project "proj-beta"

  Scenario: capture writes the ideas schema, never the kernel (the wall)
    Given an empty live ideas store
    When I capture the idea "je veux une remise au panier" proposing "operation" for project "proj-alpha" with provenance "humain: l'utilisateur Steph"
    Then no kernel truth was written by the capture
