// fixture.go — THROWAWAY (HR01 spike). Realistic AIDOS LLM-input prompts the probe measures:
// a rendered S33 ContextPack and a build-agent (BA17) transcript. These are the SAME shapes the
// real loop feeds the model (ContextPack from back/runtime/context, Transcript from
// back/runtime/agentimpl) — reconstructed here as plain text so the spike needs no real module.
//
// Why text, not the structs: `headroom` compresses the LLM INPUT, which is the rendered prompt
// string, not the Go struct. So the spike measures what the model would actually receive.
package headroom

import "strings"

// CarrierFact is a load-bearing fact the prompt MUST still carry after compression+retrieve.
// The fidelity check (FidelityReport) asserts every carrier fact survives retrieve∘compress.
// "Porteur" (KRD): the goal id, the red-set ids, the wall/forbidden paths, the stop condition,
// the allowed paths — losing any of these makes the agent invent or breach the wall.
type CarrierFact struct {
	Name  string
	Value string
}

// ContextPackPrompt is the rendered S33 ContextPack as the model receives it. Repetitive,
// reference-heavy text (ids repeated across sections, the wall boilerplate, the stop condition)
// — exactly the shape headroom's reference-replacement compresses well.
const ContextPackPrompt = `# CONTEXT PACK — goal: checkout-apply-promo (branch: main)
You are working the red goal "checkout-apply-promo" in the bounded context "checkout".

## Affected layers
- view:cart (bounded_context=checkout, branch=main, load_bearing=true)
- control:promo-field (bounded_context=checkout, branch=main, load_bearing=true)
- operation:applyPromo (bounded_context=checkout, branch=main, load_bearing=true)

## Active kernel
Red mirrors (your stop condition): promo-field.fixture, applyPromo.workflow
Invariants the pack carries: canPlaceOrder.property
Crossed PUBLIC contracts: checkout-api@hash, PaymentGateway@hash

## Boundaries (THE WALL — non-negotiable)
bounded_context: checkout
allowed_paths: /src/checkout/**
forbidden_paths: /kernel/**, /mirror/**
The wall: you NEVER write /kernel/** or /mirror/**. To change a truth you open an idea,
write its mirror, open a /goal. The wall is enforced by the PreToolUse hook AND the Postgres
GRANTs. Writing /kernel/** is refused. Writing /mirror/** is refused.

## Memory (scoped, filtered)
relevant_lessons: idempotency-for-payment
recent_incidents: out-of-stock-incident
glossary_terms:
Excluded (and why): old-promo-rule (stale), refund-window (out-of-scope),
billing:invoice-internals (cross-BC), billing-internal@hash (cross-BC),
billing.dunning.fixture (cross-BC), catalog:product (cosmetic-below-threshold)

## Skills / tools
skills: context, tdd
tools: context_compile

## Stop condition
red_set_green AND previous_green_intact AND aggregate_complete

pack_hash: 0x9f3a-checkout-apply-promo-main
`

// TranscriptPrompt is a rendered BA17 build-agent transcript (system prompt + turns). The
// system prompt repeats the wall and the goal; the turns repeat ids and file paths — again the
// repetition headroom targets.
const TranscriptPrompt = `<<SYSTEM>>
You are the AIDOS build-agent (step-executor) for goal checkout-apply-promo in bounded_context
checkout. You implement ONLY this step in /src/checkout/**. THE WALL: never write /kernel/** or
/mirror/**; truth changes go idea -> mirror -> /goal. Done is computed, never declared:
red_set_green AND previous_green_intact AND aggregate_complete. Red mirrors: promo-field.fixture,
applyPromo.workflow.

<<TURN 1 (agent)>>
Reading the red mirror promo-field.fixture under /src/checkout/. The fixture expects the promo
field control:promo-field to be visible_when cart non-empty and to trigger operation:applyPromo.
I will write /src/checkout/promo_field.go to make promo-field.fixture green.

<<TURN 2 (agent)>>
operation:applyPromo must validate the promo code then recompute the cart total. The workflow
mirror applyPromo.workflow expects events PromoApplied or PromoRejected. Writing
/src/checkout/apply_promo.go. I do NOT touch /kernel/** or /mirror/**.

<<TURN 3 (agent)>>
Re-running promo-field.fixture and applyPromo.workflow under /src/checkout/. Both green. The
crossed PUBLIC contract PaymentGateway@hash is unchanged. previous_green_intact holds. The pack
hash 0x9f3a-checkout-apply-promo-main is unchanged. Stop condition met for goal
checkout-apply-promo.
`

// CarrierFacts is the closed set of load-bearing facts the fidelity check requires to survive.
// If retrieve∘compress drops any of these the spike verdict is NO-GO (fidelity broken).
func CarrierFacts() []CarrierFact {
	return []CarrierFact{
		{Name: "goal_id", Value: "checkout-apply-promo"},
		{Name: "bounded_context", Value: "checkout"},
		{Name: "red_mirror_1", Value: "promo-field.fixture"},
		{Name: "red_mirror_2", Value: "applyPromo.workflow"},
		{Name: "allowed_paths", Value: "/src/checkout/**"},
		{Name: "wall_kernel", Value: "/kernel/**"},
		{Name: "wall_mirror", Value: "/mirror/**"},
		{Name: "crossed_contract", Value: "PaymentGateway@hash"},
		{Name: "stop_condition", Value: "red_set_green AND previous_green_intact AND aggregate_complete"},
		{Name: "pack_hash", Value: "0x9f3a-checkout-apply-promo-main"},
	}
}

// LargeContextPrompt is the REALISTIC input headroom targets: a long-running build-agent
// session where the ContextPack + system prompt + EVERY prior turn are re-sent on each model
// call (the transcript grows, the pack is re-prepended). This is where the token bill actually
// hurts (BA11/BA27 budget) and where reference-replacement pays off — the wall boilerplate, the
// goal/BC strings, the stop condition and the pack itself recur dozens of times. We model a
// 12-iteration session by re-concatenating the pack + transcript with per-iteration turns.
func LargeContextPrompt() string {
	var b strings.Builder
	b.WriteString(ContextPackPrompt)
	b.WriteString("\n")
	b.WriteString(TranscriptPrompt)
	for i := 0; i < 12; i++ {
		// Each model call re-sends the pack (the antidote to drift) + the growing transcript.
		b.WriteString("\n<<MODEL CALL ")
		b.WriteString(itoa(i))
		b.WriteString(">>\n")
		b.WriteString(ContextPackPrompt)
		b.WriteString("\n<<TURN agent>>\nContinuing goal checkout-apply-promo in bounded_context ")
		b.WriteString("checkout. Re-running red mirrors promo-field.fixture and applyPromo.workflow ")
		b.WriteString("under /src/checkout/**. THE WALL: never write /kernel/** or /mirror/**. ")
		b.WriteString("Stop condition red_set_green AND previous_green_intact AND aggregate_complete. ")
		b.WriteString("Crossed PUBLIC contract PaymentGateway@hash unchanged. pack_hash ")
		b.WriteString("0x9f3a-checkout-apply-promo-main.\n")
	}
	return b.String()
}

// itoa is a tiny dependency-free int->string (the spike module imports nothing but stdlib).
func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var d []byte
	for i > 0 {
		d = append([]byte{byte('0' + i%10)}, d...)
		i /= 10
	}
	return string(d)
}

// AllPrompts returns the AIDOS prompts the spike measures, keyed for the report. The
// large-context prompt is the realistic headroom target (long session, re-sent pack + grown
// transcript); the two small prompts are the per-call lower bound.
func AllPrompts() map[string]string {
	return map[string]string{
		"context_pack":  ContextPackPrompt,
		"transcript":    TranscriptPrompt,
		"large_session": LargeContextPrompt(),
	}
}
