package apisurface

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// Artifact wraps rendered bytes with their provenance, content-addressed by SOURCE (the
// spec hash) and by OUTPUT (the digest of the bytes — the byte-identical re-emit proof).
// Path is RELATIVE (no absolute path — determinism). Mirrors the S87 honoemit Artifact so
// S78 regeneration treats apisurface artifacts uniformly.
type Artifact struct {
	Path       string `json:"path"`
	Target     string `json:"target"`
	Bytes      []byte `json:"bytes"`
	SourceHash string `json:"source_hash"`
	OutputHash string `json:"output_hash"`
	Protected  bool   `json:"protected"`
}

// The emit targets apisurface renders. CLOSED — one Kernel cut → exactly these projections.
const (
	// TargetHonoRouter — the emitted app's complete Hono/TS router (one route per sync
	// operation, delegating to the Go sidecar interpreter callback). gen/<p>/api/router.ts.
	TargetHonoRouter = "hono-router"
	// TargetOpenAPI — the per-app OpenAPI 3.1 document. gen/<p>/api/openapi.json.
	TargetOpenAPI = "openapi"
	// TargetPactSuite — the per-app Pact suite index (one contract per operation).
	// gen/<p>/api/pact/<op>.pact.json (one file per op) — the suite is the slice returned.
	TargetPactSuite = "pact"
)

// sourceBody re-serialises the spec into a canonical, key-sorted JSON body so the
// SourceHash is a content address: same spec (modulo input order) → same hash. It walks the
// CANONICAL op order so input order never leaks (S02 Canonicalize reused, never forked).
func sourceBody(s ApiSpec) ([]byte, error) {
	type attrView struct {
		Name     string `json:"name"`
		Type     string `json:"type"`
		Required bool   `json:"required"`
	}
	type opView struct {
		Name      string     `json:"name"`
		Entity    string     `json:"entity"`
		Verb      string     `json:"verb"`
		Authorize bool       `json:"authorize"`
		Async     bool       `json:"async"`
		Attrs     []attrView `json:"attrs"`
		Input     []attrView `json:"input"`
	}
	toView := func(as []entities.Attribute) []attrView {
		out := make([]attrView, 0, len(as))
		for _, a := range as {
			out = append(out, attrView{Name: a.Name, Type: string(a.Type), Required: a.Required})
		}
		return out
	}
	all := append([]Op(nil), s.Ops...)
	sort.SliceStable(all, func(i, j int) bool { return all[i].Name < all[j].Name })
	ops := make([]opView, 0, len(all))
	for _, op := range all {
		ops = append(ops, opView{
			Name:      op.Name,
			Entity:    op.Entity.Name,
			Verb:      string(op.Verb),
			Authorize: op.Authorize,
			Async:     op.Async,
			Attrs:     toView(op.Entity.Attributes),
			Input:     toView(op.Input),
		})
	}
	body := map[string]any{"project": s.Project, "ops": ops}
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// SourceHash is the content address of an api spec (every artifact carries it). Any byte
// change (a new op, an op turned async, an attribute added) yields a new hash.
func SourceHash(s ApiSpec) (string, error) {
	body, err := sourceBody(s)
	if err != nil {
		return "", err
	}
	return records.Hash(body), nil
}

// header renders the protected file header for a comment syntax + the source hash.
func header(commentPrefix, sourceHash string) string {
	return fmt.Sprintf("%s %s. source: %s\n", commentPrefix, protectedMarker, sourceHash)
}

func artifact(path, target string, out []byte, sourceHash string) Artifact {
	return Artifact{
		Path:       path,
		Target:     target,
		Bytes:      out,
		SourceHash: sourceHash,
		OutputHash: records.Hash(out),
		Protected:  true,
	}
}

// jsStr renders a Go string as a TS/JS double-quoted literal, JSON-escaped — deterministic.
func jsStr(s string) string {
	b, err := json.Marshal(s)
	if err != nil {
		return "\"\""
	}
	return string(b)
}

// ── The Hono router (TargetHonoRouter) ──────────────────────────────────────────────────

// EmitRouter renders the emitted app's COMPLETE Hono/TS router: one route per sync
// operation (canonical name order), each handler
//   - decoding the JSON body,
//   - (for an authorize op) asking the Go sidecar interpreter to RUN the operation — a DENY
//     surfaces as HTTP 403 (the policy is enforced at the runtime boundary, never bypassed),
//   - delegating the command to the sidecar interpreter callback (ADR 0040 Déc.7 — the
//     handler re-implements no business rule),
//   - returning 201 (a create) or 200 (a read).
//
// FN02-pure (ADR 0036/0040): deps (the interpreter callback) arrive as a PARAMETER to
// `createRouter`, never as a module-scope mutable binding.
func EmitRouter(s ApiSpec) (Artifact, *blockreason.BlockReason) {
	if err := validate(s); err != nil {
		br := block(err)
		return Artifact{}, &br
	}
	sourceHash, err := SourceHash(s)
	if err != nil {
		br := block(err)
		return Artifact{}, &br
	}

	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// S90 emitted app API surface (Hono/functional TS, ADR 0040). One route per SYNC operation;\n")
	b.WriteString("// each handler delegates to the Go SIDECAR interpreter callback (ADR 0040 Déc.7) and enforces\n")
	b.WriteString("// the operation's policy (a DENY → HTTP 403). Async ops are wired in the worker (S87), not here.\n\n")
	b.WriteString("import { Hono } from \"hono\";\n\n")

	// The interpreter callback port (ADR 0040 Déc.7): the handler hands the command to the
	// Go sidecar interpreter; it re-implements no rule. A `denied` boolean carries the
	// policy verdict so the handler can answer 403 without re-evaluating the policy in TS.
	b.WriteString("export type InterpretResult = { denied: boolean; result: unknown };\n")
	b.WriteString("export type OperationInterpreter = (operation: string, input: unknown) => Promise<InterpretResult>;\n")
	b.WriteString("export type Deps = { interpret: OperationInterpreter };\n\n")

	b.WriteString("export function createRouter(deps: Deps): Hono {\n")
	b.WriteString("\tconst app = new Hono();\n")
	b.WriteString("\tapp.use(\"*\", async (c, next) => {\n")
	b.WriteString("\t\tc.header(\"x-app\", " + jsStr(s.Project) + ");\n")
	b.WriteString("\t\tawait next();\n")
	b.WriteString("\t});\n")
	b.WriteString("\tapp.get(\"/healthz\", (c) => c.json({ status: \"ok\" }, 200));\n")

	for _, op := range syncOps(s) {
		path := PathOf(op)
		method := strings.ToLower(string(op.Verb))
		okStatus := 201
		if op.Verb == VerbGet {
			okStatus = 200
		}
		fmt.Fprintf(&b, "\tapp.%s(%s, async (c) => {\n", method, jsStr(path))
		if op.Verb == VerbPost {
			b.WriteString("\t\tconst input = await c.req.json().catch(() => ({}));\n")
		} else {
			b.WriteString("\t\tconst input = c.req.query();\n")
		}
		fmt.Fprintf(&b, "\t\tconst verdict = await deps.interpret(%s, input);\n", jsStr(op.Name))
		if op.Authorize {
			// Policy enforcement at the runtime boundary: a DENY → 403, no body persisted.
			b.WriteString("\t\tif (verdict.denied) return c.json({ error: \"forbidden\" }, 403);\n")
		}
		fmt.Fprintf(&b, "\t\treturn c.json(verdict.result, %d);\n", okStatus)
		b.WriteString("\t});\n")
	}
	b.WriteString("\treturn app;\n")
	b.WriteString("}\n")

	out := []byte(strings.TrimRight(b.String(), "\n") + "\n")
	return artifact("gen/"+s.Project+"/api/router.ts", TargetHonoRouter, out, sourceHash), nil
}

// ── The per-app OpenAPI 3.1 document (TargetOpenAPI) ─────────────────────────────────────

// EmitOpenAPI renders the per-app OpenAPI 3.1 document for the WHOLE sync operation set —
// one path per operation, a schema per entity, a 201/200 + (for an authorize op) a 403
// response. It is canonicalised + pretty-printed so the bytes are STABLE (the S90 property
// criterion: "l'OpenAPI est byte-stable depuis le Kernel"). It invents no path/field/status.
func EmitOpenAPI(s ApiSpec) (Artifact, *blockreason.BlockReason) {
	if err := validate(s); err != nil {
		br := block(err)
		return Artifact{}, &br
	}
	sourceHash, err := SourceHash(s)
	if err != nil {
		br := block(err)
		return Artifact{}, &br
	}

	paths := map[string]any{}
	schemas := map[string]any{}
	for _, op := range syncOps(s) {
		path := PathOf(op)
		schemaName := op.Entity.Name
		schemas[schemaName] = entitySchema(op.Entity)

		responses := map[string]any{}
		okCode := "201"
		if op.Verb == VerbGet {
			okCode = "200"
		}
		responses[okCode] = map[string]any{
			"description": "ok",
			"content": map[string]any{
				"application/json": map[string]any{
					"schema": map[string]any{"$ref": "#/components/schemas/" + schemaName},
				},
			},
		}
		if op.Authorize {
			responses["403"] = map[string]any{"description": "forbidden (policy DENY)"}
		}

		operationObj := map[string]any{
			"operationId": op.Name,
			"summary":     op.Name,
			"responses":   responses,
		}
		if op.Verb == VerbPost {
			// The request body is the operation's INPUT schema (a distinct <Op>Input schema
			// when the operation pins its own input; else the entity itself).
			inSchemaRef := schemaName
			if len(op.Input) > 0 {
				inSchemaName := op.Name + "Input"
				schemas[inSchemaName] = attrsSchema(op.Input)
				inSchemaRef = inSchemaName
			}
			operationObj["requestBody"] = map[string]any{
				"required": true,
				"content": map[string]any{
					"application/json": map[string]any{
						"schema": map[string]any{"$ref": "#/components/schemas/" + inSchemaRef},
					},
				},
			}
		}

		pathItem, ok := paths[path].(map[string]any)
		if !ok {
			pathItem = map[string]any{}
		}
		pathItem[strings.ToLower(string(op.Verb))] = operationObj
		paths[path] = pathItem
	}

	doc := map[string]any{
		"openapi": "3.1.0",
		"info": map[string]any{
			"title":   s.Project + " API",
			"version": "1.0.0",
		},
		"paths":      paths,
		"components": map[string]any{"schemas": schemas},
	}

	raw, err := json.Marshal(doc)
	if err != nil {
		br := block(err)
		return Artifact{}, &br
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		br := block(err)
		return Artifact{}, &br
	}
	pretty, perr := indentJSON(canon)
	if perr != nil {
		pretty = canon
	}
	out := []byte(strings.TrimRight(string(pretty), "\n") + "\n")
	return artifact("gen/"+s.Project+"/api/openapi.json", TargetOpenAPI, out, sourceHash), nil
}

// entitySchema renders the OpenAPI object schema for an entity: one property per attribute
// (canonical source order is preserved via Canonicalize's key sort), required = the
// Required attributes. The JSON-Schema type maps deterministically from the entity type.
func entitySchema(e entities.Entity) map[string]any {
	return attrsSchema(e.Attributes)
}

// attrsSchema renders the OpenAPI object schema for any attribute slice (reused for the
// entity response schema AND the operation input schema).
func attrsSchema(attrs []entities.Attribute) map[string]any {
	props := map[string]any{}
	required := make([]string, 0, len(attrs))
	for _, a := range attrs {
		props[a.Name] = map[string]any{"type": jsonSchemaType(a.Type)}
		if a.Required {
			required = append(required, a.Name)
		}
	}
	sort.Strings(required)
	schema := map[string]any{"type": "object", "properties": props}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}

// jsonSchemaType maps an entity attribute type to a JSON-Schema scalar type, deterministically.
func jsonSchemaType(t entities.ScalarType) string {
	switch t {
	case entities.TypeInt:
		return "integer"
	case entities.TypeDecimal:
		return "number"
	case entities.TypeBool:
		return "boolean"
	default:
		return "string"
	}
}

// indentJSON pretty-prints canonical JSON with a 2-space indent — purely presentational,
// deterministic (it walks the already-canonical bytes). Reused for the OpenAPI + Pact files.
func indentJSON(b []byte) ([]byte, error) {
	var pretty bytes.Buffer
	if err := json.Indent(&pretty, b, "", "  "); err != nil {
		return nil, err
	}
	return pretty.Bytes(), nil
}
