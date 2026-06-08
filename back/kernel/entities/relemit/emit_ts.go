package relemit

import (
	"fmt"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// tsName turns an entity name into an exported TS type name (order → Order). Deterministic:
// first rune upper, rest verbatim (mirrors S35 goName — no inflection invented).
func tsName(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

// EmitTS renders the WHOLE schema's TypeScript model (ADR 0040: Hono/functional TS — the
// emitted app's PRIMARY target, roadmap S74; sqlc/Go leaves the emitted tree). It carries:
//
//   - one `export type X = { ... }` per entity, fields in source order, the closed scalar→TS
//     mapping (reused from S35), a ¬required attribute OPTIONAL (`name?`);
//   - a TYPED ASSOCIATION field per relation on the owning type: a 1-1/1-N FK relation adds
//     `relname?: number` (the FK id) AND a typed nav field `relname_ref?: Target` (the loaded
//     association); an N-N adds `relname?: Target[]` (the typed collection);
//   - a NAVIGATION SDK: for each relation a `loadX(...)` helper signature (`load<Owner><Rel>`)
//     so a caller walks the graph TYPE-SAFELY against the target type — the typed navigation
//     the done-criterion pins ("associations typées / navigation SDK").
//
// It is a PURE function of the schema: same schema → byte-identical TS. A malformed schema is
// a BlockReason, never a partial render.
func EmitTS(s Schema) (Artifact, *blockreason.BlockReason) {
	if err := Validate(s); err != nil {
		return Artifact{}, block(err)
	}
	sourceHash, err := SchemaHash(s)
	if err != nil {
		return Artifact{}, block(err)
	}

	ents := canonicalEntities(s)
	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// S74 relation-aware multi-entity model: typed associations + navigation SDK (Hono/TS, ADR 0040).\n\n")

	// One type alias per entity, with scalar fields then typed association fields.
	for _, er := range ents {
		fmt.Fprintf(&b, "export type %s = {\n", tsName(er.Entity.Name))
		for _, a := range er.Entity.Attributes {
			opt := ""
			if !a.Required {
				opt = "?"
			}
			fmt.Fprintf(&b, "\t%s%s: %s;\n", a.Name, opt, scalarTS[a.Type])
		}
		for _, r := range er.Relations {
			switch r.Cardinality {
			case ref.ManyToMany:
				// A typed collection of the target.
				fmt.Fprintf(&b, "\t%s?: %s[];\n", r.Name, tsName(r.Target))
			default:
				// The FK id + the typed (optionally-loaded) association.
				fmt.Fprintf(&b, "\t%s_id%s: number;\n", r.Name, optionalSuffix(r.Required))
				fmt.Fprintf(&b, "\t%s?: %s;\n", r.Name, tsName(r.Target))
			}
		}
		b.WriteString("};\n\n")
	}

	// The navigation SDK — one typed loader per relation. A loader takes the owner and a
	// reader and resolves the typed association. The body is a typed CALL against the
	// reader; the EMITTER renders the deterministic shape, the runtime supplies the reader.
	b.WriteString("// Navigation SDK — typed graph traversal (one loader per relation).\n")
	b.WriteString("export type Reader = {\n")
	b.WriteString("\tbyId<T>(table: string, id: number): Promise<T | undefined>;\n")
	b.WriteString("\tmany<T>(join: string, ownerCol: string, ownerId: number, targetTable: string, targetCol: string): Promise<T[]>;\n")
	b.WriteString("};\n\n")
	for _, er := range ents {
		owner := tsName(er.Entity.Name)
		ownerLower := strings.ToLower(er.Entity.Name)
		for _, r := range er.Relations {
			loader := "load" + owner + tsName(r.Name)
			target := tsName(r.Target)
			targetLower := strings.ToLower(r.Target)
			switch r.Cardinality {
			case ref.ManyToMany:
				join := ownerLower + "_" + strings.ToLower(r.Name)
				fmt.Fprintf(&b, "export async function %s(reader: Reader, owner: %s): Promise<%s[]> {\n",
					loader, owner, target)
				fmt.Fprintf(&b, "\treturn reader.many<%s>(%s, %s, %s, %s, %s);\n",
					target, jsStr(join), jsStr(ownerLower+"_id"), identifierField(er.Entity),
					jsStr(targetLower), jsStr(targetLower+"_id"))
				b.WriteString("}\n\n")
			default:
				fmt.Fprintf(&b, "export async function %s(reader: Reader, owner: %s): Promise<%s | undefined> {\n",
					loader, owner, target)
				fmt.Fprintf(&b, "\tif (owner.%s_id === undefined) return undefined;\n", r.Name)
				fmt.Fprintf(&b, "\treturn reader.byId<%s>(%s, owner.%s_id);\n",
					target, jsStr(targetLower), r.Name)
				b.WriteString("}\n\n")
			}
		}
	}

	out := []byte(strings.TrimRight(b.String(), "\n") + "\n")
	return artifact("gen/"+s.Project+"/model.ts", TargetTS, out, sourceHash), nil
}

// optionalSuffix renders "?" for a non-required field, "" for a required one.
func optionalSuffix(required bool) string {
	if required {
		return ""
	}
	return "?"
}

// identifierField returns the TS field expression for an entity's identifier (owner.<id>),
// for use in a navigation loader. Validate guaranteed the entity has one.
func identifierField(e entities.Entity) string {
	if id, ok := entities.Identifier(e); ok {
		return "owner." + id.Name
	}
	return "owner.id" // unreachable post-Validate; never silently guessed in a valid schema
}

// jsStr renders a Go string as a TS double-quoted literal (deterministic).
func jsStr(s string) string {
	return `"` + strings.ReplaceAll(s, `"`, `\"`) + `"`
}
