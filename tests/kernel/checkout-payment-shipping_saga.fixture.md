# mirrors schema · reflects: kernel.saga_invariant "checkout-payment-shipping" · test_kind: fixture · cert_language: statechart · liveness: live · authority: above

SagaInvariant statechart fixture (KRD §49.2) — the canonical cross-cell distributed-transaction
invariant. A **SagaInvariant** binds named `participants` (`order`, `payment`, `shipping`) to a
cross-cell `property` that must hold across the **fédération**, each participant carrying its
`compensation` step (an S10 operation pinned `id@version`, never free code). The property holds on
the **happy path** (every leg commits) AND — the done case — when a leg **fails after**
`payment_captured`: the saga runs the declared **compensation** so `compensation_executed` holds and
the property is STILL satisfied (the property holds *via* compensation, not despite it). The monster
the saga forbids is a captured payment with **neither** `order_confirmed` **nor**
`compensation_executed` — the dangling-money case. A **CoherenceTest** (KRD §49.2) asserts « aucun
événement consommé n'est produit par une version incompatible »: a participant must not consume an
event a non-head / incompatible producer version produced.

This is the LIEN PORTEUR for the sagas package: the Go fixture test
(`back/kernel/sagas/sagas_fixture_test.go`) loads this intention. Verbatim KRD §49.2 — the agent
invents no participant, event, cert_language, or property branch.

```
saga "checkout-payment-shipping" {
  scope:    federation_policy
  participants: [
    { cell: order,    commits: [ order_confirmed ],       compensation: [ cancelOrder@v2 ] },
    { cell: payment,  commits: [ payment_captured ],       compensation: [ refundPayment@v3 ] },
    { cell: shipping, commits: [ shipping_scheduled ],     compensation: [ ] }
  ]
  property: "payment_captured implies (order_confirmed or compensation_executed)"
  mirror { cert_language: statechart }
}

# the happy path — every leg commits, the property holds
given trace [ order_confirmed, payment_captured, shipping_scheduled ]
  -> outcome == "satisfied"

# THE done case — shipping fails AFTER payment_captured ⇒ the saga runs the declared compensation
given trace [ order_confirmed, payment_captured, shipping_failed ]
  when run_compensation
    -> events: [ refundPayment@v3, cancelOrder@v2, compensation_executed ]   # the failed leg triggers compensation
    -> outcome == "satisfied"                                                # property holds VIA compensation

# the monster the saga forbids — a captured payment with NO confirmed order and NO compensation
given trace [ payment_captured ]                                             # leg failed, compensation never ran
  -> outcome == "violated"
  -> block_reason.code == "SAGA_INVARIANT_VIOLATED"
  -> block_reason.how_to_fix contains "run_compensation_on_failure"

# CoherenceTest — a consumed event from an incompatible (non-head) producer version is rejected
coherence_test {
  contracts: [ order.events@v3, payment.commands@v2 ]
  property:  "aucun événement consommé n'est produit par une version incompatible"
}
given heads { "order.events": "v3", "payment.commands": "v4" }               # payment.commands head is v4, the saga pins v2
  -> coherence == "incompatible"
  -> block_reason.code == "INCOMPATIBLE_CONTRACT_VERSION"
given heads { "order.events": "v3", "payment.commands": "v2" }
  -> coherence == "coherent"
```
