// Package endpointfitness is the DP08 arch-fitness invariant
// EMITTED_NO_HARDCODED_ENDPOINT made an ENFORCED, deterministic build-time
// sensor over the EMITTED TS tree (Hono handlers, workers, boot config —
// ROADMAP-provisioning-deploy EPIC B): no host, URL, IP or concrete
// host:port may live as a literal in emitted source; every endpoint flows
// through the DP07 projection (resolveConnection → process.env / requireEnv
// at boot — SPEC-stack-2026: « AUCUNE URL/secret en dur — tout par variables
// d'environnement »).
//
// THE PASS (A7, determinism-first): detection is a LITERAL PARSE of the TS
// source — a deterministic lexer that walks strings, template literals and
// their ${expr} spans exactly the way the TS AST does (the authoritative TS
// twin front/web/lib/endpoint-fitness.ts runs the REAL TypeScript compiler
// API over the same rules; this Go pass is its byte-parity-pinned twin) —
// NEVER an LLM that "judges if it looks hardcoded" (ADR 0066). The four
// closed reasons:
//
//   - localhost_literal  — `localhost` / 127.0.0.1 / 0.0.0.0 in a literal;
//   - ip_literal         — a concrete IPv4 dotted-quad;
//   - url_concrete_host  — scheme://host where the authority's host carries
//     concrete characters (a fully env-derived host — ${VAR} or a template
//     ${expr} span — is allowed: the env poisons adjacency);
//   - host_port_literal  — a concrete host:port (the container-name
//     convention ${APP_NAME}-<svc>:<port> is env-derived, hence allowed).
//
// FAIL-CLOSED + THE RATCHET: a red verdict yields the actionable BlockReason
// EMITTED_NO_HARDCODED_ENDPOINT and reddens the S84 archfit sensor
// (SensorArchFit), so selfcert.Certify BLOCKS THE CUT before the build loop
// can claim green (anti-passthrough — a missing verdict is red). The declared
// rule lives above the line in back/runtime/agentloop/arch-fitness.json
// (widening or softening it is idée → miroir → /goal, never a silent edit);
// the parity fixture pins config ↔ code.
//
// PURE (CLAUDE.md §6/§8): no DB, no clock, no rng, no I/O — Sense is a total
// function of the emitted tree; the verdict is content-addressed via
// records.Hash(records.Canonicalize(...)) (S02 reused) so « même arbre →
// même verdict » is a pinned reproducibility mirror. THE WALL (§2): this
// package writes nothing — it reports; the fitness config is above the line.
package endpointfitness

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/buildloop/selfcert"
)

// CodeEmittedNoHardcodedEndpoint is the DP08 invariant code — the
// arch-fitness rule name AND the BlockReason code of a refused cut
// (package-local, the FN04 motif: never a new member of the frozen
// blockreason registry).
const CodeEmittedNoHardcodedEndpoint blockreason.Code = "EMITTED_NO_HARDCODED_ENDPOINT"

// Reason is the CLOSED classification of one hardcoded-endpoint finding.
type Reason string

const (
	// ReasonLocalhost — `localhost`, 127.0.0.1 or 0.0.0.0 in an emitted literal.
	ReasonLocalhost Reason = "localhost_literal"
	// ReasonIPLiteral — a concrete IPv4 dotted-quad in an emitted literal.
	ReasonIPLiteral Reason = "ip_literal"
	// ReasonURLConcreteHost — scheme://host with a concrete (non-env) host.
	ReasonURLConcreteHost Reason = "url_concrete_host"
	// ReasonHostPort — a concrete host:port outside the env-derived convention.
	ReasonHostPort Reason = "host_port_literal"
)

var reasonOrder = []Reason{ReasonLocalhost, ReasonIPLiteral, ReasonURLConcreteHost, ReasonHostPort}

// Reasons returns the closed reason set in canonical order.
func Reasons() []Reason {
	out := make([]Reason, len(reasonOrder))
	copy(out, reasonOrder)
	return out
}

// Verdict states — the closed two-value sensor verdict (no third state).
const (
	// StateGreen — no hardcoded endpoint in the emitted tree.
	StateGreen = "green"
	// StateRed — at least one finding; the cut is blocked.
	StateRed = "red"
)

// Finding is ONE hardcoded-endpoint occurrence in the emitted tree.
type Finding struct {
	// File is the emitted file path carrying the literal.
	File string `json:"file"`
	// Line is the 1-based line of the literal's start.
	Line int `json:"line"`
	// Literal is the offending literal text (raw, as written).
	Literal string `json:"literal"`
	// Reason is the closed classification.
	Reason Reason `json:"reason"`
}

// Verdict is the DP08 sensor verdict over one emitted tree — pure data,
// content-addressable (the reproducibility mirror pins Address).
type Verdict struct {
	// Rule is always EMITTED_NO_HARDCODED_ENDPOINT.
	Rule string `json:"rule"`
	// State is green or red (closed).
	State string `json:"state"`
	// TreeAddress is the content address of the scanned tree (S02 canonical).
	TreeAddress string `json:"tree_address"`
	// Findings are the hardcoded occurrences, sorted (file, line, literal).
	Findings []Finding `json:"findings"`
}

// ---------------------------------------------------------------------------
// The literal pass — a deterministic TS lexer with AST-equivalent semantics.
// ---------------------------------------------------------------------------

// sentinel poisons adjacency where a template ${expr} span or a textual
// ${VAR} placeholder stood: an env-derived fragment can never complete a
// concrete host. NUL never appears in real TS source.
const sentinel = "\x00"

// Literal is one extracted literal: its AST-equivalent text (template parts
// joined with the sentinel) and its 1-based start line.
type Literal struct {
	Text string
	Line int
}

// ExtractLiterals lexes TS source and returns every string literal, every
// template literal (its raw text parts joined with the sentinel — the
// TemplateExpression semantics) and, exactly like the AST walk, the literals
// found INSIDE template ${expr} spans. Comments are skipped. Total: any
// input yields a deterministic result (EOF closes an open token).
func ExtractLiterals(src string) []Literal {
	var out []Literal
	line := 1
	i := 0
	n := len(src)

	// template tracks the enclosing template literals: each entry accumulates
	// raw parts; braces counts the open braces inside the current ${ } span.
	type tmpl struct {
		parts     []string
		startLine int
		braces    []int // stack of open-brace counts, one per nested ${ span
	}
	var stack []*tmpl

	flushTemplate := func(t *tmpl) {
		out = append(out, Literal{Text: strings.Join(t.parts, sentinel), Line: t.startLine})
	}

	readQuoted := func(quote byte) (string, int) {
		// i points AT the opening quote; returns raw content + start line.
		start := i + 1
		startLine := line
		j := start
		for j < n {
			c := src[j]
			if c == '\\' && j+1 < n {
				if src[j+1] == '\n' {
					line++
				}
				j += 2
				continue
			}
			if c == quote || c == '\n' {
				break
			}
			j++
		}
		raw := src[start:j]
		if j < n && src[j] == quote {
			j++
		}
		i = j
		return raw, startLine
	}

	for i < n {
		c := src[i]
		// inside a template's raw part?
		inTemplate := len(stack) > 0 && len(stack[len(stack)-1].braces) == 0

		if inTemplate {
			t := stack[len(stack)-1]
			start := i
			for i < n {
				c = src[i]
				if c == '\n' {
					line++
					i++
					continue
				}
				if c == '\\' && i+1 < n {
					i += 2
					continue
				}
				if c == '`' {
					t.parts = append(t.parts, src[start:i])
					flushTemplate(t)
					stack = stack[:len(stack)-1]
					i++
					break
				}
				if c == '$' && i+1 < n && src[i+1] == '{' {
					t.parts = append(t.parts, src[start:i])
					t.braces = append(t.braces, 0)
					i += 2
					break
				}
				i++
			}
			if i >= n && (len(stack) > 0 && len(stack[len(stack)-1].braces) == 0) {
				// EOF inside a template raw part: close it.
				t := stack[len(stack)-1]
				t.parts = append(t.parts, src[start:])
				flushTemplate(t)
				stack = stack[:len(stack)-1]
			}
			continue
		}

		// code mode (top level or inside a ${ } span).
		switch {
		case c == '\n':
			line++
			i++
		case c == '/' && i+1 < n && src[i+1] == '/':
			for i < n && src[i] != '\n' {
				i++
			}
		case c == '/' && i+1 < n && src[i+1] == '*':
			i += 2
			for i+1 < n && !(src[i] == '*' && src[i+1] == '/') {
				if src[i] == '\n' {
					line++
				}
				i++
			}
			i += 2
			if i > n {
				i = n
			}
		case c == '\'' || c == '"':
			raw, startLine := readQuoted(c)
			out = append(out, Literal{Text: stripPlaceholders(raw), Line: startLine})
		case c == '`':
			stack = append(stack, &tmpl{startLine: line})
			i++
		case c == '{':
			if len(stack) > 0 {
				t := stack[len(stack)-1]
				t.braces[len(t.braces)-1]++
			}
			i++
		case c == '}':
			if len(stack) > 0 {
				t := stack[len(stack)-1]
				if t.braces[len(t.braces)-1] == 0 {
					// the ${ } span closes: back to the template's raw part.
					t.braces = t.braces[:len(t.braces)-1]
				} else {
					t.braces[len(t.braces)-1]--
				}
			}
			i++
		default:
			i++
		}
	}

	// EOF with templates still open (unterminated): close them all.
	for len(stack) > 0 {
		t := stack[len(stack)-1]
		flushTemplate(t)
		stack = stack[:len(stack)-1]
	}
	return out
}

// placeholderRe matches a textual ${VAR} placeholder (compose/env-file
// convention) inside a plain string literal.
var placeholderRe = regexp.MustCompile(`\$\{[^}]*\}`)

// stripPlaceholders replaces textual ${VAR} placeholders with the sentinel —
// an env reference is allowed and poisons host adjacency.
func stripPlaceholders(s string) string {
	return placeholderRe.ReplaceAllString(s, sentinel)
}

// ---------------------------------------------------------------------------
// The classifier — the DECLARED rules (arch-fitness.json), pure and total.
// ---------------------------------------------------------------------------

var (
	localhostRe = regexp.MustCompile(`(?i)(^|[^a-z0-9_-])localhost($|[^a-z0-9_-])`)
	ipv4Re      = regexp.MustCompile(`(^|[^0-9.])([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})($|[^0-9.])`)
)

// ClassifyLiteral applies the closed rules to one extracted literal (its
// ${...} placeholders already sentinel-poisoned). It returns the FIRST
// matching reason in canonical order and whether the literal is hardcoded.
func ClassifyLiteral(text string) (Reason, bool) {
	t := stripPlaceholders(text)

	// 1. localhost / loopback / wildcard bind.
	if localhostRe.MatchString(t) || hasIPv4(t, func(o [4]int) bool {
		return (o[0] == 127) || (o[0] == 0 && o[1] == 0 && o[2] == 0 && o[3] == 0)
	}) {
		return ReasonLocalhost, true
	}
	// 2. any concrete IPv4.
	if hasIPv4(t, func([4]int) bool { return true }) {
		return ReasonIPLiteral, true
	}
	// 3. scheme://host with a concrete host.
	if urlConcreteHost(t) {
		return ReasonURLConcreteHost, true
	}
	// 4. concrete host:port.
	if hostPortConcrete(t) {
		return ReasonHostPort, true
	}
	return "", false
}

// hasIPv4 reports whether t carries an IPv4 dotted-quad whose octets are all
// <= 255 and satisfy pred.
func hasIPv4(t string, pred func([4]int) bool) bool {
	for _, m := range ipv4Re.FindAllStringSubmatch(t, -1) {
		var o [4]int
		ok := true
		for k := 0; k < 4; k++ {
			v, err := strconv.Atoi(m[2+k])
			if err != nil || v > 255 {
				ok = false
				break
			}
			o[k] = v
		}
		if ok && pred(o) {
			return true
		}
	}
	return false
}

// urlConcreteHost reports whether t contains scheme://host where the host
// part (authority minus userinfo and port) carries a concrete alphanumeric
// character AND no env sentinel.
func urlConcreteHost(t string) bool {
	rest := t
	for {
		idx := strings.Index(rest, "://")
		if idx < 0 {
			return false
		}
		authority := rest[idx+3:]
		if cut := strings.IndexAny(authority, "/?#"); cut >= 0 {
			authority = authority[:cut]
		}
		if at := strings.LastIndex(authority, "@"); at >= 0 {
			authority = authority[at+1:]
		}
		host := authority
		if colon := strings.Index(host, ":"); colon >= 0 {
			host = host[:colon]
		}
		if !strings.Contains(host, sentinel) && strings.ContainsFunc(host, isAlnum) {
			return true
		}
		rest = rest[idx+3:]
	}
}

func isAlnum(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9')
}

func isHostChar(b byte) bool {
	return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9') ||
		b == '.' || b == '-' || b == sentinel[0]
}

// hostPortConcrete reports whether t contains host:port (port = 2..5 digits)
// where the host token has at least one letter and no env sentinel — the
// concrete service endpoint bypassing the ${APP_NAME}-<svc> convention.
func hostPortConcrete(t string) bool {
	for i := 0; i < len(t); i++ {
		if t[i] != ':' {
			continue
		}
		// digits after the colon.
		j := i + 1
		for j < len(t) && t[j] >= '0' && t[j] <= '9' {
			j++
		}
		digits := j - i - 1
		if digits < 2 || digits > 5 {
			continue
		}
		if j < len(t) && isHostChar(t[j]) {
			continue // the "port" continues into a host-ish token — not a port
		}
		// host token before the colon.
		k := i
		for k > 0 && isHostChar(t[k-1]) {
			k--
		}
		host := t[k:i]
		if host == "" || strings.Contains(host, sentinel) {
			continue
		}
		// scheme-relative authorities are rule 3's business.
		if k >= 2 && t[k-1] == '/' && t[k-2] == '/' {
			continue
		}
		hasLetter := false
		for _, r := range host {
			if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
				hasLetter = true
				break
			}
		}
		if hasLetter {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// The sensor — Sense / Block / Address (pure, content-addressed).
// ---------------------------------------------------------------------------

// ScanSource runs the literal pass + the classifier over ONE emitted file
// and returns its findings sorted (line, literal).
func ScanSource(path, src string) []Finding {
	var out []Finding
	for _, lit := range ExtractLiterals(src) {
		if reason, hard := ClassifyLiteral(lit.Text); hard {
			out = append(out, Finding{
				File:    path,
				Line:    lit.Line,
				Literal: strings.ReplaceAll(lit.Text, sentinel, "${…}"),
				Reason:  reason,
			})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Line != out[j].Line {
			return out[i].Line < out[j].Line
		}
		return out[i].Literal < out[j].Literal
	})
	return out
}

// Sense is THE DP08 sensor: the deterministic verdict over a whole emitted
// tree (path → source). Green iff NO literal in NO file is a hardcoded
// endpoint. Total and pure — same tree ⇒ same verdict, same address.
func Sense(files map[string]string) (Verdict, error) {
	paths := make([]string, 0, len(files))
	for p := range files {
		paths = append(paths, p)
	}
	sort.Strings(paths)

	findings := []Finding{}
	for _, p := range paths {
		findings = append(findings, ScanSource(p, files[p])...)
	}
	state := StateGreen
	if len(findings) > 0 {
		state = StateRed
	}
	treeAddr, err := canonicalAddress(map[string]any{"files": files})
	if err != nil {
		return Verdict{}, err
	}
	return Verdict{
		Rule:        string(CodeEmittedNoHardcodedEndpoint),
		State:       state,
		TreeAddress: treeAddr,
		Findings:    findings,
	}, nil
}

// Canonical renders the verdict as S02-canonical bytes (records.Canonicalize
// — keys sorted, no insignificant whitespace): the body the TS twin
// reproduces byte-for-byte.
func Canonical(v Verdict) ([]byte, error) {
	body, err := json.Marshal(map[string]any{"verdict": v})
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(body)
}

// Address is the content address of the canonical verdict (records.Hash —
// S02 reused). The Go address is AUTHORITATIVE; the vitest twin and the
// Playwright e2e pin it (« même arbre → même verdict »).
func Address(v Verdict) (string, error) {
	canon, err := Canonical(v)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

func canonicalAddress(body map[string]any) (string, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// Block turns a red verdict into the actionable EMITTED_NO_HARDCODED_ENDPOINT
// BlockReason that BLOCKS THE CUT; a green verdict blocks nothing (nil).
func Block(v Verdict) *blockreason.BlockReason {
	if v.State != StateRed {
		return nil
	}
	first := v.Findings[0]
	return &blockreason.BlockReason{
		Code:     CodeEmittedNoHardcodedEndpoint,
		Severity: blockreason.SeverityBlocking,
		Explanation: fmt.Sprintf(
			"Le source émis porte %d endpoint(s) en dur — le premier : %s:%d %q (%s). "+
				"SPEC-stack-2026 : aucune URL, host, IP ou port en dur dans le source émis ; "+
				"tout endpoint passe par la projection DP07 (resolveConnection → process.env au boot).",
			len(v.Findings), first.File, first.Line, first.Literal, first.Reason),
		HowToFix: []string{
			"route_endpoint : remplacez le littéral par la projection DP07 — resolveConnection(service, env) → requireEnv/process.env au boot (jamais une valeur dans le source).",
			"re_emit : ré-émettez le module de connexions (EmitConnectionsModule) pour l'environnement visé — il ne porte que des références ${VAR}.",
			"rerun aidos check : rejouez le senseur — la coupe se débloque quand l'arbre émis est vert.",
		},
	}
}

// SensorArchFit projects the DP08 verdict into the S84 archfit sensor slot
// (selfcert — the auto-certification battery): a red endpoint verdict reddens
// archfit and the battery blocks the cut. FAIL-CLOSED: a tree the sensor
// cannot canonicalize is RED, never silently green (anti-passthrough).
func SensorArchFit(files map[string]string) selfcert.SensorVerdict {
	v, err := Sense(files)
	if err != nil {
		return selfcert.SensorVerdict{
			Kind:   selfcert.SensorArchFit,
			State:  selfcert.SensorRed,
			Detail: fmt.Sprintf("%s: unscannable emitted tree (fail-closed): %v", CodeEmittedNoHardcodedEndpoint, err),
		}
	}
	if v.State == StateRed {
		f := v.Findings[0]
		return selfcert.SensorVerdict{
			Kind:  selfcert.SensorArchFit,
			State: selfcert.SensorRed,
			Detail: fmt.Sprintf("%s: %d hardcoded endpoint(s) — first %s:%d %q (%s)",
				CodeEmittedNoHardcodedEndpoint, len(v.Findings), f.File, f.Line, f.Literal, f.Reason),
		}
	}
	return selfcert.SensorVerdict{Kind: selfcert.SensorArchFit, State: selfcert.SensorGreen}
}

// ---------------------------------------------------------------------------
// The demo sandbox tree — the canonical fixture the Workbench /endpoints-
// fitness screen, the vitest twin and the Playwright e2e all replay. BYTE-
// IDENTICAL to DEMO_EMITTED_TREE in front/web/lib/endpoint-fitness.ts (the
// pinned addresses red on one byte of drift).
// ---------------------------------------------------------------------------

// LeakPath is the canonical fault-injection file path.
const LeakPath = "gen/app/leak.ts"

// LeakSource is the canonical injected hardcoded endpoint (the DP08
// done-criterion example: https://1.2.3.4:5432).
const LeakSource = "// FAULT INJECTION (DP08 sandbox) — the canonical hardcoded endpoint.\nexport const LEAK = \"https://1.2.3.4:5432\";\n"

// DemoEmittedTree returns a fresh copy of the canonical GREEN emitted tree:
// an emitted-style DP07 boot-config module + a worker consuming it. Every
// endpoint is env-derived — the sensor must hold it green.
func DemoEmittedTree() map[string]string {
	return map[string]string{
		"gen/app/connections.prod.ts": "// Code generated by AIDOS connresolve (DP07) — DO NOT EDIT.\n" +
			"function requireEnv(name: string): string {\n" +
			"\tconst v = process.env[name];\n" +
			"\tif (v === undefined || v === \"\") {\n" +
			"\t\tthrow new Error(`MISSING_ENV_AT_BOOT: ${name}`);\n" +
			"\t}\n" +
			"\treturn v;\n" +
			"}\n" +
			"\n" +
			"export const connections = {\n" +
			"\tcache: `${requireEnv(\"APP_NAME\")}-cache:6379`,\n" +
			"\tcrm: requireEnv(\"CRM_MANAGED_URL\"),\n" +
			"\tdb: `${requireEnv(\"APP_NAME\")}-db:5432`,\n" +
			"\tserver: `https://${requireEnv(\"APP_SUBDOMAIN\")}.${requireEnv(\"DOMAIN\")}`,\n" +
			"};\n",
		"gen/app/worker.ts": "// Code generated by AIDOS (DP08 demo worker) — DO NOT EDIT.\n" +
			"import { connections } from \"./connections.prod\";\n" +
			"\n" +
			"export function queueTarget(): string {\n" +
			"\treturn connections.cache;\n" +
			"}\n",
	}
}
