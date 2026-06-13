// plan.go — THROWAWAY (DP10 spike). Start order + the bootstrap plan: PURE functions.
// The order is a deterministic rank over the closed role set (traefik first, the
// datastore before the server), stable under any permutation of the input.
package bootstrap

import (
	"fmt"
	"sort"
)

// roleRank is the DECLARED start rank (traefik → datastore → server). Closed set.
var roleRank = map[string]int{"traefik": 0, "datastore": 1, "server": 2}

// StartOrder returns the service names in deterministic start order. Pure:
// rank by role, tie-break by name — permuting the input changes nothing.
func StartOrder(services []Service) []string {
	sorted := make([]Service, len(services))
	copy(sorted, services)
	sort.Slice(sorted, func(i, j int) bool {
		ri, rj := roleRank[sorted[i].Role], roleRank[sorted[j].Role]
		if ri != rj {
			return ri < rj
		}
		return sorted[i].Name < sorted[j].Name
	})
	names := make([]string, len(sorted))
	for i, s := range sorted {
		names[i] = s.Name
	}
	return names
}

// BuildPlan computes the deterministic bootstrap plan from the emitted bundle and
// the observed host state. PURE: same (bundle, snapshot) → same plan, byte for byte.
func BuildPlan(b Bundle, state ObservedState) Plan {
	port := ResolvePort(Occupied(state), BasePort)
	return Plan{
		Network:      b.Network,
		ResolvedPort: port,
		Order:        StartOrder(b.Services),
		URLs: []string{
			fmt.Sprintf("http://%s:%d/ (Host: %s)", "127.0.0.1", port, b.HostRule),
		},
	}
}

// Fixture is the pinned DP10 emitted-bundle fixture (DP05-style, reduced to the
// probe's needs). Local images only; the throwaway network is NEVER traefik_default.
func Fixture() Bundle {
	return Bundle{
		AppName: "dp10spike",
		Services: []Service{
			{Name: "server", Role: "server", Image: "caddy:2-alpine", InternalPort: 80},
			{Name: "traefik", Role: "traefik", Image: "traefik:latest", InternalPort: 80},
			{Name: "postgres", Role: "datastore", Image: "postgres:16-alpine", InternalPort: 5432},
		},
		Network:  "dp10spike_net",
		HostRule: "dp10spike.localhost",
	}
}
