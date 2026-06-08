/**
 * templates — the S81 front twin of back/kernel/templates (templates.go + catalog.go). It is the
 * CURATED TEMPLATE CATALOGUE: curated starter apps (e-commerce, CRM, booking) packaged as content-
 * addressed bundles (entities + relations + behaviors incl. app-auth + mirrors + operations + UI
 * sources). It reproduces the Go instantiation deterministically for the Workbench preview, BYTE-
 * IDENTICALLY (same content-addressed starterId / bundleId).
 *
 * It does NOT fork the authoritative Go logic — the Go `Instantiate`/`Get` are the single source of the
 * catalogue; this TS twin reproduces it. The app-auth subsystem reuses the lib/app-auth.ts twin (which
 * itself is the byte-twin of the ONE S80 ExpandAppAuth) — never a second auth expansion.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every function here is PURE — same input → byte-identical
 * output. WHAT a template contains is the DECLARED catalogue, never an LLM. templates.test.ts pins the
 * byte-identity of starterId / bundleId against the Go values.
 */

import { createHash } from "node:crypto";
import {
	MACRO_NAME as APP_AUTH,
	type Subsystem as AuthSubsystem,
	expandAppAuth,
} from "./app-auth";

export type TemplateId = "ecommerce" | "crm" | "booking";
export const CATALOGUE: TemplateId[] = ["ecommerce", "crm", "booking"];

export type MirrorForm = "gherkin" | "property" | "fixture";

export interface Attribute {
	name: string;
	type: string;
	required: boolean;
}
export interface Entity {
	name: string;
	attributes: Attribute[];
}
export interface Relation {
	name: string;
	from: string;
	target: string;
	cardinality: string;
}
export interface Operation {
	name: string;
}
export interface Mirror {
	name: string;
	form: MirrorForm;
	reflects: string;
}
export interface UISource {
	name: string;
	route: string;
}

export interface Bundle {
	id: TemplateId;
	labels: Record<string, string>;
	entities: Entity[];
	relations: Relation[];
	behaviors: string[];
	operations: Operation[];
	mirrors: Mirror[];
	ui_sources: UISource[];
	bundle_id: string;
}

export interface StarterProject {
	template: TemplateId;
	target: string;
	entities: Entity[];
	relations: Relation[];
	operations: Operation[];
	mirrors: Mirror[];
	ui_sources: UISource[];
	auth?: AuthSubsystem;
	starter_id: string;
	wrote_kernel: boolean;
}

// --- tiny builders (mirror catalog.go) ---
const at = (name: string, type: string, required: boolean): Attribute => ({
	name,
	type,
	required,
});
const ent = (name: string, attributes: Attribute[]): Entity => ({
	name,
	attributes,
});
const rel = (
	name: string,
	from: string,
	target: string,
	cardinality: string,
): Relation => ({ name, from, target, cardinality });
const op = (name: string): Operation => ({ name });
const ui = (name: string, route: string): UISource => ({ name, route });
const mir = (name: string, form: MirrorForm, reflects: string): Mirror => ({
	name,
	form,
	reflects,
});

// --- the closed curated catalogue (byte-twin of catalog.go, without bundle_id) ---
type RawBundle = Omit<Bundle, "bundle_id">;

const CURATED: Record<TemplateId, RawBundle> = {
	ecommerce: {
		id: "ecommerce",
		labels: { fr: "Boutique e-commerce", en: "E-commerce storefront" },
		entities: [
			ent("Customer", [
				at("id", "uuid", true),
				at("email", "string", true),
				at("name", "string", true),
			]),
			ent("Product", [
				at("id", "uuid", true),
				at("name", "string", true),
				at("price", "float", true),
				at("image", "blob", false),
			]),
			ent("Order", [
				at("id", "uuid", true),
				at("total", "float", true),
				at("status", "string", true),
			]),
		],
		relations: [
			rel("order_customer", "Order", "Customer", "many-to-one"),
			rel("order_products", "Order", "Product", "many-to-many"),
		],
		behaviors: [APP_AUTH],
		operations: [op("createOrder"), op("checkout"), op("listProducts")],
		mirrors: [
			mir("customer-roundtrips", "property", "Customer"),
			mir("product-roundtrips", "property", "Product"),
			mir("order-roundtrips", "property", "Order"),
			mir("create-order-persists", "gherkin", "createOrder"),
			mir("checkout-confirms-order", "fixture", "checkout"),
			mir("list-products-returns", "gherkin", "listProducts"),
			mir("app-auth-runtime-gate", "fixture", APP_AUTH),
		],
		ui_sources: [
			ui("storefront", "/store"),
			ui("cart", "/cart"),
			ui("orders", "/orders"),
		],
	},
	crm: {
		id: "crm",
		labels: { fr: "CRM (contacts & affaires)", en: "CRM (contacts & deals)" },
		entities: [
			ent("Contact", [
				at("id", "uuid", true),
				at("email", "string", true),
				at("name", "string", true),
			]),
			ent("Company", [at("id", "uuid", true), at("name", "string", true)]),
			ent("Deal", [
				at("id", "uuid", true),
				at("amount", "float", true),
				at("stage", "string", true),
			]),
		],
		relations: [
			rel("contact_company", "Contact", "Company", "many-to-one"),
			rel("deal_contact", "Deal", "Contact", "many-to-one"),
		],
		behaviors: [APP_AUTH],
		operations: [op("createContact"), op("advanceDeal"), op("listDeals")],
		mirrors: [
			mir("contact-roundtrips", "property", "Contact"),
			mir("company-roundtrips", "property", "Company"),
			mir("deal-roundtrips", "property", "Deal"),
			mir("create-contact-persists", "gherkin", "createContact"),
			mir("advance-deal-moves-stage", "fixture", "advanceDeal"),
			mir("list-deals-returns", "gherkin", "listDeals"),
			mir("app-auth-runtime-gate", "fixture", APP_AUTH),
		],
		ui_sources: [ui("contacts", "/contacts"), ui("pipeline", "/pipeline")],
	},
	booking: {
		id: "booking",
		labels: { fr: "Réservations", en: "Booking & reservations" },
		entities: [
			ent("Resource", [
				at("id", "uuid", true),
				at("name", "string", true),
				at("capacity", "int", true),
			]),
			ent("Slot", [
				at("id", "uuid", true),
				at("starts_at", "timestamptz", true),
				at("ends_at", "timestamptz", true),
			]),
			ent("Reservation", [
				at("id", "uuid", true),
				at("status", "string", true),
			]),
		],
		relations: [
			rel("slot_resource", "Slot", "Resource", "many-to-one"),
			rel("reservation_slot", "Reservation", "Slot", "many-to-one"),
		],
		behaviors: [APP_AUTH],
		operations: [
			op("createReservation"),
			op("cancelReservation"),
			op("listSlots"),
		],
		mirrors: [
			mir("resource-roundtrips", "property", "Resource"),
			mir("slot-roundtrips", "property", "Slot"),
			mir("reservation-roundtrips", "property", "Reservation"),
			mir("create-reservation-books-slot", "fixture", "createReservation"),
			mir("cancel-reservation-frees-slot", "fixture", "cancelReservation"),
			mir("list-slots-returns", "gherkin", "listSlots"),
			mir("app-auth-runtime-gate", "fixture", APP_AUTH),
		],
		ui_sources: [
			ui("calendar", "/calendar"),
			ui("reservations", "/reservations"),
		],
	},
};

export function catalogue(): TemplateId[] {
	return [...CATALOGUE];
}

/** get — one curated bundle with its content-addressed bundleId. PURE. Throws on an unknown id. */
export function get(id: TemplateId): Bundle {
	const raw = CURATED[id];
	if (!raw)
		throw new Error(`templates: id is not in the curated catalogue: "${id}"`);
	return { ...raw, bundle_id: bundleId(raw) };
}

/** curated — every curated bundle in catalogue order. PURE. */
export function curated(): Bundle[] {
	return CATALOGUE.map(get);
}

function declaresAppAuth(b: RawBundle): boolean {
	return b.behaviors.includes(APP_AUTH);
}

/**
 * instantiate — the §24.6 / S56 duplicate-from-template: PURE, DRY-RUN. Materialises a bundle's
 * skeleton for a target slug, expanding app-auth via the lib/app-auth twin (byte-identical to the ONE
 * S80 expander). wroteKernel is always false (the wall). Throws on an empty target / unknown id.
 */
export function instantiate(id: TemplateId, target: string): StarterProject {
	if (!target)
		throw new Error("templates: instantiation has no target project slug");
	const b = get(id);
	const sp: StarterProject = {
		template: id,
		target,
		entities: b.entities,
		relations: b.relations,
		operations: b.operations,
		mirrors: b.mirrors,
		ui_sources: b.ui_sources,
		starter_id: "",
		wrote_kernel: false,
	};
	if (declaresAppAuth(b)) sp.auth = expandAppAuth(target);
	sp.starter_id = starterId(sp);
	return sp;
}

/**
 * fork — "fork this app" from a stable phase: PURE, DRY-RUN. Re-instantiates a starter for a new slug
 * from a parent phase; the starterId includes the phase so two forks from different phases differ.
 */
export function fork(
	id: TemplateId,
	target: string,
	parentPhase: string,
): StarterProject {
	const sp = instantiate(id, target);
	sp.starter_id = forkId(sp, parentPhase);
	return sp;
}

/** pieceCount — entities + relations + operations + ui + auth pieces (byte-twin of Go). PURE. */
export function pieceCount(sp: StarterProject): number {
	let n =
		sp.entities.length +
		sp.relations.length +
		sp.operations.length +
		sp.ui_sources.length;
	if (sp.auth)
		n +=
			sp.auth.entities.length +
			sp.auth.operations.length +
			sp.auth.policies.length;
	return n;
}

/** sortedNames — every materialised piece name, stable + sorted (byte-twin of Go SortedNames). PURE. */
export function sortedNames(sp: StarterProject): string[] {
	const out: string[] = [];
	for (const e of sp.entities) out.push(`ent:${e.name}`);
	for (const r of sp.relations) out.push(`rel:${r.name}`);
	for (const o of sp.operations) out.push(`op:${o.name}`);
	for (const m of sp.mirrors) out.push(`mir:${m.name}`);
	for (const u of sp.ui_sources) out.push(`ui:${u.name}`);
	if (sp.auth) {
		for (const e of sp.auth.entities) out.push(`ent:${e.name}`);
		for (const o of sp.auth.operations) out.push(`op:${o.name}`);
		for (const p of sp.auth.policies) out.push(`pol:${p.name}`);
	}
	return out.sort();
}

// --- content addresses (byte-twin of records.Canonicalize/Hash) ---

function bundleId(b: RawBundle): string {
	return addr({
		id: b.id,
		entities: b.entities,
		relations: b.relations,
		behaviors: b.behaviors,
		operations: b.operations,
		mirrors: b.mirrors,
		ui_sources: b.ui_sources,
	});
}

/**
 * authBody re-keys the app-auth Subsystem to the EXACT Go JSON shape (snake_case expansion_id /
 * wrote_kernel) so the canonical encoding of the starter matches the Go marshaller byte-for-byte. The
 * lib/app-auth twin holds the fields as camelCase (expansionId / wroteKernel); here we mirror Go's
 * `json` tags so the content address agrees.
 */
function authBody(a: AuthSubsystem): Record<string, unknown> {
	return {
		macro: a.macro,
		target: a.target,
		entities: a.entities,
		operations: a.operations,
		policies: a.policies,
		expansion_id: a.expansionId,
		wrote_kernel: a.wroteKernel,
	};
}

function starterId(sp: StarterProject): string {
	const body: Record<string, unknown> = {
		template: sp.template,
		target: sp.target,
		entities: sp.entities,
		relations: sp.relations,
		operations: sp.operations,
		mirrors: sp.mirrors,
		ui_sources: sp.ui_sources,
	};
	if (sp.auth) body.auth = authBody(sp.auth);
	return addr(body);
}

function forkId(sp: StarterProject, parentPhase: string): string {
	const body: Record<string, unknown> = {
		fork: "fork",
		parent_phase: parentPhase,
		template: sp.template,
		target: sp.target,
		entities: sp.entities,
		relations: sp.relations,
		operations: sp.operations,
		mirrors: sp.mirrors,
		ui_sources: sp.ui_sources,
	};
	if (sp.auth) body.auth = authBody(sp.auth);
	return addr(body);
}

function addr(body: unknown): string {
	return createHash("sha256")
		.update(Buffer.from(canonicalEncode(body), "utf8"))
		.digest("hex");
}

/** canonicalEncode — sorted keys, ordered arrays, no whitespace — matching records.Canonicalize. */
function canonicalEncode(v: unknown): string {
	if (v === null || v === undefined) return "null";
	if (Array.isArray(v)) return `[${v.map(canonicalEncode).join(",")}]`;
	if (typeof v === "object") {
		const obj = v as Record<string, unknown>;
		return `{${Object.keys(obj)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${canonicalEncode(obj[k])}`)
			.join(",")}}`;
	}
	return JSON.stringify(v);
}
