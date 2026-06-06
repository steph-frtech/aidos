// context-compressor.ts — the DETERMINISTIC TS twin of the HR02 ContextCompressor port
// (back/runtime/context/compressor.go, ADR 0035). The Workbench /context-compression panel runs
// THIS pure function FROM THE SCREEN — the same reference-replacement the Go port runs: no I/O,
// no clock, no rng, no LLM. The compacted text on screen matches the engine.
//
// THE WALL (CLAUDE.md §2): pure, below the line. It reads the prompt it is handed and returns a
// compacted text + a reversible handle; it writes NO truth. DETERMINISM-FIRST: same input → same
// compacted + same handle (proven by context-compressor.test.ts, fast-check).

export interface Compacted {
	text: string;
}

// Handle is the reversible CCR state: the compacted text it expands + the dictionary mapping
// each handle token ("§N") to the original span it replaced. Self-sufficient: retrieve needs
// only the handle.
export interface Handle {
	text: string;
	dictionary: Record<string, string>;
}

const MIN_REF_LEN = 6;
const MIN_OCCUR = 2;
const MAX_PHRASE = 8;

// normalize collapses runs of whitespace to single spaces — the canonical form the round-trip
// compares against (the twin works on whitespace-delimited tokens).
export function normalize(s: string): string {
	return s
		.split(/\s+/)
		.filter((t) => t.length > 0)
		.join(" ");
}

function spanHasHandle(span: string[]): boolean {
	return span.some((t) => t.startsWith("§"));
}

interface CollapseResult {
	tokens: string[];
	idx: number;
}

function collapseSpans(
	tokens: string[],
	l: number,
	dict: Record<string, string>,
	idx: number,
): CollapseResult {
	if (l < 1 || tokens.length < l) return { tokens, idx };

	const count: Record<string, number> = {};
	for (let i = 0; i + l <= tokens.length; i++) {
		const window = tokens.slice(i, i + l);
		if (spanHasHandle(window)) continue;
		const span = window.join(" ");
		if (span.length >= MIN_REF_LEN) count[span] = (count[span] ?? 0) + 1;
	}

	const cands: { span: string; savings: number }[] = [];
	for (const [span, n] of Object.entries(count)) {
		if (n < MIN_OCCUR) continue;
		const savings = (n - 1) * (span.length - 3);
		if (savings > 0) cands.push({ span, savings });
	}
	cands.sort((a, b) =>
		a.savings !== b.savings
			? b.savings - a.savings
			: a.span < b.span
				? -1
				: a.span > b.span
					? 1
					: 0,
	);

	const handleOf: Record<string, string> = {};
	for (const c of cands) {
		const h = `§${idx}`;
		idx++;
		handleOf[c.span] = h;
		dict[h] = c.span;
	}
	if (Object.keys(handleOf).length === 0) return { tokens, idx };

	const seen: Record<string, boolean> = {};
	const out: string[] = [];
	let i = 0;
	while (i < tokens.length) {
		if (i + l <= tokens.length && !spanHasHandle(tokens.slice(i, i + l))) {
			const span = tokens.slice(i, i + l).join(" ");
			const h = handleOf[span];
			if (h !== undefined) {
				if (seen[span]) {
					out.push(h);
				} else {
					seen[span] = true;
					out.push(...tokens.slice(i, i + l));
				}
				i += l;
				continue;
			}
		}
		out.push(tokens[i]);
		i++;
	}
	return { tokens: out, idx };
}

// compress models headroom's reference-replacement: collapse repeated word-spans (length
// MAX_PHRASE..1, longest-first) to short handles, recording each in the dictionary so retrieve
// is exactly inverse. Deterministic: stable handle order → same prompt yields same output.
export function compress(prompt: string): {
	compacted: Compacted;
	handle: Handle;
} {
	let tokens = normalize(prompt)
		.split(" ")
		.filter((t) => t.length > 0);
	const dict: Record<string, string> = {};
	let idx = 0;
	for (let l = MAX_PHRASE; l >= 1; l--) {
		const r = collapseSpans(tokens, l, dict, idx);
		tokens = r.tokens;
		idx = r.idx;
	}
	const text = tokens.join(" ");
	return { compacted: { text }, handle: { text, dictionary: dict } };
}

// retrieve re-expands every handle token back to its original span (CCR). Total and deterministic:
// retrieve(compress(x).handle) === normalize(x).
export function retrieve(handle: Handle): string {
	const fields = handle.text.split(/\s+/).filter((t) => t.length > 0);
	const out: string[] = [];
	for (const f of fields) {
		const orig = handle.dictionary[f];
		if (orig !== undefined) {
			out.push(...orig.split(" "));
		} else {
			out.push(f);
		}
	}
	return out.join(" ");
}

// reduction reports the byte reduction ratio of a compress — the margin gained UNDER the budget
// cap (the cap is never relieved). 0 when the original is empty.
export function reduction(original: string, compacted: Compacted): number {
	const o = normalize(original).length;
	if (o === 0) return 0;
	return (o - compacted.text.length) / o;
}

// ── HR03: the GATE-INVARIANCE twin (deriveAction + gate) ──────────────────────────────────────
//
// The HR03 theorem (back/runtime/headroom): the agentimpl.GateAction verdict is INVARIANT to
// compression — same structure of action, same verdict. The Workbench proves it FROM THE SCREEN
// with this deterministic twin: deriveAction extracts the structural action from the prompt's
// carrier facts, gate decides over the SAME axes the Go gate does (in the SAME precedence), and
// gateInvariant compares the verdict on the original prompt with the verdict after
// retrieve∘compress. Because the carrier facts survive (HR02), the verdict is unchanged.
//
// This twin mirrors ONLY the prompt-derivable axes (zone → path → capacity → skill) in the Go
// precedence — those are the axes whose inputs come from the compressed prompt; the budget/hook/
// egress/exec axes read non-prompt state and are out of scope for a compression-invariance proof.

// DerivedAction is the structural action recovered from a prompt's carrier facts.
export interface DerivedAction {
	target: string;
	server: string;
	tool: string;
	skill: string;
}

const MARKERS = {
	allowedPaths: "allowed_paths:",
	tool: "tool:",
	skill: "skill:",
} as const;

// deriveAction parses the carrier markers out of the prompt — WHITESPACE-ROBUST (token stream,
// not line-wise), so it reads the same markers from the original prompt and from its normalized
// retrieve∘compress form. The Go twin's exact logic.
export function deriveAction(prompt: string): DerivedAction {
	const toks = normalize(prompt)
		.split(" ")
		.filter((t) => t.length > 0);
	const d: DerivedAction = { target: "", server: "", tool: "", skill: "" };
	const at = (i: number): string => (toks[i + 1] ?? "").replace(/,+$/, "");
	for (let i = 0; i < toks.length; i++) {
		const tok = toks[i];
		if (tok === MARKERS.allowedPaths && d.target === "") {
			d.target = at(i);
		} else if (tok === MARKERS.tool && d.server === "" && d.tool === "") {
			const v = at(i);
			const j = v.indexOf("/");
			if (j >= 0) {
				d.server = v.slice(0, j);
				d.tool = v.slice(j + 1);
			} else {
				d.tool = v;
			}
		} else if (tok === MARKERS.skill && d.skill === "") {
			d.skill = at(i);
		}
	}
	return d;
}

// GateVerdict is the verdict twin: allowed + (on a deny) the failing axis and its BlockReason code.
export interface GateVerdict {
	allowed: boolean;
	deniedAxis: string;
	blockReason: string;
}

// The permissive governed implementation, matching the Go gate fixture: grants app/, binds
// store/read + tdd, the wall is the forbidden truth zones.
const GRANTED_ROOT = "app/";
const BOUND_TOOL = { server: "store", tool: "read" };
const BOUND_SKILL = "tdd";
const WALL = ["/kernel/", "/mirror/", "/fitness/"];

// gate decides over the prompt-derivable axes in the Go precedence (zone → path → capacity →
// skill). Pure and total. An axis with no input is skipped.
export function gate(d: DerivedAction): GateVerdict {
	// 2. ZONE — a write above the waterline is refused first (the wall).
	if (d.target !== "" && WALL.some((z) => d.target.startsWith(z))) {
		return {
			allowed: false,
			deniedAxis: "zone",
			blockReason: "AGENT_WRITE_ABOVE_WATERLINE",
		};
	}
	// 3. PATH — confinement allow-list (default-deny against the granted root).
	if (d.target !== "" && !d.target.startsWith(GRANTED_ROOT)) {
		return {
			allowed: false,
			deniedAxis: "path",
			blockReason: "AGENT_PATH_NOT_ALLOWED",
		};
	}
	// 6. CAPACITY — the bound MCP (server, tool).
	if (
		(d.server !== "" || d.tool !== "") &&
		!(d.server === BOUND_TOOL.server && d.tool === BOUND_TOOL.tool)
	) {
		return {
			allowed: false,
			deniedAxis: "capacity",
			blockReason: "AGENT_TOOL_NOT_BOUND",
		};
	}
	// 7. SKILL — the bound skill.
	if (d.skill !== "" && d.skill !== BOUND_SKILL) {
		return {
			allowed: false,
			deniedAxis: "skill",
			blockReason: "AGENT_SKILL_NOT_BOUND",
		};
	}
	return { allowed: true, deniedAxis: "", blockReason: "" };
}

export function sameVerdict(a: GateVerdict, b: GateVerdict): boolean {
	return (
		a.allowed === b.allowed &&
		a.deniedAxis === b.deniedAxis &&
		a.blockReason === b.blockReason
	);
}

// gateInvariant — the HR03 theorem FROM THE SCREEN: the gate verdict on a prompt equals the gate
// verdict after retrieve∘compress. Returns both verdicts and whether they match.
export function gateInvariant(prompt: string): {
	original: GateVerdict;
	compressed: GateVerdict;
	invariant: boolean;
} {
	const original = gate(deriveAction(prompt));
	const { handle } = compress(prompt);
	const restored = retrieve(handle);
	const compressed = gate(deriveAction(restored));
	return { original, compressed, invariant: sameVerdict(original, compressed) };
}

// ── HR04: the LOOP-ECONOMY twin (compressor wired in front of GenerateAction) ───────────────────
//
// The HR04 done-criterion (back/runtime/agentloop): an AgentRun replayed WITH and WITHOUT
// compression gives the SAME verdict of actions, the tokens measured DROP, CheckBudget stays
// coherent, and the cap is NEVER raised. The Workbench proves it FROM THE SCREEN with this
// deterministic twin: measureTokens is the pure token measurer (whitespace token count, NOT an
// LLM tokenizer — determinism-first), and replayEconomy replays a turn sequence twice (plain vs
// compressed) and reports the verdicts, the token meters, and the (unchanged) cap.

// measureTokens — the PURE token measurer the loop charges to the meter: the count of
// whitespace-delimited tokens. Same input → same count; monotone under compression
// (measureTokens(compress(p)) ≤ measureTokens(p)). The exact Go MeasureTokens twin.
export function measureTokens(s: string): number {
	return normalize(s).length === 0 ? 0 : normalize(s).split(" ").length;
}

// ReplayEconomy is the HR04 comparison the panel renders: the per-turn verdicts (identical with
// and without compression — the gate is invariant), the two token meters (compressed strictly
// lower on a repetition-prone prompt), the declared cap (byte-identical both ways — never
// raised), and whether the compressed run fits under it.
export interface ReplayEconomy {
	verdicts: GateVerdict[];
	verdictsSame: boolean;
	tokensPlain: number;
	tokensCompressed: number;
	tokensSaved: number;
	cap: number;
	plainWithinCap: boolean;
	compressedWithinCap: boolean;
	capRaised: boolean;
}

// replayEconomy replays a turn sequence (one prompt per turn) twice — plain and compressed —
// over the SAME declared token cap. The verdicts come from the SAME gate(deriveAction(prompt))
// the HR03 twin proves invariant, so they match; the meters are the summed measureTokens, the
// compressed one taken on compress(prompt). The cap is the input, unchanged both ways: capRaised
// is ALWAYS false (the proof that compression extends the margin, never relieves the cap).
export function replayEconomy(prompts: string[], cap: number): ReplayEconomy {
	const verdicts = prompts.map((p) => gate(deriveAction(p)));
	const verdictsSame = prompts.every((p) => gateInvariant(p).invariant);
	let tokensPlain = 0;
	let tokensCompressed = 0;
	for (const p of prompts) {
		tokensPlain += measureTokens(p);
		tokensCompressed += measureTokens(compress(p).compacted.text);
	}
	return {
		verdicts,
		verdictsSame,
		tokensPlain,
		tokensCompressed,
		tokensSaved: tokensPlain - tokensCompressed,
		cap,
		plainWithinCap: tokensPlain <= cap,
		compressedWithinCap: tokensCompressed <= cap,
		// The cap is the SAME value both runs are checked against — compression never raises it.
		capRaised: false,
	};
}

// ── HR05: the PER-RUN economy projection (the /agents « Compression / économie » section) ────────
//
// The HR05 done-criterion: the /agents panel renders the economy PER RUN — tokens before/after for
// each recorded AgentRun. perRunEconomy is the pure projection that section runs FROM THE SCREEN:
// one replayEconomy per run (each run's own prompt sequence + its own declared cap), plus the
// aggregate meters across all runs. Deterministic (same runs ⇒ same report); the cap is never
// raised on any run (each row carries capRaised:false from replayEconomy). NO I/O, NO LLM — a
// pure transform over the runs it is handed (the wall: read-only, below the line).

// RunPrompts is one recorded AgentRun's LLM-input sequence: an id (the run label the panel shows),
// the per-turn prompts, and the run's declared token cap (the budget the run was checked against).
export interface RunPrompts {
	id: string;
	prompts: string[];
	cap: number;
}

// RunEconomy is one row of the section: the run id + its ReplayEconomy (tokens before/after).
export interface RunEconomy {
	id: string;
	economy: ReplayEconomy;
}

// PerRunEconomy is the whole section: one row per run + the aggregate meters and a single
// allVerdictsSame flag (true iff every run's verdicts are invariant to compression).
export interface PerRunEconomy {
	rows: RunEconomy[];
	totalPlain: number;
	totalCompressed: number;
	totalSaved: number;
	allVerdictsSame: boolean;
}

// perRunEconomy maps each run to its replayEconomy (in input order) and sums the meters. A pure
// projection: it adds NO new compression logic, it only fans replayEconomy out over the runs.
export function perRunEconomy(runs: RunPrompts[]): PerRunEconomy {
	const rows: RunEconomy[] = runs.map((r) => ({
		id: r.id,
		economy: replayEconomy(r.prompts, r.cap),
	}));
	let totalPlain = 0;
	let totalCompressed = 0;
	let allVerdictsSame = true;
	for (const row of rows) {
		totalPlain += row.economy.tokensPlain;
		totalCompressed += row.economy.tokensCompressed;
		if (!row.economy.verdictsSame) allVerdictsSame = false;
	}
	return {
		rows,
		totalPlain,
		totalCompressed,
		totalSaved: totalPlain - totalCompressed,
		allVerdictsSame,
	};
}
