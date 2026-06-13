// ports.go — THROWAWAY (DP10 spike). Deterministic port resolution: PURE functions
// over the observed host state (`ss -ltn` + `docker ps` outputs parsed as data),
// replacing deploy.sh's interactive `read -rp "Entrez un nouveau port…"` prompt.
package bootstrap

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// BasePort is the declared base for the spike traefik web entrypoint.
const BasePort = 18080

var ssAddrRe = regexp.MustCompile(`:(\d+)\s`)
var psMapRe = regexp.MustCompile(`:(\d+)->`)

// ParseSS extracts the listening host ports from raw `ss -ltn` output. Pure.
func ParseSS(out string) []int {
	seen := map[int]bool{}
	for _, line := range strings.Split(out, "\n") {
		if !strings.Contains(line, "LISTEN") {
			continue
		}
		for _, m := range ssAddrRe.FindAllStringSubmatch(line+" ", -1) {
			if p, err := strconv.Atoi(m[1]); err == nil {
				seen[p] = true
			}
		}
	}
	return sortedKeys(seen)
}

// ParseDockerPS extracts host-mapped ports from raw `docker ps -a --format '{{.Ports}}'`
// output (even stopped containers hold their mapping, like deploy.sh checks). Pure.
func ParseDockerPS(out string) []int {
	seen := map[int]bool{}
	for _, m := range psMapRe.FindAllStringSubmatch(out, -1) {
		if p, err := strconv.Atoi(m[1]); err == nil {
			seen[p] = true
		}
	}
	return sortedKeys(seen)
}

// Occupied is the union of listening and docker-mapped ports. Pure.
func Occupied(state ObservedState) map[int]bool {
	occ := map[int]bool{}
	for _, p := range ParseSS(state.SSOutput) {
		occ[p] = true
	}
	for _, p := range ParseDockerPS(state.DockerPSOutput) {
		occ[p] = true
	}
	return occ
}

// ResolvePort returns the first free port ≥ base given the occupied set.
// PURE — never a prompt, never a choice: same occupied set → same port.
func ResolvePort(occupied map[int]bool, base int) int {
	p := base
	for occupied[p] {
		p++
	}
	return p
}

func sortedKeys(m map[int]bool) []int {
	out := make([]int, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Ints(out)
	return out
}
