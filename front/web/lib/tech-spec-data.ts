/**
 * Demo TechKernels for the Workbench /tech-spec panel (FK15 part (b)). These are illustrative
 * INPUT bundles (already-declared technical elements); the panel assembles them into the two
 * projections live. They are demo data, not the truth (the wall: freezing goes via /goal).
 */
import type { TechKernel } from "./tech-spec";

/** A NETWORKED kernel (a checkout API cell) exercising every assembled section. */
export const checkoutKernel: TechKernel = {
	kernelId: "CheckoutAPI",
	networked: true,
	contract: {
		ref: "contract:CheckoutAPI",
		title: "Contrat Checkout",
		body: "POST /checkout → 201.",
	},
	model: {
		ref: "model:Order",
		title: "Modèle Order",
		body: "order(id, total, status).",
	},
	osi: [
		{
			layer: "L5-session",
			specs: [
				{
					ref: "osi:L5:oauth",
					title: "OAuth bearer",
					body: "Bearer token requis.",
				},
			],
			tests: [
				{
					ref: "test:L5:auth-401",
					title: "401 sans token",
					body: "Refus sans bearer.",
				},
			],
		},
		{
			layer: "L7-application",
			specs: [
				{
					ref: "osi:L7:schema",
					title: "Schéma OpenAPI",
					body: "Schéma de la route.",
				},
			],
			tests: [
				{
					ref: "test:L7:contract",
					title: "Contrat d'interface",
					body: "Pact provider.",
				},
			],
		},
	],
	facets: [
		{
			facet: "M",
			specs: [
				{
					ref: "facet:M1:layers",
					title: "Frontières",
					body: "kernel ⊥ runtime.",
				},
			],
			tests: [
				{ ref: "facet:M3:arch", title: "go-arch-lint", body: "Pas de cycle." },
			],
		},
		{
			facet: "S",
			specs: [
				{
					ref: "facet:S1:allowlist",
					title: "Field allowlist",
					body: "Champs autorisés.",
				},
			],
			tests: [
				{
					ref: "facet:S3:injection",
					title: "Injection eval",
					body: "Semgrep + gosec.",
				},
			],
		},
		{
			facet: "B",
			specs: [
				{ ref: "facet:B1:p99", title: "Budget p99", body: "p99 < 200ms." },
			],
			tests: [{ ref: "facet:B3:k6", title: "k6 load", body: "100 rps." }],
		},
	],
	adrs: [
		{ ref: "adr:0010", title: "Design system", body: "ccup theme." },
		{ ref: "adr:0009", title: "MCP per op", body: "Une op = un outil." },
	],
	testGroups: [
		{
			kind: "N5-infra",
			tests: [
				{
					ref: "test:N5:testcontainers",
					title: "Postgres réel",
					body: "Testcontainers.",
				},
			],
		},
		{
			kind: "N4-unit",
			tests: [
				{
					ref: "test:N4:unit-total",
					title: "Total checkout",
					body: "go test.",
				},
			],
		},
	],
};

/** A PURE-FUNCTION kernel (no OSI section): a scorer cell. */
export const scorerKernel: TechKernel = {
	kernelId: "Scorer",
	networked: false,
	model: { ref: "model:Score", title: "Modèle Score", body: "score(value)." },
	facets: [
		{
			facet: "B",
			specs: [{ ref: "facet:B1:cpu", title: "CPU", body: "O(n)." }],
			tests: [],
		},
	],
	testGroups: [
		{
			kind: "N4-unit",
			tests: [{ ref: "test:N4:score", title: "Score unit", body: "go test." }],
		},
	],
};

export const techSpecScenarios = [
	{ id: "checkout", label: "CheckoutAPI (réseau)", kernel: checkoutKernel },
	{ id: "scorer", label: "Scorer (fonction pure)", kernel: scorerKernel },
] as const;
