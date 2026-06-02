package expr

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
)

// Parse / Canonicalize errors. Each is a TYPED error (never a panic) so a caller
// — and the property mirror — can distinguish a rejection from a crash.
var (
	ErrInvalidJSON = errors.New("expr: AST is not valid JSON")
	ErrMissingKind = errors.New("expr: node missing kind discriminator")
	ErrUnknownKind = errors.New("expr: unknown node kind")
	ErrUnknownFunc = errors.New("expr: unknown function (closed allow-list)")
	ErrArity       = errors.New("expr: wrong argument count for function")
	ErrBadRef      = errors.New("expr: malformed $-rooted ref")
	ErrBadNode     = errors.New("expr: malformed node")
)

// rawNode is the wire shape of any node: a kind discriminator plus the
// kind-specific fields. Decoding is two-pass — read the kind, then the rest —
// so an unknown kind is rejected before any field is trusted.
type rawNode struct {
	Kind   Kind                       `json:"kind"`
	Value  json.RawMessage            `json:"value"`  // lit
	Path   string                     `json:"path"`   // ref
	Fn     string                     `json:"fn"`     // call
	Args   []json.RawMessage          `json:"args"`   // call
	Fields map[string]json.RawMessage `json:"fields"` // obj
	Items  []json.RawMessage          `json:"items"`  // arr
}

// Parse decodes + validates an Expr AST from its canonical JSONB. It rejects
// unknown kinds, unknown functions (the closed allow-list), wrong arities, and
// malformed refs. It never evaluates and never panics — a bad AST yields a typed
// error. The returned Expr always re-canonicalizes stably (the round-trip
// invariant).
func Parse(b []byte) (Expr, error) {
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.UseNumber()
	var raw json.RawMessage
	if err := dec.Decode(&raw); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidJSON, err)
	}
	return parseNode(raw)
}

func parseNode(b json.RawMessage) (Expr, error) {
	var n rawNode
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	if err := d.Decode(&n); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidJSON, err)
	}
	if n.Kind == "" {
		return nil, ErrMissingKind
	}
	if !IsNodeKind(string(n.Kind)) {
		return nil, fmt.Errorf("%w: %q", ErrUnknownKind, n.Kind)
	}

	switch n.Kind {
	case KindLit:
		v, err := decodeScalar(n.Value)
		if err != nil {
			return nil, err
		}
		return LitNode{Value: v}, nil

	case KindRef:
		if !strings.HasPrefix(n.Path, "$") {
			return nil, fmt.Errorf("%w: %q (must start at $)", ErrBadRef, n.Path)
		}
		if n.Path != "$" && !strings.HasPrefix(n.Path, "$.") {
			return nil, fmt.Errorf("%w: %q", ErrBadRef, n.Path)
		}
		return RefNode{Path: n.Path}, nil

	case KindCall:
		if !IsCatalogueFunc(n.Fn) {
			return nil, fmt.Errorf("%w: %q", ErrUnknownFunc, n.Fn)
		}
		args := make([]Expr, 0, len(n.Args))
		for _, ab := range n.Args {
			a, err := parseNode(ab)
			if err != nil {
				return nil, err
			}
			args = append(args, a)
		}
		if !arityOK(n.Fn, len(args)) {
			return nil, fmt.Errorf("%w: %q got %d", ErrArity, n.Fn, len(args))
		}
		return CallNode{Fn: n.Fn, Args: args}, nil

	case KindObj:
		fields := make(map[string]Expr, len(n.Fields))
		for k, fb := range n.Fields {
			f, err := parseNode(fb)
			if err != nil {
				return nil, err
			}
			fields[k] = f
		}
		return ObjNode{Fields: fields}, nil

	case KindArr:
		items := make([]Expr, 0, len(n.Items))
		for _, ib := range n.Items {
			it, err := parseNode(ib)
			if err != nil {
				return nil, err
			}
			items = append(items, it)
		}
		return ArrNode{Items: items}, nil
	}
	return nil, ErrBadNode
}

// decodeScalar reads a lit value into a normalized Go scalar: string, float64
// (any JSON number), bool, or nil. A non-scalar lit (object/array) is rejected.
func decodeScalar(b json.RawMessage) (any, error) {
	if len(b) == 0 {
		return nil, nil
	}
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	var v any
	if err := d.Decode(&v); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidJSON, err)
	}
	switch t := v.(type) {
	case json.Number:
		f, err := t.Float64()
		if err != nil {
			return nil, fmt.Errorf("%w: %v", ErrInvalidJSON, err)
		}
		return f, nil
	case string, bool, nil:
		return v, nil
	default:
		return nil, fmt.Errorf("%w: lit must be a scalar, got %T", ErrBadNode, v)
	}
}

// Canonicalize returns the deterministic JSONB encoding of an Expr: object keys
// sorted lexicographically (recursively), arrays in order, no insignificant
// whitespace. It is the form the AST is hashed over (content-address), so
// Hash(Canonicalize(e)) is the kernel.expr id/version. Reuses the same canonical
// scheme as records.Canonicalize (one address space across stores).
func Canonicalize(e Expr) ([]byte, error) {
	var buf bytes.Buffer
	if err := encodeNode(&buf, e); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func encodeNode(buf *bytes.Buffer, e Expr) error {
	switch n := e.(type) {
	case LitNode:
		buf.WriteString(`{"kind":"lit","value":`)
		sb, err := json.Marshal(n.Value)
		if err != nil {
			return err
		}
		buf.Write(sb)
		buf.WriteByte('}')
		return nil
	case RefNode:
		buf.WriteString(`{"kind":"ref","path":`)
		pb, _ := json.Marshal(n.Path)
		buf.Write(pb)
		buf.WriteByte('}')
		return nil
	case CallNode:
		fb, _ := json.Marshal(n.Fn)
		buf.WriteString(`{"args":[`)
		for i, a := range n.Args {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := encodeNode(buf, a); err != nil {
				return err
			}
		}
		buf.WriteString(`],"fn":`)
		buf.Write(fb)
		buf.WriteString(`,"kind":"call"}`)
		return nil
	case ObjNode:
		keys := make([]string, 0, len(n.Fields))
		for k := range n.Fields {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		buf.WriteString(`{"fields":{`)
		for i, k := range keys {
			if i > 0 {
				buf.WriteByte(',')
			}
			kb, _ := json.Marshal(k)
			buf.Write(kb)
			buf.WriteByte(':')
			if err := encodeNode(buf, n.Fields[k]); err != nil {
				return err
			}
		}
		buf.WriteString(`},"kind":"obj"}`)
		return nil
	case ArrNode:
		buf.WriteString(`{"items":[`)
		for i, it := range n.Items {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := encodeNode(buf, it); err != nil {
				return err
			}
		}
		buf.WriteString(`],"kind":"arr"}`)
		return nil
	default:
		return ErrBadNode
	}
}

// Hash returns the content-address of an Expr AST: the canonical JSONB hashed
// with the same scheme as records.Hash, so a kernel.expr row lands under a stable
// id == version. (The hash itself is computed by callers via records.Hash to keep
// one hashing implementation; Canonicalize is the byte source.)
