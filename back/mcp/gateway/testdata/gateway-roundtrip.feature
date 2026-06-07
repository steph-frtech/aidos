Feature: La passerelle S58 route below-the-line jusqu'à Postgres vivant et n'outrepasse pas les GRANTs
  En tant que passerelle MCP-over-HTTP project-scopée
  Je route les appels below-the-line jusqu'au store vivant
  Et je n'écris jamais de vérité directement — le rôle agent n'a aucun GRANT

  Scenario: Un appel below-the-line round-trip jusqu'au Postgres vivant
    Given the gateway fronts the live archive store
    When a below-the-line "store_put" call is routed for the active project
    And the dispatch writes the payload to the live store
    Then the same bytes round-trip back from Postgres

  Scenario: La passerelle n'outrepasse pas les GRANTs (écriture de vérité refusée par Postgres)
    Given the gateway fronts the live archive store
    When the fenced agent role attempts a truth-zone write
    Then Postgres refuses it for lack of GRANT
