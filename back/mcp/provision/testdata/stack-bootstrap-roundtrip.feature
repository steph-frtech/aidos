Feature: stack.bootstrap route below-the-line jusqu'à la séquence d'amorçage qui tourne
  En tant qu'outil MCP de provisioning project-scopé exposé sur la passerelle S58
  Je route l'appel stack.bootstrap (DP13) jusqu'à l'émetteur d'amorçage DP12
  Et je rends la séquence ordonnée complète — jusqu'au rung urls-printed (la stack qui tourne)
  Sans jamais écrire de vérité (routage pur, below-the-line)

  Scenario: stack.bootstrap round-trip jusqu'au rung urls-printed
    Given the provision MCP server fronts the DP12 bootstrap emitter
    When stack.bootstrap is called for the active project with a clean host and present secrets
    Then the routed call yields the full ordered bootstrap sequence
    And the sequence runs through to the urls-printed rung
