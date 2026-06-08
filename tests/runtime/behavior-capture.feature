# language: en
Feature: S67 — attacher un behavior-macro à la capture (§24.6)
  À la capture d'une idée, la librairie de behaviours réutilisables (S79) est surfacée.
  Attacher une behavior la DRY-RUN-EXPANSE — attributs/relations/operations/policies/fixtures
  — comme proposition DRAFT, en appelant l'UNIQUE Expand de S76 (jamais une 2ᵉ impl).
  L'écran PROPOSE : il n'écrit jamais le Kernel (le mur).

  Background:
    Given une idée capturée "idea-capture-001"
    And la librairie de behaviours réutilisables est surfacée

  Scenario: attacher "ownable" à "Order" propose le boilerplate owner-scoping
    When j'attache la behavior "ownable" à l'entité "Order"
    Then la proposition expanse l'attribut "owner_id"
    And la proposition expanse la policy "owner-scoping"
    And la proposition est un ChangeSet DRAFT ciblant "Order"
    And la proposition n'écrit aucune vérité Kernel

  Scenario: l'expansion attachée est byte-identique à l'unique Expand de S76
    When j'attache la behavior "ownable" à l'entité "Order"
    Then l'expansion attachée est byte-identique à celle de S76 pour "ownable" sur "Order"

  Scenario: la librairie surfacée est le catalogue S76 (pas une liste ad-hoc)
    Then la librairie surfacée est exactement le catalogue S76

  Scenario: une behavior hors catalogue est refusée par S76
    When j'attache la behavior "telepathic" à l'entité "Order"
    Then l'attache est refusée par S76 comme behavior inconnue

  Scenario: une attache sans idée capturée est refusée
    When j'attache la behavior "ownable" à l'entité "Order" sans idée capturée
    Then l'attache est refusée faute d'idée capturée
