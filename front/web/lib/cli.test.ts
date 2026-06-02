import { describe, expect, it } from "vitest";
import { CLI_CONTRACTS, cliContracts, heading, type Verb } from "./cli";

// Reproducibility mirror (Vitest, front N4) — the /cli projection source is a
// static, deterministic registry mirroring back/cmd/aidos/contract.go: the five
// core verbs, in canonical order, each with a complete contract; cliContracts()
// is a defensive copy so the page cannot mutate the registry.

const EXPECTED_ORDER: Verb[] = ["check", "impact", "stable", "diff", "explain"];

describe("cli contract registry", () => {
	it("is the five core verbs in canonical order", () => {
		expect(CLI_CONTRACTS.map((c) => c.verb)).toEqual(EXPECTED_ORDER);
	});

	it("every contract carries a complete, declared shape", () => {
		for (const c of CLI_CONTRACTS) {
			expect(c.purpose).not.toBe("");
			expect(c.futureInputs).not.toBe("");
			expect(c.futureOutputs).not.toBe("");
			expect(c.ownedBy).not.toBe("");
			expect(c.status).toBe("stub");
		}
	});

	it("heading() reproduces the binary heading exactly", () => {
		expect(heading("check")).toBe("aidos check");
		expect(heading("explain")).toBe("aidos explain");
	});

	it("cliContracts() returns a defensive copy, not the registry", () => {
		const a = cliContracts();
		a[0].purpose = "MUTATED";
		expect(cliContracts()[0].purpose).not.toBe("MUTATED");
		expect(CLI_CONTRACTS[0].purpose).not.toBe("MUTATED");
	});

	it("is deterministic — two reads are deep-equal", () => {
		expect(cliContracts()).toEqual(cliContracts());
	});
});
