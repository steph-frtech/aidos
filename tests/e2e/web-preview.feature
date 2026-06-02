# mirrors schema · reflects: front.web-preview.checkout-button · test_kind: gherkin
# · cert_language: playwright-bdd · authority: above · liveness: live
#
# The control-spec + action-spec (S11) are the source of truth; the rendered button is
# their PROJECTION (S34/S38). This feature is materialized from the S11 control-spec
# state fixture (given → {visible, enabled}) and the action event fixture (click →
# invoke); it is replayed against the EMITTED component on /web-preview. This e2e green
# IS the S38 done criterion.

Feature: the emitted button respects its control-spec fixture

  Scenario: the button is visible and enabled when the control-spec's situation says so
    Given the control-spec fixture "filled-cart-valid-form-enabled" (cart filled, form valid, not submitting)
    When the emitted component is rendered on "/web-preview"
    Then the button "checkout-button" is visible            # matches EvalState(control, given).visible (S11)
    And the button "checkout-button" is enabled             # matches EvalState(control, given).enabled (S11)

  Scenario: the button is hidden when the control-spec's situation says so
    Given the control-spec fixture "empty-cart-hides" (cart empty)
    When the emitted component is rendered on "/web-preview"
    Then the button "checkout-button" is not visible        # the fixture, not a hand-authored UI guess

  Scenario: the button is visible but disabled when the form is invalid
    Given the control-spec fixture "filled-cart-invalid-form-disabled" (cart filled, form invalid)
    When the emitted component is rendered on "/web-preview"
    Then the button "checkout-button" is visible
    And the button "checkout-button" is disabled

  Scenario: clicking the enabled button declares the bound action's invoke
    Given the control-spec fixture "filled-cart-valid-form-enabled"
    When the emitted component is rendered on "/web-preview"
    And I click the button "checkout-button"
    Then the dispatched invoke is operation "createOrder"   # matches Plan(action, click) (S11)

  Scenario: the projection is deterministic and not stale
    Given the emitted component is rendered on "/web-preview"
    When I click RE-EMIT
    Then the re-emit reports byte-for-byte identical        # determinism (S34 contract)
    And the stale badge reads up to date                    # source_hash == the materialized head
