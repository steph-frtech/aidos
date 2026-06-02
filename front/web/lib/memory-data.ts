/**
 * Seed memories for the /memory-backends worked example (S31) — one of each of the four indexable
 * kinds, plus a branch-x semantic row so the branch filter has something to exclude. Each carries
 * provenance + taint so the screen shows memory is FUEL WITH PROVENANCE, never silent truth.
 *
 * These ids are illustrative content addresses (the Go store computes the real SHA-256 hash); the
 * UI twin only needs stable, distinct ids for ordering + rendering.
 */
import type { MemoryItem } from "./memory";

export const SEED_MEMORIES: readonly MemoryItem[] = [
	{
		id: "ep-incident-42",
		kind: "episodic",
		content: "incident 42 shopping cart checkout failed on deploy",
		provenance: "run:42",
		validityScope: "",
		expiresAt: "",
		confidence: 0.6,
		taint: ["incident_derived"],
		branch: "main",
	},
	{
		id: "se-cart-term",
		kind: "semantic",
		content: "shopping cart term means the basket of items a buyer collects",
		provenance: "glossary",
		validityScope: "",
		expiresAt: "",
		confidence: 0.9,
		taint: [],
		branch: "main",
	},
	{
		id: "pr-grill-gesture",
		kind: "procedural",
		content: "grill with docs gesture sharpens an intention before code",
		provenance: "skill:grill-with-docs",
		validityScope: "",
		expiresAt: "",
		confidence: 0.8,
		taint: [],
		branch: "main",
	},
	{
		id: "st-context-map",
		kind: "structural",
		content: "context map dependency graph of the five subsystems",
		provenance: "map:context",
		validityScope: "",
		expiresAt: "",
		confidence: 0.7,
		taint: [],
		branch: "main",
	},
	{
		id: "se-cart-branchx",
		kind: "semantic",
		content: "shopping cart basket on an experimental branch",
		provenance: "glossary",
		validityScope: "",
		expiresAt: "",
		confidence: 0.4,
		taint: ["unverified"],
		branch: "branch-x",
	},
];

/** The default recall query for the example — "shopping cart" should rank the semantic term first. */
export const EXAMPLE_QUERY = "shopping cart basket";
