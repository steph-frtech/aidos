package policy

import (
	"bytes"
	"encoding/json"
	"errors"
)

// ErrBadNode is returned when a Policy contains a node the canonical encoder does
// not recognize (a structurally-malformed AST — Parse would reject it first).
var ErrBadNode = errors.New("policy: malformed node")

// Serialize returns the Policy as its wire JSON shape (NOT yet canonical): the
// human-authored / DB-stored object {name, scope, target, rule, effect}. It is the
// form a kernel.policy row's body holds. Canonicalize derives the hashed bytes.
func Serialize(p Policy) ([]byte, error) {
	var buf bytes.Buffer
	if err := encodePolicy(&buf, p); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// Canonicalize returns the deterministic JSONB encoding of a Policy: object keys
// sorted lexicographically (recursively), arrays in order, no insignificant
// whitespace. It is the form the Policy is hashed over (content-address), so
// records.Hash(Canonicalize(p)) is the kernel.policy id/version. It reuses the
// SAME canonical scheme as expr.Canonicalize / records.Canonicalize (one address
// space across stores) — never a re-invented hashing path.
func Canonicalize(p Policy) ([]byte, error) {
	// encodePolicy already emits keys in sorted order at every level, so the
	// output is canonical by construction (matching records.Canonicalize output
	// for the same logical object).
	return Serialize(p)
}

func encodePolicy(buf *bytes.Buffer, p Policy) error {
	// Keys in sorted order: effect, kind, name, rule, scope, target.
	buf.WriteString(`{"effect":`)
	writeJSON(buf, string(p.Effect))
	buf.WriteString(`,"kind":"policy","name":`)
	writeJSON(buf, p.Name)
	buf.WriteString(`,"rule":`)
	if err := encodeRule(buf, p.Rule); err != nil {
		return err
	}
	buf.WriteString(`,"scope":`)
	writeJSON(buf, string(p.Scope))
	buf.WriteString(`,"target":`)
	writeJSON(buf, p.Target)
	buf.WriteByte('}')
	return nil
}

func encodeRule(buf *bytes.Buffer, r Rule) error {
	switch n := r.(type) {
	case AllNode:
		return encodeChildren(buf, "all", n.Children)
	case AnyNode:
		return encodeChildren(buf, "any", n.Children)
	case NotNode:
		buf.WriteString(`{"child":`)
		if err := encodeRule(buf, n.Child); err != nil {
			return err
		}
		buf.WriteString(`,"kind":"not"}`)
		return nil
	case CompareNode:
		// keys sorted: kind, left, op, right
		buf.WriteString(`{"kind":"compare","left":`)
		if err := encodeOperand(buf, n.Left); err != nil {
			return err
		}
		buf.WriteString(`,"op":`)
		writeJSON(buf, string(n.Op))
		buf.WriteString(`,"right":`)
		if err := encodeOperand(buf, n.Right); err != nil {
			return err
		}
		buf.WriteByte('}')
		return nil
	case ExistsNode:
		buf.WriteString(`{"kind":"exists","sel":`)
		writeJSON(buf, n.Sel)
		buf.WriteByte('}')
		return nil
	case MatchesNode:
		// keys sorted: kind, pattern, sel
		buf.WriteString(`{"kind":"matches","pattern":`)
		writeJSON(buf, n.Pattern)
		buf.WriteString(`,"sel":`)
		writeJSON(buf, n.Sel)
		buf.WriteByte('}')
		return nil
	default:
		return ErrBadNode
	}
}

func encodeChildren(buf *bytes.Buffer, kind string, children []Rule) error {
	buf.WriteString(`{"children":[`)
	for i, c := range children {
		if i > 0 {
			buf.WriteByte(',')
		}
		if err := encodeRule(buf, c); err != nil {
			return err
		}
	}
	buf.WriteString(`],"kind":`)
	writeJSON(buf, kind)
	buf.WriteByte('}')
	return nil
}

func encodeOperand(buf *bytes.Buffer, o Operand) error {
	switch t := o.(type) {
	case SelectorOperand:
		// keys sorted: kind, path
		buf.WriteString(`{"kind":"sel","path":`)
		writeJSON(buf, t.Path)
		buf.WriteByte('}')
		return nil
	case LiteralOperand:
		// keys sorted: kind, value
		buf.WriteString(`{"kind":"lit","value":`)
		vb, err := json.Marshal(t.Value)
		if err != nil {
			return err
		}
		buf.Write(vb)
		buf.WriteByte('}')
		return nil
	default:
		return ErrBadNode
	}
}

func writeJSON(buf *bytes.Buffer, s string) {
	b, _ := json.Marshal(s)
	buf.Write(b)
}
