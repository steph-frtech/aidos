/**
 * connector-source — the PURE TS twin of back/kernel/connector (DP20, piste DP, EPIC E).
 *
 * DP20 graves Connector / Skill / MCP-server as a content-addressed Kernel SOURCE
 * (above the waterline), promoting the DP19 governance spike and modelled VERBATIM on
 * the agentlayer.AgentSpec discipline: CLOSED sets + a pure-total `validate` + an S02
 * content-address. The authoritative engine is the Go package (kernel/connector); this
 * twin lets the Workbench render the declared connector SOURCES + re-run the validation
 * verdict from the screen, verdict-for-verdict.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): `validate`, `contentId` and `isDatastoreHost`
 * are PURE, TOTAL functions of their input — no I/O, no clock, no rng, no Date.now().
 * The AI-never-direct-to-DB invariant is a DECLARED set-membership over a closed
 * datastore-host set (DATASTORE_HOSTS), NEVER inferred — exactly the Go invariant.
 * Same input ⇒ same verdict (the reproducibility mirror lib/connector-source.test.ts
 * pins it). The id reuses an FNV-1a content hash over the canonical body (egress
 * order-independent, Version excluded), the TS analogue of the S02 records.Hash scheme.
 *
 * THE WALL (CLAUDE.md §2): defining the TYPE + its validation + its content-addressing
 * is CODE — this twin writes NO truth (no kernel/mirrors/fitness). A real Connector
 * INSTANCE is an above-the-line vérité graved only through idée → miroir → /goal →
 * approbation by the aidos CLI writer role (the agent has NO GRANT). The DEMO_CONNECTORS
 * seed is a below-the-line fixture/projection — a pure twin for the screen, never a
 * truth-store write.
 */

/** The closed connector-source kind triad (connector | skill | mcp_server). */
export const KINDS = ["connector", "skill", "mcp_server"] as const;
export type Kind = (typeof KINDS)[number];

/** The closed trust-plane classification set {internal, external, ai, cloud}. */
export const CLASSIFICATIONS = ["internal", "external", "ai", "cloud"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

/** The closed access-scope set {read_only, read_write}. read_write REQUIRES an authority. */
export const ACCESS_SCOPES = ["read_only", "read_write"] as const;
export type AccessScope = (typeof ACCESS_SCOPES)[number];

/** The closed bind-target set (which concrete system the capability resolves to). */
export const TARGETS = [
	"gmail",
	"drive",
	"github_forgejo",
	"postgres_ro",
	"snowflake",
	"erp",
	"crm",
	"sirh",
	"slack",
] as const;
export type Target = (typeof TARGETS)[number];

/** A connector SOURCE is ALWAYS above the waterline (it is a vérité). */
export type Layer = "above" | "below";

/**
 * DATASTORE_HOSTS — the DECLARED closed set of host patterns that name a DATASTORE: a
 * direct database endpoint the AI must never reach (AI-never-direct-to-DB, KRD §44.3 /
 * DP19 A3). DECLARED here, never inferred; the invariant is a pure set-membership over
 * this list (a host is a datastore IFF it contains a declared pattern). Verbatim from the
 * Go `datastoreHosts` (kernel/connector/connector.go) so the legend reads a single source.
 */
export const DATASTORE_HOSTS = [
	"postgres://",
	"postgresql://",
	"mysql://",
	"mongodb://",
	"redis://",
	"snowflake://",
	"jdbc:",
	"truth-store",
	"db.internal",
	"doltgres://",
] as const;

/** The minimal S16 authority graph shape (reused, never forked). */
export interface AuthorityGraph {
	domain: string;
	truthKind: string;
	approvers: string[];
}

/** The minimal S37 data-truth qualifier shape (reused, never forked). */
export type AppliesTo =
	| "new_records"
	| "existing_records"
	| "historical_records";

/** The minimal S15 truth-scope qualifier shape (reused, never forked). */
export interface TruthScope {
	region: string;
	environment: string;
}

/**
 * ConnectorSource — the DP20 declared SOURCE: a content-addressed connector / skill /
 * mcp-server record carrying its closed-set classification, scope, egress allow-list,
 * data-truth qualifier (S37), authority (S16) and bind target. The connector twin of the
 * Go kernel/connector.ConnectorSource — a governed layer, above the waterline, content-
 * addressed. NOTHING here writes truth: a real instance is graved through /goal.
 */
export interface ConnectorSource {
	/** the S02 waterline placement — ALWAYS "above" (a SOURCE is truth). */
	layer: Layer;
	/** connector | skill | mcp_server (closed triad). */
	kind: Kind;
	/** the connector's stable name (non-empty). */
	name: string;
	/** the trust-plane the source bridges (closed set). */
	classification: Classification;
	/** read_only | read_write (closed set). read_write REQUIRES an authority. */
	scope: AccessScope;
	/** the egress allow-list (the hosts the connector may reach). An "ai" source may carry NO datastore host. */
	egressHosts: string[];
	/** the bound concrete system (closed set). */
	target: Target;
	/** the S37 data-truth qualifier (reused). */
	dataTruthScope: AppliesTo[];
	/** the S16 AuthorityGraph (reused) — REQUIRED (well-formed) for a read_write source. */
	authority: AuthorityGraph | null;
	/** the S15 TruthScope (reused) — where/when the source holds (non-empty for an active source). */
	truthScope: TruthScope;
	/** the content-address (== contentId), set at gravure time (S02). Omitted from the hash. */
	version?: string;
}

/** The deterministic refusal codes — the SAME verbatim codes as the Go Validate. */
export type ConnectorValidationCode =
	| "UNKNOWN_CONNECTOR_KIND"
	| "EMPTY_NAME"
	| "UNKNOWN_CONNECTOR_CLASS"
	| "UNKNOWN_CONNECTOR_SCOPE"
	| "UNKNOWN_CONNECTOR_TARGET"
	| "AI_DIRECT_DB_ACCESS_FORBIDDEN"
	| "CONNECTOR_RW_REQUIRES_AUTHORITY"
	| "NOT_ABOVE_THE_LINE"
	| "INVALID_SCOPE";

/** The validation verdict (a COMPUTED conjunction, never an opinion). */
export interface ValidationVerdict {
	ok: boolean;
	/** the first refusal code in fixed order (null when ok). */
	code: ConnectorValidationCode | null;
}

export function isKnownKind(k: string): k is Kind {
	return (KINDS as readonly string[]).includes(k);
}
export function isKnownClassification(c: string): c is Classification {
	return (CLASSIFICATIONS as readonly string[]).includes(c);
}
export function isKnownScope(s: string): s is AccessScope {
	return (ACCESS_SCOPES as readonly string[]).includes(s);
}
export function isKnownTarget(t: string): t is Target {
	return (TARGETS as readonly string[]).includes(t);
}

/**
 * isDatastoreHost reports whether `host` names a datastore — pure set-membership over the
 * DECLARED datastore-host set (a case-insensitive substring match). It is the predicate
 * the AI-never-direct-to-DB invariant keys on; it infers nothing. Verbatim semantics of
 * the Go `IsDatastoreHost`.
 */
export function isDatastoreHost(host: string): boolean {
	const h = host.trim().toLowerCase();
	if (h === "") {
		return false;
	}
	return DATASTORE_HOSTS.some((d) => h.includes(d));
}

/** A read_write source needs a well-formed authority; a read_only one may carry none. */
function authorityWellFormed(a: AuthorityGraph | null): boolean {
	return (
		a !== null &&
		a.domain.trim() !== "" &&
		a.truthKind.trim() !== "" &&
		a.approvers.length > 0
	);
}

/**
 * validate is the PURE, TOTAL shape + wall + invariant guard of a ConnectorSource,
 * mirroring the Go Validate verdict-for-verdict. The order is FIXED so the refusal is
 * deterministic:
 *
 *  1. CLOSED KIND        — kind ∈ {connector, skill, mcp_server} (else UNKNOWN_CONNECTOR_KIND).
 *  2. NAME               — non-empty (else EMPTY_NAME).
 *  3. CLOSED CLASS       — ∈ {internal, external, ai, cloud} (else UNKNOWN_CONNECTOR_CLASS).
 *  4. CLOSED SCOPE       — ∈ {read_only, read_write} (else UNKNOWN_CONNECTOR_SCOPE).
 *  5. CLOSED TARGET      — a declared bind target (else UNKNOWN_CONNECTOR_TARGET).
 *  6. AI-NEVER-DIRECT-DB — an "ai" source with ANY datastore egress is refused
 *                          (AI_DIRECT_DB_ACCESS_FORBIDDEN). Pure set-membership, DECLARED.
 *  7. RW-NEEDS-AUTHORITY — a read_write source must carry a well-formed S16 authority
 *                          (else CONNECTOR_RW_REQUIRES_AUTHORITY). read_only needs none.
 *  8. ABOVE THE LINE     — a ConnectorSource is a SOURCE (layer === "above").
 *  9. S15 SCOPE          — an active source must carry a non-empty scope (else INVALID_SCOPE).
 *
 * Pure: no I/O, no clock. Same input ⇒ same verdict (the property mirror pins it).
 */
export function validate(c: ConnectorSource): ValidationVerdict {
	if (!isKnownKind(c.kind)) {
		return { ok: false, code: "UNKNOWN_CONNECTOR_KIND" };
	}
	if (c.name.trim() === "") {
		return { ok: false, code: "EMPTY_NAME" };
	}
	if (!isKnownClassification(c.classification)) {
		return { ok: false, code: "UNKNOWN_CONNECTOR_CLASS" };
	}
	if (!isKnownScope(c.scope)) {
		return { ok: false, code: "UNKNOWN_CONNECTOR_SCOPE" };
	}
	if (!isKnownTarget(c.target)) {
		return { ok: false, code: "UNKNOWN_CONNECTOR_TARGET" };
	}
	// AI-never-direct-to-DB — the DECLARED, set-membership invariant. An "ai" connector
	// whose egress includes any datastore host is refused (never inferred for non-ai).
	if (c.classification === "ai") {
		for (const h of c.egressHosts) {
			if (isDatastoreHost(h)) {
				return { ok: false, code: "AI_DIRECT_DB_ACCESS_FORBIDDEN" };
			}
		}
	}
	// RW-needs-authority — a read_write connector must declare a well-formed S16 graph.
	if (c.scope === "read_write" && !authorityWellFormed(c.authority)) {
		return { ok: false, code: "CONNECTOR_RW_REQUIRES_AUTHORITY" };
	}
	// A ConnectorSource is a SOURCE/truth — it must be above the waterline.
	if (c.layer !== "above") {
		return { ok: false, code: "NOT_ABOVE_THE_LINE" };
	}
	// The S15 scope must be well-formed — an active source carries a non-empty scope.
	if (
		c.truthScope.region.trim() === "" ||
		c.truthScope.environment.trim() === ""
	) {
		return { ok: false, code: "INVALID_SCOPE" };
	}
	return { ok: true, code: null };
}

/** Pure convenience: true when validate(c).ok. */
export function isValid(c: ConnectorSource): boolean {
	return validate(c).ok;
}

/**
 * canonicalBody renders the content-bearing fields into a deterministic, egress-sorted,
 * key-ordered JSON string. The `version` field is EXCLUDED (it IS the id — a record never
 * hashes its own id, S02). Same source ⇒ same string (egress order-independent).
 */
export function canonicalBody(c: ConnectorSource): string {
	const egress = [...c.egressHosts].sort();
	const authority = c.authority
		? {
				approvers: [...c.authority.approvers].sort(),
				domain: c.authority.domain,
				truthKind: c.authority.truthKind,
			}
		: null;
	const body = {
		authority,
		classification: c.classification,
		dataTruthScope: [...c.dataTruthScope].sort(),
		egressHosts: egress,
		kind: c.kind,
		layer: c.layer,
		name: c.name,
		scope: c.scope,
		target: c.target,
		truthScope: {
			environment: c.truthScope.environment,
			region: c.truthScope.region,
		},
	};
	return JSON.stringify(body);
}

/**
 * contentId returns the content address of a ConnectorSource: a stable FNV-1a hash over
 * the canonical body (the TS analogue of the S02 records.Hash scheme). The same source
 * canonicalises to the SAME id (byte-stable, egress order-independent); ANY change to a
 * content-bearing field yields a DIFFERENT id. Pure, total, deterministic.
 */
export function contentId(c: ConnectorSource): string {
	const body = canonicalBody(c);
	// FNV-1a 32-bit — a tiny, dependency-free, deterministic content hash. The id is a
	// fixed-width hex digest; the SCHEME (not the digest bytes) mirrors the Go S02 hash.
	let h = 0x811c9dc5;
	for (let i = 0; i < body.length; i++) {
		h ^= body.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return `cid_${h.toString(16).padStart(8, "0")}`;
}

/**
 * DEMO_CONNECTORS — the below-the-line SEED/twin (a fixture/projection, NEVER a truth-store
 * write). Three declared connector sources demonstrating the closed sets + the load-bearing
 * AI-never-direct-to-DB invariant:
 *
 *  1. a read_only Postgres-RO (internal) — the only legal AI→DB path runs through a
 *     controlled RO connector; here declared as an internal RO source.
 *  2. a read_write Slack (external) WITH a well-formed S16 authority — a write surface,
 *     so it MUST declare who approves it.
 *  3. an "ai" connector (the agent plane) — note its egress carries NO datastore host
 *     (api.anthropic.com only): the invariant made visible at the source.
 *
 * Each one VALIDATES (validate(c).ok === true). The seed is a pure twin; the screen
 * re-runs validate per row so each verdict shown is COMPUTED, never declared.
 */
export const DEMO_CONNECTORS: ConnectorSource[] = [
	{
		layer: "above",
		kind: "connector",
		name: "postgres-ro-truth",
		classification: "internal",
		scope: "read_only",
		egressHosts: [],
		target: "postgres_ro",
		dataTruthScope: ["existing_records"],
		authority: null,
		truthScope: { region: "fr", environment: "prod" },
	},
	{
		layer: "above",
		kind: "connector",
		name: "slack-notify",
		classification: "external",
		scope: "read_write",
		egressHosts: ["hooks.slack.com", "slack.com"],
		target: "slack",
		dataTruthScope: ["new_records"],
		authority: {
			domain: "connectors",
			truthKind: "behavioral",
			approvers: ["security", "product_owner"],
		},
		truthScope: { region: "fr", environment: "prod" },
	},
	{
		layer: "above",
		kind: "mcp_server",
		name: "ai-agent-plane",
		classification: "ai",
		scope: "read_only",
		// NO datastore host — the AI-never-direct-to-DB invariant made visible at the source.
		egressHosts: ["api.anthropic.com"],
		target: "github_forgejo",
		dataTruthScope: ["new_records"],
		authority: null,
		truthScope: { region: "fr", environment: "prod" },
	},
];

/**
 * AI_FORBIDDEN_DATASTORE_EGRESS — a fixture showing what the invariant REFUSES: the same
 * "ai" plane connector but with a direct datastore egress. validate() returns
 * AI_DIRECT_DB_ACCESS_FORBIDDEN. It is NOT seeded into the rendered list (it would never be
 * a valid source); the screen uses it only to caption the invariant. A pure twin, never a write.
 */
export const AI_FORBIDDEN_DATASTORE_EGRESS: ConnectorSource = {
	layer: "above",
	kind: "mcp_server",
	name: "ai-agent-plane-illegal",
	classification: "ai",
	scope: "read_only",
	egressHosts: ["postgres://truth-store/direct"],
	target: "postgres_ro",
	dataTruthScope: ["existing_records"],
	authority: null,
	truthScope: { region: "fr", environment: "prod" },
};
