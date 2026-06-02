/**
 * Canonical fixture data for the /memory-firewall panel (S30) — the "stale-discount-claim"
 * MemoryItem from the MemoryFirewall fixture mirror (back/archive/brain/firewall). Render-only;
 * the firewall logic lives in lib/firewall.ts (the Go twin).
 */

import type { MemoryItem } from "@/lib/firewall";

/** The fixture memory: a stale, user-claimed discount rumour — context fuel, never truth. */
export const STALE_DISCOUNT_CLAIM: MemoryItem = {
	// id is the content hash of the canonical body (illustrative — computed by the Go engine).
	id: "mem-stale-discount-claim",
	content: "regulars always get 20% off",
	provenance: "user_claim:the support lead told me",
	validityScope: "EU",
	expiresAt: "2025-12-31",
	confidence: 0.4,
	taint: ["user_claim", "stale"],
	branch: "main",
};
