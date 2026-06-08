package templates

// catalog.go — the CLOSED, DECLARED curated template catalogue (S81). Each bundle is the authoritative
// source of WHAT a starter app contains (determinism-first: code, never an LLM). Every bundle is built
// to pass Validate ∧ Completeness: closed scalar/blob types, relations whose from/target are entities
// present in the bundle (or the app-auth User entity), and a mirror reflecting EVERY entity, operation
// and behavior token (no truth-without-mirror, no orphan mirror). So Instantiate yields a deterministic
// GREEN, monster-free starting project — the S81 done-criterion.
//
// app-auth is declared as a BEHAVIOR TOKEN ("app-auth"), not re-encoded: Instantiate expands it via
// the ONE S80 appauth.ExpandAppAuth (the single-function law, §24.6). A bundle mirror reflects the
// "app-auth" token so the behavior is covered (app-auth ships its OWN runtime mirrors in S80).

import "github.com/steph-frtech/aidos/back/kernel/appauth"

// ent is a tiny builder for a bundled entity.
func ent(name string, attrs ...Attribute) Entity { return Entity{Name: name, Attributes: attrs} }

// at is a tiny builder for a scalar attribute.
func at(name, typ string, required bool) Attribute {
	return Attribute{Name: name, Type: typ, Required: required}
}

// rel is a tiny builder for a relation node.
func rel(name, from, target, card string) Relation {
	return Relation{Name: name, From: from, Target: target, Cardinality: card}
}

// op / mir / ui builders.
func op(name string) Operation       { return Operation{Name: name} }
func ui(name, route string) UISource { return UISource{Name: name, Route: route} }
func mir(name string, f MirrorForm, reflects string) Mirror {
	return Mirror{Name: name, Form: f, Reflects: reflects}
}

// curated is the closed catalogue (the BundleID is filled by Get, not stored here).
var curated = map[TemplateID]Bundle{
	// ── e-commerce ─────────────────────────────────────────────────────────────────
	Ecommerce: {
		ID:     Ecommerce,
		Labels: map[string]string{"fr": "Boutique e-commerce", "en": "E-commerce storefront"},
		Entities: []Entity{
			ent("Customer",
				at("id", "uuid", true),
				at("email", "string", true),
				at("name", "string", true)),
			ent("Product",
				at("id", "uuid", true),
				at("name", "string", true),
				at("price", "float", true),
				at("image", "blob", false)),
			ent("Order",
				at("id", "uuid", true),
				at("total", "float", true),
				at("status", "string", true)),
		},
		Relations: []Relation{
			rel("order_customer", "Order", "Customer", "many-to-one"),
			rel("order_products", "Order", "Product", "many-to-many"),
		},
		Behaviors: []string{appauth.MacroName},
		Operations: []Operation{
			op("createOrder"), op("checkout"), op("listProducts"),
		},
		Mirrors: []Mirror{
			mir("customer-roundtrips", FormProperty, "Customer"),
			mir("product-roundtrips", FormProperty, "Product"),
			mir("order-roundtrips", FormProperty, "Order"),
			mir("create-order-persists", FormGherkin, "createOrder"),
			mir("checkout-confirms-order", FormFixture, "checkout"),
			mir("list-products-returns", FormGherkin, "listProducts"),
			mir("app-auth-runtime-gate", FormFixture, appauth.MacroName),
		},
		UISources: []UISource{
			ui("storefront", "/store"),
			ui("cart", "/cart"),
			ui("orders", "/orders"),
		},
	},

	// ── CRM ────────────────────────────────────────────────────────────────────────
	CRM: {
		ID:     CRM,
		Labels: map[string]string{"fr": "CRM (contacts & affaires)", "en": "CRM (contacts & deals)"},
		Entities: []Entity{
			ent("Contact",
				at("id", "uuid", true),
				at("email", "string", true),
				at("name", "string", true)),
			ent("Company",
				at("id", "uuid", true),
				at("name", "string", true)),
			ent("Deal",
				at("id", "uuid", true),
				at("amount", "float", true),
				at("stage", "string", true)),
		},
		Relations: []Relation{
			rel("contact_company", "Contact", "Company", "many-to-one"),
			rel("deal_contact", "Deal", "Contact", "many-to-one"),
		},
		Behaviors: []string{appauth.MacroName},
		Operations: []Operation{
			op("createContact"), op("advanceDeal"), op("listDeals"),
		},
		Mirrors: []Mirror{
			mir("contact-roundtrips", FormProperty, "Contact"),
			mir("company-roundtrips", FormProperty, "Company"),
			mir("deal-roundtrips", FormProperty, "Deal"),
			mir("create-contact-persists", FormGherkin, "createContact"),
			mir("advance-deal-moves-stage", FormFixture, "advanceDeal"),
			mir("list-deals-returns", FormGherkin, "listDeals"),
			mir("app-auth-runtime-gate", FormFixture, appauth.MacroName),
		},
		UISources: []UISource{
			ui("contacts", "/contacts"),
			ui("pipeline", "/pipeline"),
		},
	},

	// ── booking ──────────────────────────────────────────────────────────────────
	Booking: {
		ID:     Booking,
		Labels: map[string]string{"fr": "Réservations", "en": "Booking & reservations"},
		Entities: []Entity{
			ent("Resource",
				at("id", "uuid", true),
				at("name", "string", true),
				at("capacity", "int", true)),
			ent("Slot",
				at("id", "uuid", true),
				at("starts_at", "timestamptz", true),
				at("ends_at", "timestamptz", true)),
			ent("Reservation",
				at("id", "uuid", true),
				at("status", "string", true)),
		},
		Relations: []Relation{
			rel("slot_resource", "Slot", "Resource", "many-to-one"),
			rel("reservation_slot", "Reservation", "Slot", "many-to-one"),
		},
		Behaviors: []string{appauth.MacroName},
		Operations: []Operation{
			op("createReservation"), op("cancelReservation"), op("listSlots"),
		},
		Mirrors: []Mirror{
			mir("resource-roundtrips", FormProperty, "Resource"),
			mir("slot-roundtrips", FormProperty, "Slot"),
			mir("reservation-roundtrips", FormProperty, "Reservation"),
			mir("create-reservation-books-slot", FormFixture, "createReservation"),
			mir("cancel-reservation-frees-slot", FormFixture, "cancelReservation"),
			mir("list-slots-returns", FormGherkin, "listSlots"),
			mir("app-auth-runtime-gate", FormFixture, appauth.MacroName),
		},
		UISources: []UISource{
			ui("calendar", "/calendar"),
			ui("reservations", "/reservations"),
		},
	},
}
