/**
 * derivedoc — FK06 (ROADMAP-fke, FKE-1.3 décision (a)): the TS twin of the Go pure
 * emitter `DeriveDoc(kernel) → s9` (back/runtime/generators/derivedoc). It derives the
 * LOWER HALF of the doc-mirror — the doc DERIVED from the code — from a kernel's ASTs
 * (operations, controls, actions: their entities, events, policies, bindings, error
 * surfaces) and structures it for FK07's structural set-comparison against s2.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8). deriveDoc is a PURE, TOTAL function: same kernel
 * ⇒ byte-identical canonical JSON (and invariant under input ordering — it canonicalizes,
 * it does not echo). The Go side is authoritative; this twin mirrors it for the Workbench
 * and carries its own reproducibility property (derivedoc.test.ts). No clock, no rng, no
 * map-order leak, no LLM. THE WALL (§2): it reads ASTs and writes nothing — s9 is a
 * projection, never a truth.
 */

export interface DDOperation {
	name: string;
	input?: string;
	/** ordered step kinds with the entity/policy they name (the lexicon source). */
	steps?: DDStep[];
	emits?: string[];
}

export interface DDStep {
	kind: "validate" | "authorize" | "read" | "mutate" | "branch" | "return";
	entity?: string;
	policy?: string;
}

export interface DDControl {
	name: string;
	triggers?: string;
}

export interface DDAction {
	name: string;
	invoke?: string;
	onControl?: string;
}

export interface Kernel {
	kernelId: string;
	operations?: DDOperation[];
	controls?: DDControl[];
	actions?: DDAction[];
}

export interface Behavior {
	id: string;
	description: string;
}

export interface S9 {
	kernel_id: string;
	concepts: string[];
	behaviors: Behavior[];
	errors: string[];
}

export interface Derived {
	s9: S9;
	/** canonical JSON bytes (key-sorted) — the byte-identity surface (FK06 done-criterion). */
	bytes: string;
}

/** sortedSet returns a sorted, de-duplicated copy (the canonicalizing primitive). */
function sortedSet(xs: Iterable<string>): string[] {
	return [...new Set(xs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** canonicalize re-emits a value as JSON with object keys sorted recursively (matches
 *  back/kernel/records.Canonicalize) so the bytes are stable under key order. */
// biome-ignore lint/suspicious/noExplicitAny: structural canonical JSON walk.
function canonicalize(v: any): string {
	if (v === null || typeof v !== "object") return JSON.stringify(v);
	if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
	const keys = Object.keys(v).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(v[k])}`).join(",")}}`;
}

/**
 * deriveDoc projects a kernel into its s9 (FK06 twin). PURE + TOTAL + deterministic.
 */
export function deriveDoc(k: Kernel): Derived {
	const concepts = new Set<string>();
	const errors = new Set<string>();
	// per-ID description; a name collision keeps the lexicographically SMALLEST description
	// (an order-independent rule — never "first/last write wins", which would leak order).
	const descById = new Map<string, string>();
	const addBehavior = (id: string, desc: string) => {
		const prev = descById.get(id);
		if (prev === undefined || desc < prev) descById.set(id, desc);
	};

	for (const op of k.operations ?? []) {
		if (!op.name) continue;
		concepts.add(`operation:${op.name}`);
		addBehavior(
			`operation:${op.name}`,
			`L'opération "${op.name}" transforme "${op.input ?? ""}".`,
		);
		for (const st of op.steps ?? []) {
			if (st.kind === "authorize") {
				errors.add(`operation:${op.name}:ErrAuthorizationDenied`);
				if (st.policy) concepts.add(`policy:${st.policy}`);
			} else if ((st.kind === "read" || st.kind === "mutate") && st.entity) {
				concepts.add(`entity:${st.entity}`);
			}
		}
		for (const ev of op.emits ?? []) {
			if (!ev) continue;
			concepts.add(`event:${ev}`);
			addBehavior(
				`emit:${op.name}:${ev}`,
				`L'opération "${op.name}" émet l'événement "${ev}".`,
			);
		}
	}

	// Index actions by name, resolving a name collision deterministically by invoke.
	const actByName = new Map<string, DDAction>();
	for (const a of k.actions ?? []) {
		if (!a.name) continue;
		concepts.add(`action:${a.name}`);
		if (a.invoke) concepts.add(`operation:${a.invoke}`);
		const prev = actByName.get(a.name);
		if (
			!prev ||
			(a.invoke ?? "") < (prev.invoke ?? "") ||
			((a.invoke ?? "") === (prev.invoke ?? "") &&
				(a.onControl ?? "") < (prev.onControl ?? ""))
		) {
			actByName.set(a.name, a);
		}
	}

	for (const c of k.controls ?? []) {
		if (!c.name) continue;
		concepts.add(`control:${c.name}`);
		errors.add(`control:${c.name}:ErrOrphanTrigger`);
		if (!c.triggers) continue;
		const act = actByName.get(c.triggers);
		if (!act) {
			addBehavior(
				`binding:${c.name}->${c.triggers}`,
				`Le contrôle "${c.name}" déclenche l'action "${c.triggers}".`,
			);
			continue;
		}
		let id = `binding:${c.name}->${act.name}`;
		let desc = `Le contrôle "${c.name}" déclenche l'action "${act.name}"`;
		if (act.invoke) {
			id += `->${act.invoke}`;
			desc += ` qui invoque l'opération "${act.invoke}"`;
		}
		addBehavior(id, `${desc}.`);
	}

	const behaviors: Behavior[] = [...descById.keys()]
		.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
		.map((id) => ({ id, description: descById.get(id) as string }));

	const s9: S9 = {
		kernel_id: k.kernelId,
		concepts: sortedSet(concepts),
		behaviors,
		errors: sortedSet(errors),
	};
	return { s9, bytes: canonicalize(s9) };
}
