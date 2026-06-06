// fmt.go — THROWAWAY (EL01 spike). Tiny deterministic formatting helper used to build the verdict
// rationale without dragging fmt into the decision logic. Pure.
package besoin

import "strconv"

// itoa renders an int as its decimal string.
func itoa(n int) string {
	return strconv.Itoa(n)
}
