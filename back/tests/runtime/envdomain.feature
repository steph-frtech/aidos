# reflects=runtime.domainbind · test_kind=gherkin · cert_language=godog · authority=above · liveness=live
# DP27 — Câblage du domaine custom dans l'environnement (DP06) + labels Traefik HTTPS émis (DP03).
# Un domaine custom se câble dans UN des cinq environnements DP06 ; les labels Traefik ÉMIS (le set
# canonique DP03, réutilisé) le résolvent en HTTPS (TLS via certresolver ACME). Un environnement
# sans TLS (local) refuse un domaine HTTPS (fail-closed). Le domaine DANS l'environnement = une
# vérité ⇒ propose → ChangeSet (DP24), jamais une écriture directe. domainbind PLANIFIE — il
# n'écrit rien (le mur).

Feature: Câblage du domaine custom dans l'environnement DP06 + HTTPS via Traefik
  As the AIDOS Runtime
  I cable a custom domain into a DP06 environment and emit the Traefik HTTPS labels (DP03 reused)
  so that an emitted app reaches its users on their own domain, per environment, over HTTPS.

  Scenario: prod cables a custom domain over HTTPS via the emitted DP03 labels
    Given the custom domain "shop.acme.com" of project "shop"
    When the domain is cabled into environment "prod"
    Then the cabling is permitted
    And the app is served over HTTPS on "shop.acme.com" in that environment
    And the cabling emits a websecure Traefik router with TLS and an ACME certresolver
    And the cabling emits an HTTP to HTTPS redirect

  Scenario: staging cables a custom domain over HTTPS too
    Given the custom domain "shop.acme.com" of project "shop"
    When the domain is cabled into environment "staging"
    Then the cabling is permitted
    And the app is served over HTTPS on "shop.acme.com" in that environment

  Scenario: local has no TLS so an HTTPS custom domain is refused
    Given the custom domain "shop.acme.com" of project "shop"
    When the domain is cabled into environment "local"
    Then the cabling is refused

  Scenario: an unknown environment is refused (fail-closed)
    Given the custom domain "shop.acme.com" of project "shop"
    When the domain is cabled into environment "staging-eu"
    Then the cabling is refused

  Scenario: the domain in the environment is a truth proposed as a DRAFT ChangeSet
    Given the custom domain "shop.acme.com" of project "shop"
    When the env-domain is proposed for environment "prod"
    Then a DRAFT ChangeSet is proposed carrying a spec and its mirror
    And the proposed ChangeSet is reproducible
