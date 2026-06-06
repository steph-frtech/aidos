// fmt.go — THROWAWAY (CE01 spike). Tiny deterministic formatting helpers used to build the
// verdict rationale without dragging fmt's float formatting into the decision logic. Pure.
package compound

import "strconv"

// pct renders a fraction in [0,1] as a one-decimal percentage string (e.g. 0.314 -> "31.4%").
func pct(f float64) string {
	return strconv.FormatFloat(f*100, 'f', 1, 64) + "%"
}

// itoa renders an int as its decimal string.
func itoa(n int) string {
	return strconv.Itoa(n)
}
