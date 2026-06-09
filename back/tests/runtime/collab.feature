# collab.feature — the S113 COLLABORATION SUBSTRATE acceptance mirror (Godog N0).
# reflects=runtime.collab.authority-and-provenance · test_kind=acceptance ·
# cert_language=godog · authority=below · liveness=live.
#
# It pins the two Gherkin done-criteria of S113 DIRECTLY against the pure collab authority
# (the deterministic judge — no DB needed, like the S62/S63 mirrors):
#   - un membre SANS authority ne peut approuver (un viewer/editor ne peut pas approuver un
#     changeset ; seul un owner détient administer) ;
#   - un commentaire/partage est enregistré avec le user agissant — la provenance n'est
#     JAMAIS un placeholder (acte par une identité non résolue → refusé).

Feature: Substrat de collaboration — autorité et provenance identifiée
  En tant que membre d'un projet AIDOS
  je veux que chaque acte social passe la porte d'autorité (S62/S110)
  et soit estampillé avec ma vraie identité (provenance jamais placeholder)

  Scenario: un membre sans authority ne peut approuver un changeset
    Given un projet "proj-alpha"
    And un membre "vic" avec le rôle "viewer" dans "proj-alpha"
    When "vic" tente d'approuver un changeset
    Then l'acte est refusé avec "ROLE_FORBIDDEN"

  Scenario: un editor ne peut pas non plus approuver (seul owner détient administer)
    Given un projet "proj-alpha"
    And un membre "edd" avec le rôle "editor" dans "proj-alpha"
    When "edd" tente d'approuver un changeset
    Then l'acte est refusé avec "ROLE_FORBIDDEN"

  Scenario: un owner peut approuver un changeset
    Given un projet "proj-alpha"
    And un membre "olive" avec le rôle "owner" dans "proj-alpha"
    When "olive" tente d'approuver un changeset
    Then l'acte est autorisé

  Scenario: un non-membre ne peut pas approuver
    Given un projet "proj-alpha"
    And une identité "stranger" sans adhésion dans "proj-alpha"
    When "stranger" tente d'approuver un changeset
    Then l'acte est refusé avec "NOT_A_MEMBER"

  Scenario: un commentaire est enregistré avec le user agissant (provenance réelle)
    Given un projet "proj-alpha"
    And un membre "vic" avec le rôle "viewer" dans "proj-alpha"
    When "vic" commente l'idée "idea-7" avec "needs a mirror first"
    Then le commentaire est enregistré avec l'auteur "vic"
    And l'auteur n'est jamais un placeholder

  Scenario: un acte sans identité résolue est refusé (provenance jamais placeholder)
    Given un projet "proj-alpha"
    And une identité vide
    When cette identité commente l'idée "idea-7" avec "anonymous"
    Then l'acte est refusé avec "UNIDENTIFIED_ACTOR"
