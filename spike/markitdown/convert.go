// convert.go — THROWAWAY (MK01 spike). A DETERMINISTIC, stdlib-only document->markdown converter
// that MODELS the markitdown ingestion frontier (KRD MK roadmap). It is NOT microsoft/markitdown
// (a Python lib, unavailable offline) — it is a pure-function stand-in over a REAL document
// (testdata/checkout-spec.html) whose only job is to make the falsifiable question answerable
// with numbers: is document->markdown conversion FAITHFUL (carrier facts survive) and IDEMPOTENT
// (same bytes -> same markdown, and re-running the pipeline is stable)?
//
// determinism-first: a converter is a deterministic transform (parse -> walk -> render). No LLM,
// no clock, no rng. Same input bytes -> same markdown, byte-for-byte. The reproducibility mirror
// (convert_test.go: TestReproducible) replays it 100x.
package markitdown

import (
	"regexp"
	"strings"
)

// ToMarkdown converts an HTML document's bytes into markdown. Pure function: deterministic, no I/O.
// This is the shape the MK02 port `DocConverter{ToMarkdown(bytes,mime)->md}` will expose; here the
// mime is implicitly text/html. Structure-bearing elements (headings, lists, tables, links, code,
// emphasis) are preserved; presentation-only noise (script/style/nav/footer) is dropped, exactly
// as markitdown strips chrome to keep the document's substance.
func ToMarkdown(raw []byte) string {
	s := string(raw)
	s = dropElements(s, "script", "style", "head")
	s = normalizeWhitespace(stripChromeButKeepText(s))

	// Inline conversions FIRST (determinism): turn <code>/<strong>/<em>/<a> into markdown spans
	// before any block walk strips tags — otherwise a <code> inside a <li>/<td> would be flattened.
	s = convertInline(s)

	// Block-level conversions, applied in a fixed order (determinism).
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
// discards (scripts, styles, the document head).
func dropElements(s string, names ...string) string {
	for _, n := range names {
		re := regexp.MustCompile(`(?is)<` + n + `\b[^>]*>.*?</` + n + `>`)
		s = re.ReplaceAllString(s, "")
	}
	return s
}

// stripChromeButKeepText drops navigation/footer wrappers (presentation), keeping nothing of them.
func stripChromeButKeepText(s string) string {
	return dropElements(s, "nav", "footer")
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
	// re-trim each line (table/list rendering can leave trailing spaces) — determinism of bytes.
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
