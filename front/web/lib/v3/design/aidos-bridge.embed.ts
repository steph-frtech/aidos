/**
 * aidos-bridge — the Design Lab iframe↔lens runtime (ADR 0071, Onlook INVERSÉ).
 *
 * Embedded VERBATIM into the three emitted children (web/mobile/desktop) — the exact
 * calque of aidos-expr.embed.ts (the Expr twin injected by webemit_render.go). The
 * SINGLE source lives at front/web/lib/v3/design/aidos-bridge.embed.ts and is mirrored
 * byte-equal by the Go embed (honoemit.AidosBridgeSource).
 *
 * THE INVERSION OF ONLOOK (the wall §2): the bridge READS the data-aidos-* attributes
 * the emitters ALREADY stamp — it NEVER injects data-oid, NEVER rewrites the source, and
 * NEVER computes a source edit. A design gesture becomes a ScreenDesign requirement
 * (content-addressed, below the line); the COMPILER reproduces the screen. The preview
 * the bridge applies is OPTIMISTIC and purely VISUAL (a token-class mutation), never a
 * write — the truth is the content-addressed requirement, the bytes are the emitter's.
 *
 * DETERMINISM (§6/§8): the coordinate of every element is read from its data-aidos-*
 * attribute and NORMALISED ({view,screen,panel}→section, {col,field}→field, invoke→action)
 * — the SAME closed normalisation as bridge-protocol.ts. Everything is async + wrapped in
 * withTryCatch (a throw yields null, never a crash — the Onlook tolerance), and the DOM
 * re-scan is debounced 500ms (the eventually-coherent tree).
 */

/** The closed coordinate kind set (mirrors CoordKind in screendesign.go). */
type CoordKind = "section" | "field" | "action";

/** A normalised screen coordinate (mirrors ScreenCoord in screendesign.go). */
interface ScreenCoord {
	kind: CoordKind;
	entity: string;
	field?: string;
	control?: string;
}

/** An ADR-0010 style token (mirrors StyleToken — the closed catalogue lives in the lens). */
interface StyleToken {
	property: string;
	token: string;
}

/** The data-aidos-* attribute → normalised CoordKind drift table (the single reconciliation point). */
const ATTR_TO_KIND: Record<string, CoordKind> = {
	"data-aidos-view": "section",
	"data-aidos-screen": "section",
	"data-aidos-panel": "section",
	"data-aidos-col": "field",
	"data-aidos-field": "field",
	"data-aidos-invoke": "action",
};

const SELECTOR =
	"[data-aidos-view],[data-aidos-screen],[data-aidos-panel],[data-aidos-col],[data-aidos-field],[data-aidos-invoke]";

/** withTryCatch — the Onlook tolerance: a throw yields null, never a crash. */
function withTryCatch<T>(fn: () => T): T | null {
	try {
		return fn();
	} catch {
		return null;
	}
}

/** Resolve the nearest section entity an element belongs to (its enclosing data-aidos-view/screen/panel). */
function enclosingEntity(el: Element): string {
	const section = el.closest("[data-aidos-view],[data-aidos-screen],[data-aidos-panel]");
	if (!section) return "";
	return (
		section.getAttribute("data-aidos-view") ??
		section.getAttribute("data-aidos-screen") ??
		section.getAttribute("data-aidos-panel") ??
		""
	);
}

/** Build the NORMALISED coordinate of one instrumented element (the read-side normalisation). */
function coordOf(el: Element): ScreenCoord | null {
	return withTryCatch(() => {
		for (const attr of Object.keys(ATTR_TO_KIND)) {
			const v = el.getAttribute(attr);
			if (v === null) continue;
			const kind = ATTR_TO_KIND[attr];
			if (kind === "section") return { kind, entity: v };
			if (kind === "field") return { kind, entity: enclosingEntity(el), field: v };
			// action: the invoke value is the operation; the control is the displayed text (best-effort).
			return { kind: "action", entity: "", control: (el.textContent ?? "").trim() };
		}
		return null;
	});
}

/** Scan the DOM and build the coordinate of every instrumented element. */
function scanCoords(): ScreenCoord[] {
	const out: ScreenCoord[] = [];
	const els = document.querySelectorAll(SELECTOR);
	els.forEach((el) => {
		const c = coordOf(el);
		if (c) out.push(c);
	});
	return out;
}

/** Find the FIRST element whose normalised coordinate equals coord (the deterministic match). */
function elementOf(coord: ScreenCoord): Element | null {
	const els = document.querySelectorAll(SELECTOR);
	for (const el of Array.from(els)) {
		const c = coordOf(el);
		if (!c) continue;
		if (c.kind === coord.kind && c.entity === coord.entity && (c.field ?? "") === (coord.field ?? "")) {
			return el;
		}
	}
	return null;
}

/** Map an ADR-0010 token to its Tailwind class (the SAME property→prefix mapping as StyleToken.className). */
const PROPERTY_PREFIX: Record<string, string> = {
	bg: "bg-",
	text: "text-",
	border: "border-",
	radius: "rounded-",
	pad: "p-",
	gap: "gap-",
	align: "text-",
};

function classOf(t: StyleToken): string {
	const prefix = PROPERTY_PREFIX[t.property];
	return prefix ? prefix + t.token : "";
}

/** Apply an OPTIMISTIC preview (token-class mutation) to an element — purely visual, never the source. */
function applyPreview(coord: ScreenCoord, styles: StyleToken[]): void {
	withTryCatch(() => {
		const el = elementOf(coord);
		if (!el) return null;
		for (const s of styles) {
			const c = classOf(s);
			if (c) el.classList.add(c);
		}
		return null;
	});
}

/** Clear a preview (remove the token classes the preview added). Best-effort, tolerant. */
function clearPreview(coord: ScreenCoord, styles: StyleToken[]): void {
	withTryCatch(() => {
		const el = elementOf(coord);
		if (!el) return null;
		for (const s of styles) {
			const c = classOf(s);
			if (c) el.classList.remove(c);
		}
		return null;
	});
}

/** The handshake + message loop. master_hash/target are read from the document (data-aidos-master). */
function boot(): void {
	const masterHash = document.documentElement.getAttribute("data-aidos-master") ?? "";
	const target = document.documentElement.getAttribute("data-aidos-target") ?? "";

	const post = (msg: unknown) => withTryCatch(() => window.parent.postMessage(msg, "*"));

	// 1. handshake (= Onlook onDomProcessed) — the parent learns the master + every coordinate.
	post({ type: "aidos-bridge:ready", master_hash: masterHash, target, coords: scanCoords() });

	// 2. listen for parent commands (select/hover/preview-edit/clear-preview) — purely visual.
	window.addEventListener("message", (ev: MessageEvent) => {
		withTryCatch(() => {
			const data = ev.data as { type?: string; coord?: ScreenCoord; styles?: StyleToken[] } | null;
			if (!data || typeof data.type !== "string") return null;
			if (data.type === "preview-edit" && data.coord && data.styles) applyPreview(data.coord, data.styles);
			if (data.type === "clear-preview" && data.coord) clearPreview(data.coord, data.styles ?? []);
			return null;
		});
	});

	// 3. a click on an instrumented element reports the selected coordinate (= Onlook selection).
	document.addEventListener("click", (ev: MouseEvent) => {
		withTryCatch(() => {
			const target = ev.target as Element | null;
			if (!target) return null;
			const el = target.closest(SELECTOR);
			if (!el) return null;
			const coord = coordOf(el);
			if (coord) post({ type: "selected", coord, computed: {} });
			return null;
		});
	});

	// 4. a debounced MutationObserver re-syncs the coordinate tree (= Onlook onWindowMutated, 500ms).
	let timer: ReturnType<typeof setTimeout> | null = null;
	const observer = new MutationObserver(() => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => post({ type: "mutated", coords: scanCoords() }), 500);
	});
	withTryCatch(() => {
		observer.observe(document.body, { childList: true, subtree: true });
		return null;
	});
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", boot);
	} else {
		boot();
	}
}

export {};
