Feature: S61 — login → session → accès projet scopé (l'identité descend jusqu'à la RLS)
  En tant qu'utilisateur authentifié via OAuth/OIDC
  Quand la passerelle ouvre ma session et propage mon identité
  Alors je lis les données de mon projet — et l'identité keye la RLS Postgres (S55), pas seulement la passerelle

  Scenario: Un utilisateur authentifié lit son projet scopé
    Given a user authenticates via OIDC with email "alice@example.com" from provider "oidc"
    And the gateway opens a session for the user
    And a project "proj-A" the user is scoped to with one idea row
    When the propagated identity and active project key the RLS
    Then the agent reads its project's idea
