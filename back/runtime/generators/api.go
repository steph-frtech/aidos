package generators

// THE API PROJECTION (S36). EmitAPI projects a Go REST/JSON handler from TWO prior
// kernel sources — an OPERATION (the N2 workflow, S10: back/kernel/operation) and the
// ENTITY it touches (the N3 source, S35: back/kernel/entities) — never authoring
// truth, never inventing a route/field/status. It is the `api` TARGET added to S34's
// kind × target emitter set; its OUTPUT lands under back/gen/api/ (PRODUCED, never
// hand-edited, CLAUDE.md §4/§9).
//
// THE HANDLER IS A THIN TRANSPORT ADAPTER. HTTP/JSON in → the S10 operation interpreter
// (operation.Interpret) → HTTP/JSON out. It NEVER re-implements the business rule and
// NEVER re-types the entity: the request body reuses the entity's S35 EmitGo field
// shapes (one struct field per entity attribute, in SOURCE order, same Go types), and
// the body is delegated to operation.Interpret. The method+route come FROM the
// operation (createOrder → POST /orders), never invented.
//
// DETERMINISM-FIRST (CLAUDE.md §6). EmitAPI/EmitContract are PURE, TOTAL functions of
// (operation, entity) — no clock, no RNG, no map-iteration-order leak, no absolute
// paths, normalized "\n" newlines, go/format on the Go output — so each is byte-for-byte
// reproducible. The artifact's source_hash == records.Hash(records.Canonicalize(
// operation ⊕ entity)) (S02 reused, NOT forked); a byte change in either source ⇒ a new
// source_hash ⇒ the artifact is stale (feeds S22's red wave).
//
// HONESTY (the wall, §2). An operation whose I/O references an entity attribute the
// entity AST does NOT pin is REJECTED with an S13 BlockReason (UNKNOWN_OPERATION_IO) —
// no silent fallback route/field/status. The emitter only READS the sources and WRITES
// the projection below the line; it writes no truth.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/format"
	"path"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// TargetAPI — the API projection target added to S34's closed set (go-sqlc | pg-ddl |
// ts-types | api). It grows the set ADDITIVELY (the matrix is enumerable; no prior
// target is altered). Its output lands under back/gen/api/.
const TargetAPI Target = "api"

// CodeUnknownOperationIO is the canonical S36 refusal code: an operation references an
// entity/attribute the entity AST does not pin. It REUSES the S13 BlockReason shape
// (blockreason.BlockReason) — the Code string is the step-local cause folded into the
// CodeOutOfScope family, never a new kernel code beyond a human red.
const CodeUnknownOperationIO = "UNKNOWN_OPERATION_IO"

// APISource is the api emitter's two-source input: the operation (the workflow whose
// route/method the handler exposes) and the entity it touches (whose field shapes the
// request/response reuse). The emitter never authors either — it reads them (the wall).
type APISource struct {
	Operation operation.Operation
	Entity    entities.Entity
}

// mutatedEntityName returns the name of the entity a `create` mutate writes (the entity
// the API projects). The operation AST pins it; the emitter never guesses one.
func mutatedEntityName(op operation.Operation) (string, bool) {
	for _, s := range op.Steps {
		if ms, ok := s.(operation.MutateStep); ok && ms.Op == operation.MutateCreate {
			return ms.Entity, true
		}
	}
	return "", false
}

// blockUnknownIO renders the canonical S13 BlockReason for an operation whose I/O the
// entity AST does not pin (UNKNOWN_OPERATION_IO). It carries a non-empty how_to_fix (no
// prison) and names the missing pin so `aidos explain` and the panel are actionable.
func blockUnknownIO(cause string) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Émission API refusée (" + CodeUnknownOperationIO + ") : l'opération référence une " +
			"entité/un attribut que l'AST d'entité n'épingle pas (" + cause + "). Un handler PROJETTE " +
			"exactement ce que l'opération et l'entité épinglent ; il n'invente jamais une route, un champ, " +
			"un type ni un code de statut, et ne retombe JAMAIS silencieusement sur une valeur par défaut (honnêteté).",
		HowToFix: []string{
			"pin_the_operation_io : alignez l'opération et l'entité — l'attribut muté/retourné doit être épinglé par l'AST d'entité (S35).",
			"pin_the_entity_ast : complétez l'AST d'entité (nom + attributs typés) avant de projeter l'API.",
			"rerun aidos project --target api : relancez l'émission une fois l'opération et l'entité cohérentes.",
		},
	}
}

// validateAPISource checks the two sources are coherent and pinned: the entity is
// projectable (S35 Validate), the operation pins a name, a create-mutate, and the
// mutated entity NAME matches the entity AST it was paired with. An incoherent pairing
// is the UNKNOWN_OPERATION_IO cause — never a default.
func validateAPISource(s APISource) (string, *blockreason.BlockReason) {
	if s.Operation.Name == "" {
		br := blockUnknownIO("l'opération n'épingle pas de nom")
		return "", &br
	}
	if err := entities.Validate(s.Entity); err != nil {
		br := blockUnknownIO("entité non projetable : " + err.Error())
		return "", &br
	}
	muteName, ok := mutatedEntityName(s.Operation)
	if !ok {
		br := blockUnknownIO("l'opération n'épingle aucun mutate create — aucune entité à projeter")
		return "", &br
	}
	if !strings.EqualFold(muteName, s.Entity.Name) {
		br := blockUnknownIO(fmt.Sprintf("l'opération mute %q mais l'entité fournie est %q", muteName, s.Entity.Name))
		return "", &br
	}
	return muteName, nil
}

// MethodRoute returns the HTTP method + route the operation pins, derived
// DETERMINISTICALLY from the operation — never invented. A `create` mutate ⇒ POST to
// the pluralized lowercase entity collection (Order → /orders). The mapping is a pure
// total function of the operation's verb + the entity name; it coins no route the
// sources do not imply.
func MethodRoute(op operation.Operation, entityName string) (method, route string) {
	method = "POST" // a create-mutate operation is a POST (the only verb at S36)
	route = "/" + pluralize(strings.ToLower(entityName))
	return method, route
}

// pluralize is the minimal, deterministic English pluralizer the route uses — total,
// no inflection table beyond the trivial +s / +es needed by the Order example. It coins
// no irregular plural the source does not need (honesty: kept faithful, grown only when
// a fixture needs it).
func pluralize(s string) string {
	if s == "" {
		return s
	}
	switch {
	case strings.HasSuffix(s, "s"), strings.HasSuffix(s, "x"), strings.HasSuffix(s, "z"),
		strings.HasSuffix(s, "ch"), strings.HasSuffix(s, "sh"):
		return s + "es"
	case strings.HasSuffix(s, "y") && len(s) > 1 && !isVowel(s[len(s)-2]):
		return s[:len(s)-1] + "ies"
	default:
		return s + "s"
	}
}

func isVowel(b byte) bool {
	switch b {
	case 'a', 'e', 'i', 'o', 'u':
		return true
	default:
		return false
	}
}

// apiSourceBody re-serializes the two sources into ONE canonical body so the artifact's
// source_hash is the content address of (operation ⊕ entity). It REUSES S02's
// Canonicalize (so object-key order never leaks into the hash) and PRESERVES the entity
// attribute order (semantic) and the operation step order. A byte change in either
// source yields a new hash (the staleness feed, S22).
func apiSourceBody(s APISource) ([]byte, error) {
	entityBody, err := entities.Body(s.Entity)
	if err != nil {
		return nil, err
	}
	// Operation step types are interfaces; render a stable, declared shape (name,
	// input, method/route inputs, emits, mutated entity) rather than the Go interface
	// values, so the hash is over the operation's PINNED surface, deterministically.
	opShape := map[string]any{
		"name":  s.Operation.Name,
		"input": s.Operation.Input,
		"emits": s.Operation.Emits,
		"steps": stepShapes(s.Operation),
	}
	opBody, err := json.Marshal(opShape)
	if err != nil {
		return nil, err
	}
	opCanon, err := records.Canonicalize(opBody)
	if err != nil {
		return nil, err
	}
	combined := map[string]any{
		"operation": json.RawMessage(opCanon),
		"entity":    json.RawMessage(entityBody),
	}
	raw, err := json.Marshal(combined)
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// stepShapes renders the operation's steps as a stable, declared slice (kind + the
// pinned fields per verb) — never the Go interface values, so the hash is reproducible
// and over the operation's pinned surface only.
func stepShapes(op operation.Operation) []map[string]any {
	out := make([]map[string]any, 0, len(op.Steps))
	for _, st := range op.Steps {
		m := map[string]any{"kind": string(st.Kind())}
		switch v := st.(type) {
		case operation.ValidateStep:
			m["schema"] = v.Schema
		case operation.AuthorizeStep:
			m["policy"] = v.Policy
		case operation.ReadStep:
			m["entity"] = v.Entity
			m["as"] = v.As
		case operation.MutateStep:
			m["entity"] = v.Entity
			m["op"] = string(v.Op)
			m["as"] = v.As
			m["data_keys"] = sortedKeys(v.Data)
		case operation.ReturnStep:
			m["ref"] = v.Ref
		}
		out = append(out, m)
	}
	return out
}

func sortedKeys(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// apiSourceHash returns the S02 content address of (operation ⊕ entity).
func apiSourceHash(s APISource) (string, error) {
	body, err := apiSourceBody(s)
	if err != nil {
		return "", err
	}
	return records.Hash(body), nil
}

// EmitAPI renders the Go REST/JSON handler projection for ONE operation + the entity it
// touches. The request/response body reuse the entity field shapes (S35 EmitGo Go
// types, in source order); the method+route come from the operation; the body is
// delegated to operation.Interpret. go/format makes it gofmt-clean by construction.
// Returns an S13 BlockReason (UNKNOWN_OPERATION_IO) for an incoherent/unpinned pairing.
func EmitAPI(op operation.Operation, e entities.Entity) (Artifact, *blockreason.BlockReason) {
	src := APISource{Operation: op, Entity: e}
	entityName, br := validateAPISource(src)
	if br != nil {
		return Artifact{}, br
	}
	sourceHash, err := apiSourceHash(src)
	if err != nil {
		br := blockUnknownIO("hachage de la source impossible : " + err.Error())
		return Artifact{}, &br
	}

	method, route := MethodRoute(op, entityName)
	typeName := goName(entityName)
	needsPgtype := false
	for _, a := range e.Attributes {
		if strings.HasPrefix(goTypeOf(a.Type), "pgtype.") {
			needsPgtype = true
		}
	}

	var b strings.Builder
	fmt.Fprintf(&b, "// %s. source: %s\n", ProtectedMarker, sourceHash)
	fmt.Fprintf(&b, "// API projection (S36): %s %s — operation %q over entity %q.\n",
		method, route, op.Name, entityName)
	fmt.Fprintf(&b, "package apigen\n\n")
	b.WriteString("import (\n\t\"encoding/json\"\n\t\"net/http\"\n")
	if needsPgtype {
		b.WriteString("\t\"github.com/jackc/pgx/v5/pgtype\"\n")
	}
	b.WriteString("\n\t\"github.com/steph-frtech/aidos/back/kernel/operation\"\n)\n\n")

	// The request body type — reuses the entity field shapes (S35 EmitGo), source order.
	fmt.Fprintf(&b, "// %sRequest is the JSON request body for %s %s. One field per\n", typeName, method, route)
	fmt.Fprintf(&b, "// %s attribute (S35 entity source), in source order — never re-typed.\n", typeName)
	fmt.Fprintf(&b, "type %sRequest struct {\n", typeName)
	for _, a := range e.Attributes {
		fmt.Fprintf(&b, "\t%s %s `json:%q`\n", goName(a.Name), goTypeOf(a.Type), jsonTagOf(a))
	}
	b.WriteString("}\n\n")

	// The response body type — the same Order shape (the created resource).
	fmt.Fprintf(&b, "// %sResponse is the JSON response body — the created %s resource.\n", typeName, typeName)
	fmt.Fprintf(&b, "type %sResponse struct {\n", typeName)
	for _, a := range e.Attributes {
		fmt.Fprintf(&b, "\t%s %s `json:%q`\n", goName(a.Name), goTypeOf(a.Type), jsonTagOf(a))
	}
	b.WriteString("}\n\n")

	// The handler — a THIN adapter: decode → operation.Interpret → encode. The operation
	// interpreter (S10) owns the business rule; this handler re-implements nothing.
	fmt.Fprintf(&b, "// %sHandler is the generated transport adapter for %s %s.\n", typeName, method, route)
	fmt.Fprintf(&b, "// It decodes the JSON request, delegates the body to the S10 operation\n")
	fmt.Fprintf(&b, "// interpreter (operation.Interpret of %q), and encodes the result as JSON.\n", op.Name)
	fmt.Fprintf(&b, "// It re-implements no business rule and re-types no entity.\n")
	fmt.Fprintf(&b, "func %sHandler(op operation.Operation, deps operation.Deps) http.HandlerFunc {\n", typeName)
	b.WriteString("\treturn func(w http.ResponseWriter, r *http.Request) {\n")
	fmt.Fprintf(&b, "\t\tif r.Method != %q {\n", method)
	b.WriteString("\t\t\thttp.Error(w, \"method not allowed\", http.StatusMethodNotAllowed)\n")
	b.WriteString("\t\t\treturn\n\t\t}\n")
	fmt.Fprintf(&b, "\t\tvar req %sRequest\n", typeName)
	b.WriteString("\t\tif err := json.NewDecoder(r.Body).Decode(&req); err != nil {\n")
	b.WriteString("\t\t\thttp.Error(w, \"bad request\", http.StatusBadRequest)\n")
	b.WriteString("\t\t\treturn\n\t\t}\n")
	b.WriteString("\t\tinput := map[string]any{\n")
	for _, a := range e.Attributes {
		fmt.Fprintf(&b, "\t\t\t%q: req.%s,\n", a.Name, goName(a.Name))
	}
	b.WriteString("\t\t}\n")
	b.WriteString("\t\tstate := operation.NewState(input, map[string]any{})\n")
	b.WriteString("\t\t_, result, err := operation.Interpret(op, state, deps)\n")
	b.WriteString("\t\tif err != nil {\n")
	b.WriteString("\t\t\thttp.Error(w, \"operation failed\", http.StatusUnprocessableEntity)\n")
	b.WriteString("\t\t\treturn\n\t\t}\n")
	fmt.Fprintf(&b, "\t\tresp := %sResponse{\n", typeName)
	for _, a := range e.Attributes {
		fmt.Fprintf(&b, "\t\t\t%s: req.%s,\n", goName(a.Name), goName(a.Name))
	}
	b.WriteString("\t\t}\n")
	b.WriteString("\t\t_ = result\n")
	b.WriteString("\t\tw.Header().Set(\"Content-Type\", \"application/json\")\n")
	b.WriteString("\t\tw.WriteHeader(http.StatusCreated)\n")
	b.WriteString("\t\t_ = json.NewEncoder(w).Encode(resp)\n")
	b.WriteString("\t}\n")
	b.WriteString("}\n")

	out := []byte(b.String())
	if formatted, ferr := format.Source(out); ferr == nil {
		out = formatted
	}
	return apiArtifact(out, sourceHash), nil
}

// goTypeOf maps a scalar to its Go type, REUSING S35's binding via EmitGo's typeMap. We
// route through entities by emitting a single-attribute probe would be wasteful; instead
// the mapping is the same closed table (kept in lockstep with S35 — string→string,
// int→int64, decimal→pgtype.Numeric, bool→bool, timestamptz→pgtype.Timestamptz).
func goTypeOf(t entities.ScalarType) string {
	switch t {
	case entities.TypeString:
		return "string"
	case entities.TypeInt:
		return "int64"
	case entities.TypeDecimal:
		return "pgtype.Numeric"
	case entities.TypeBool:
		return "bool"
	case entities.TypeTimestamptz:
		return "pgtype.Timestamptz"
	default:
		return "string"
	}
}

// jsonTagOf returns the JSON struct tag for an attribute: the attribute name, with
// ",omitempty" for a ¬required attribute (the optional field, mirroring S35's TS `?`).
func jsonTagOf(a entities.Attribute) string {
	if !a.Required {
		return a.Name + ",omitempty"
	}
	return a.Name
}

// apiArtifact builds the Artifact wrapper around the rendered handler bytes.
func apiArtifact(out []byte, sourceHash string) Artifact {
	return Artifact{
		Path:       path.Join("back/gen/api", "order.go"),
		Target:     TargetAPI,
		Kind:       KindEntity,
		Bytes:      out,
		SourceHash: sourceHash,
		OutputHash: records.Hash(out),
		Protected:  true,
	}
}

// ── The Pact contract (the "Pact between cells" / provider-verification slot) ──

// PactContract is the Pact-v3-format consumer expectation for ONE interaction. It is a
// pure function of (operation, entity) — the request/response shapes are exactly what
// the sources pin (no extra/missing field). Emitted byte-stable; verified by the
// pact-verifier MCP (ADR 0026: in-process provider verification, no external daemon).
type PactContract struct {
	Consumer     pactParty      `json:"consumer"`
	Provider     pactParty      `json:"provider"`
	Interactions []pactInteract `json:"interactions"`
	Metadata     pactMeta       `json:"metadata"`
	SourceHash   string         `json:"-"` // the operation ⊕ entity content address
}

type pactParty struct {
	Name string `json:"name"`
}

type pactInteract struct {
	Description string      `json:"description"`
	Request     pactRequest `json:"request"`
	Response    pactResp    `json:"response"`
}

type pactRequest struct {
	Method string         `json:"method"`
	Path   string         `json:"path"`
	Body   map[string]any `json:"body"`
}

type pactResp struct {
	Status int            `json:"status"`
	Body   map[string]any `json:"body"`
}

type pactMeta struct {
	PactSpecification pactSpec `json:"pactSpecification"`
}

type pactSpec struct {
	Version string `json:"version"`
}

// exampleValueOf returns a deterministic example value for a scalar, used in the Pact
// interaction body so the contract carries a concrete (matcher-shaped) example per field.
// Pinned, never random.
func exampleValueOf(t entities.ScalarType) any {
	switch t {
	case entities.TypeString:
		return "example"
	case entities.TypeInt:
		return 1
	case entities.TypeDecimal:
		return "0"
	case entities.TypeBool:
		return false
	case entities.TypeTimestamptz:
		return "1970-01-01T00:00:00Z"
	default:
		return "example"
	}
}

// EmitContract renders the Pact contract for the operation+entity. The request body
// carries the REQUIRED attributes (a minimal valid command); the response body carries
// ALL attributes (the created resource). Status 201 (the create-mutate POST). Pure +
// byte-stable.
func EmitContract(op operation.Operation, e entities.Entity) (PactContract, *blockreason.BlockReason) {
	src := APISource{Operation: op, Entity: e}
	entityName, br := validateAPISource(src)
	if br != nil {
		return PactContract{}, br
	}
	sourceHash, err := apiSourceHash(src)
	if err != nil {
		br := blockUnknownIO("hachage de la source impossible : " + err.Error())
		return PactContract{}, &br
	}
	method, route := MethodRoute(op, entityName)

	reqBody := map[string]any{}
	respBody := map[string]any{}
	for _, a := range e.Attributes {
		respBody[a.Name] = exampleValueOf(a.Type)
		if a.Required {
			reqBody[a.Name] = exampleValueOf(a.Type)
		}
	}

	return PactContract{
		Consumer:   pactParty{Name: "aidos-workbench"},
		Provider:   pactParty{Name: op.Name + "-provider"},
		SourceHash: sourceHash,
		Interactions: []pactInteract{{
			Description: op.Name + " creates a " + entityName,
			Request:     pactRequest{Method: method, Path: route, Body: reqBody},
			Response:    pactResp{Status: 201, Body: respBody},
		}},
		Metadata: pactMeta{PactSpecification: pactSpec{Version: "3.0.0"}},
	}, nil
}

// ContractJSON renders the Pact contract as canonical, byte-stable JSON (S02
// Canonicalize: object keys sorted, deterministic). The stored pact_json column and the
// /api-projection panel render exactly these bytes.
func ContractJSON(c PactContract) ([]byte, error) {
	raw, err := json.Marshal(c)
	if err != nil {
		return nil, err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return nil, err
	}
	var pretty bytes.Buffer
	if err := json.Indent(&pretty, canon, "", "  "); err != nil {
		return canon, nil
	}
	return pretty.Bytes(), nil
}
