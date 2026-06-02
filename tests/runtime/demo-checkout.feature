# mirrors schema · reflects: examples.checkout.full-loop · test_kind: gherkin · cert_language: godog · authority: above · liveness: live
# The loop is the subject; nothing here authors truth — truth enters only via an
# approved ChangeSet (the door, §2). The slice COMPOSES the prior teeth; it
# re-implements none. (S46 demo-checkout.)
Feature: an idea for "place an order from the cart" travels the full KRD loop to a green stable slice

  Scenario: an idea becomes a goal that writes a red set
    Given a clean stable phase
    And the idea "a customer places an order from their cart" is intaken into the ideas schema
    When a /goal is opened from that idea
    Then a red set exists for "createOrder"
    And no kernel truth has been written yet

  Scenario: the candidate truth enters the kernel only through an approved changeset
    Given a red set for "createOrder"
    When the Order entity AST and the createOrder operation/control/action AST are applied via an approved changeset
    Then the kernel head exposes the createOrder operation content hash
    And the mirror reflecting "createOrder" is live

  Scenario: the projections emit and createOrder persists an order against real Postgres
    Given the kernel head exposes "createOrder"
    When the emitters run
    And createOrder is invoked with a cart of 2 line items
    Then an Order row is persisted in Postgres
    And the order's line items match the cart

  Scenario: the slice freezes into a stable phase with everything green
    Given the createOrder slice is green
    When the phase is sealed
    Then a new stable phase exists on the dag
