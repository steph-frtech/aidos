# reflects=runtime.domainbind · test_kind=gherkin · cert_language=godog · authority=above · liveness=live
# S97 — Custom-domain binding + TLS + DNS for a deployed app (app-builder EPIC 10, DP27 / ADR 0043).
# A domain belongs to EXACTLY ONE project (DOMAIN_ALREADY_BOUND otherwise); a custom domain serves
# the app in HTTPS (the emitted Traefik labels carry the websecure router + tls + ACME certresolver);
# the binding domain→project is injective. domainbind PLANS — it writes nothing (the wall).

Feature: Custom-domain binding + TLS for a deployed app
  As the AIDOS Runtime
  I bind a custom domain to a deployed app, serving it over HTTPS via Traefik+ACME
  so that an emitted app reaches its users on their own domain — one domain, one project.

  Scenario: a custom domain serves the app in HTTPS
    Given an empty domain registry
    And a deploy of project "shop" at "d-ab12cd34ef56.deploy.aidos.app" serving service "shop-server"
    When the domain "shop.acme.com" is bound to project "shop"
    And the bind is permitted
    Then the app is served over HTTPS on "shop.acme.com"
    And the bind emits a websecure Traefik router with TLS and an ACME certresolver
    And the bind emits a CNAME of "shop.acme.com" to "d-ab12cd34ef56.deploy.aidos.app"

  Scenario: a domain already bound to another project is refused
    Given a registry where "shop.acme.com" is bound to project "other"
    And a deploy of project "shop" at "d-ab12cd34ef56.deploy.aidos.app" serving service "shop-server"
    When the domain "shop.acme.com" is bound to project "shop"
    Then the bind is refused with code "DOMAIN_ALREADY_BOUND"
    And the refusal names the owning project "other"

  Scenario: re-binding the same domain to the same project is idempotent
    Given a registry where "shop.acme.com" is bound to project "shop"
    And a deploy of project "shop" at "d-ab12cd34ef56.deploy.aidos.app" serving service "shop-server"
    When the domain "shop.acme.com" is bound to project "shop"
    Then the bind is permitted

  Scenario: a malformed domain is refused
    Given an empty domain registry
    And a deploy of project "shop" at "d-ab12cd34ef56.deploy.aidos.app" serving service "shop-server"
    When the domain "not a domain" is bound to project "shop"
    Then the bind is refused with code "OUT_OF_SCOPE"

  Scenario: the bind plan is reproducible
    Given an empty domain registry
    And a deploy of project "shop" at "d-ab12cd34ef56.deploy.aidos.app" serving service "shop-server"
    When the domain "shop.acme.com" is bound to project "shop" twice
    Then both binds share the same id
