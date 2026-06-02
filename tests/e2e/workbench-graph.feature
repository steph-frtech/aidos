# mirrors schema · reflects: front./.workbench-graph · test_kind: gherkin
# · cert_language: playwright-bdd · authority: above · liveness: live
#
# Every node & edge is a PROJECTION of prior kernel truth (S10/S11/S15/S17/S19/S22/S35);
# the cockpit authors nothing. This feature is materialized from the workbenchgraph
# builder's example head and replayed against the rendered cockpit at "/". This e2e green
# + the stable UI snapshots IS the S44 done criterion.

Feature: the full Workbench graph navigates truth and stays visually stable

  Scenario: deep-navigation walks the kernel's own edges
    Given the cockpit "/" renders the WorkbenchGraph for the current kernel head
    When I click the button node "saveOrder"
    Then I deep-link to "/web-preview" for that control          # the node's route, from truth
    And the operation node "createOrder" deep-links to "/operation"
    And the entity node "order-entity" deep-links to "/entity-map"
    And the mirror node "createOrder-fixture" deep-links to "/mirrors"
    And the scope node "checkout-scope" deep-links to "/scopes"
    And the incident node "oos-incident" deep-links to "/red-wave"
    Then each click deep-links to that node's per-step panel      # button→view→action→operation→entity→mirrors→scopes→incidents

  Scenario: the color legend reflects truth-type, liveness and red-wave — not a UI guess
    Given the cockpit "/" renders the WorkbenchGraph
    Then the legend lists each truth-type / liveness / red-wave color it uses
    And a node above the line is colored as "above"             # matches its truth_type (S14)
    And a stale/red-wave node is colored as "red"               # matches red_wave_state (S22)

  Scenario: the graph is visually stable
    Given the cockpit "/" renders the WorkbenchGraph for an unchanged kernel head
    When I re-render the cockpit
    Then the UI snapshot is unchanged                            # deterministic; graph_hash unchanged
    And the "/brain" cockpit snapshot is unchanged
