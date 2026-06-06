// Package markitdown is the MK02 runtime INGESTION FRONTIER: the DocConverter port
// (ToMarkdown(bytes, mime) → md) plus its default deterministic HTML adapter. It is the door by
// which a real document (PDF/DOCX/PPTX/XLSX/HTML/img/audio — markitdown's remit) becomes markdown a
// human can then drop into idea-intake (MK03) as a candidate-truth.
//
// THE WALL (CLAUDE.md §2). This package is PURE and BELOW THE LINE: it reads bytes and returns
// markdown. It writes NO truth (kernel/mirrors/fitness), has no DB, no clock, no rng, no LLM in the
// contract. Conversion PROPOSES (the markdown is later wrapped as an idea draft at MK03); it never
// freezes anything. The only door to truth stays idea → mirror → /goal → human approval.
//
// REPLACEABLE PORT (ADR « frontière d'ingestion replaceable », CLAUDE.md §3). The CONCRETE converter
// is an ADAPTER behind the DocConverter interface — the default HTMLConverter here is the in-process
// deterministic reference; the real microsoft/markitdown tool (and the PDF/DOCX/OCR/audio paths) is
// wired behind the SAME port at MK03 (over its MCP) without touching the caller. The adapter is an
// adapter, never a truth: it can be swapped by an ADR. What the port GRAVES is the IDEMPOTENCE
// CONTRACT (markitdown_property_test.go): « même fichier → même markdown », byte-for-byte,
// reproducible — any adapter is held to it (if a format is non-deterministic, the adapter pins a
// deterministic normalization pass or that format is gated out).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). A converter is a deterministic transform (parse → walk →
// render): it MUST be code, never an LLM. Same input bytes + same mime → same markdown, byte-for-
// byte. The reproducibility mirror (TestReproducible) replays it 100×, no drift. The LLM has no
// place in this frontier; only deterministic parsing does.
package markitdown

import (
	"regexp"
	"strings"
)

// Mime identifies the source document's content type, so the port can dispatch to the right adapter
// path (HTML here; PDF/DOCX/… added at MK03 behind the same port). Declared, never sniffed by an LLM.
type Mime string

// The mimes the MK02 reference recognises. The reference handles HTML — the one format purely
// parseable in Go stdlib offline; the others are the real tool's job (OQ-MK01-2), gated in at MK03.
const (
	MimeHTML Mime = "text/html"
)

// DocConverter is the MK02 INGESTION PORT (replaceable, ADR « frontière d'ingestion replaceable »):
// turn a document's bytes + its mime into markdown. TOTAL and PURE by contract — an unsupported mime
// yields empty markdown (never a panic), and the same (bytes, mime) always yields the same markdown
// (the idempotence contract the property mirror pins). The caller (MK03's convert_to_markdown MCP)
// depends on THIS interface, never on a concrete tool — swap the adapter by ADR.
type DocConverter interface {
	ToMarkdown(raw []byte, mime Mime) string
}

// HTMLConverter is the DEFAULT, in-process, deterministic adapter of DocConverter. It is the spike's
// HTML→markdown frontier rebuilt cleanly in back/ (the spike does NOT graduate; /harvest proposes,
// the code is rebuilt here). Structure-bearing elements (headings, lists, tables, links, code,
// emphasis) are preserved; presentation-only chrome (script/style/head/nav/footer) is dropped —
// exactly as markitdown strips chrome to keep the document's substance. Stateless: a VALUE satisfies
// DocConverter.
type HTMLConverter struct{}

var _ DocConverter = HTMLConverter{}

// ToMarkdown dispatches by mime. For MimeHTML it runs the deterministic HTML→markdown transform; any
// other mime returns "" (the port is total — MK03's real adapter dispatches the remaining formats
// behind this same port). PURE: no I/O, no clock, no rng.
func (HTMLConverter) ToMarkdown(raw []byte, mime Mime) string {
	switch mime {
	case MimeHTML:
		return htmlToMarkdown(raw)
	default:
		return ""
	}
}

// htmlToMarkdown is the pure deterministic transform. The fixed pipeline order IS the determinism:
// drop chrome → inline spans FIRST (so a <code> inside a <li>/<td> survives the block walk) →
// block elements (headings, lists, tables) → strip remaining tags → unescape → collapse blanks.
func htmlToMarkdown(raw []byte) string {
	s := string(raw)
	s = dropElements(s, "script", "style", "head")
	s = normalizeWhitespace(dropElements(s, "nav", "footer"))

	// Inline conversions FIRST (determinism): convert <code>/<strong>/<em>/<a> to markdown spans
	// before any block walk strips tags — otherwise a <code> inside a <li>/<td> would be flattened.
	s = convertInline(s)

	// Block-level conversions, in a fixed order (determinism).
	s = convertHeadings(s)
	s = convertLists(s)
	s = convertTables(s)
	s = stripRemainingTags(s)
	s = unescapeEntities(s)
	return collapseBlankLines(strings.TrimSpace(s)) + "\n"
}

var (
	reTag         = regexp.MustCompile(`(?is)</?[a-z][a-z0-9]*\b[^>]*>`)
	reHeading     = regexp.MustCompile(`(?is)<h([1-6])\b[^>]*>(.*?)</h[1-6]>`)
	reListItem    = regexp.MustCompile(`(?is)<li\b[^>]*>(.*?)</li>`)
	reUL          = regexp.MustCompile(`(?is)<ul\b[^>]*>(.*?)</ul>`)
	reOL          = regexp.MustCompile(`(?is)<ol\b[^>]*>(.*?)</ol>`)
	reRow         = regexp.MustCompile(`(?is)<tr\b[^>]*>(.*?)</tr>`)
	reCell        = regexp.MustCompile(`(?is)<t[hd]\b[^>]*>(.*?)</t[hd]>`)
	reTable       = regexp.MustCompile(`(?is)<table\b[^>]*>(.*?)</table>`)
	reStrong      = regexp.MustCompile(`(?is)<(strong|b)\b[^>]*>(.*?)</(strong|b)>`)
	reEm          = regexp.MustCompile(`(?is)<(em|i)\b[^>]*>(.*?)</(em|i)>`)
	reCode        = regexp.MustCompile(`(?is)<code\b[^>]*>(.*?)</code>`)
	reLink        = regexp.MustCompile(`(?is)<a\b[^>]*href="([^"]*)"[^>]*>(.*?)</a>`)
	reBlankLines  = regexp.MustCompile(`\n{3,}`)
	reInnerSpaces = regexp.MustCompile(`[ \t]+`)
)

// dropElements removes whole elements (open tag .. close tag) by name — the chrome markitdown
// discards (scripts, styles, the document head, nav, footer).
func dropElements(s string, names ...string) string {
	for _, n := range names {
		re := regexp.MustCompile(`(?is)<` + n + `\b[^>]*>.*?</` + n + `>`)
		s = re.ReplaceAllString(s, "")
	}
	return s
}

func convertHeadings(s string) string {
	return reHeading.ReplaceAllStringFunc(s, func(m string) string {
		sub := reHeading.FindStringSubmatch(m)
		level := sub[1][0] - '0'
		return "\n\n" + strings.Repeat("#", int(level)) + " " + strings.TrimSpace(stripRemainingTags(sub[2])) + "\n\n"
	})
}

func convertLists(s string) string {
	conv := func(prefix func(i int) string) func(string) string {
		return func(m string) string {
			items := reListItem.FindAllStringSubmatch(m, -1)
			var b strings.Builder
			b.WriteString("\n")
			for i, it := range items {
				b.WriteString(prefix(i) + strings.TrimSpace(stripRemainingTags(it[1])) + "\n")
			}
			b.WriteString("\n")
			return b.String()
		}
	}
	s = reUL.ReplaceAllStringFunc(s, conv(func(int) string { return "- " }))
	s = reOL.ReplaceAllStringFunc(s, conv(func(i int) string { return itoa(i+1) + ". " }))
	return s
}

func convertTables(s string) string {
	return reTable.ReplaceAllStringFunc(s, func(m string) string {
		rows := reRow.FindAllStringSubmatch(m, -1)
		if len(rows) == 0 {
			return ""
		}
		var b strings.Builder
		b.WriteString("\n\n")
		for ri, r := range rows {
			cells := reCell.FindAllStringSubmatch(r[1], -1)
			b.WriteString("|")
			for _, c := range cells {
				b.WriteString(" " + strings.TrimSpace(stripRemainingTags(c[1])) + " |")
			}
			b.WriteString("\n")
			if ri == 0 {
				b.WriteString("|")
				for range cells {
					b.WriteString(" --- |")
				}
				b.WriteString("\n")
			}
		}
		b.WriteString("\n")
		return b.String()
	})
}

func convertInline(s string) string {
	s = reCode.ReplaceAllString(s, "`$1`")
	s = reStrong.ReplaceAllString(s, "**$2**")
	s = reEm.ReplaceAllString(s, "*$2*")
	s = reLink.ReplaceAllString(s, "[$2]($1)")
	return s
}

func stripRemainingTags(s string) string { return reTag.ReplaceAllString(s, "") }

func unescapeEntities(s string) string {
	r := strings.NewReplacer(
		"&gt;", ">", "&lt;", "<", "&amp;", "&", "&quot;", "\"", "&#39;", "'", "&copy;", "(c)",
	)
	return r.Replace(s)
}

func normalizeWhitespace(s string) string {
	lines := strings.Split(s, "\n")
	for i, l := range lines {
		lines[i] = strings.TrimRight(reInnerSpaces.ReplaceAllString(l, " "), " ")
	}
	return strings.Join(lines, "\n")
}

func collapseBlankLines(s string) string {
	out := reBlankLines.ReplaceAllString(s, "\n\n")
	lines := strings.Split(out, "\n")
	for i, l := range lines {
		lines[i] = strings.TrimRight(l, " \t")
	}
	return strings.Join(lines, "\n")
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var d []byte
	for n > 0 {
		d = append([]byte{byte('0' + n%10)}, d...)
		n /= 10
	}
	if neg {
		return "-" + string(d)
	}
	return string(d)
}
