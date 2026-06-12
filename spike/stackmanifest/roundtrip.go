// roundtrip.go — THROWAWAY (DP01 spike). The round-trip half of the probe: a minimal pure
// parser that reads the EMITTED compose back into the topology it carries (service names,
// roles, images, internal ports, profiles, volume names, network) so the mirror can assert
// nothing was invented and nothing was lost. Deliberately matched to the throwaway emitter's
// shape — a real DP03 would round-trip through a YAML AST; the spike measures the MECHANISM.
package stackmanifest

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// Topo is the compose-visible projection of a manifest (connector scopes are NOT in the
// compose — they are wall/agentlayer business, EPIC E — so they are excluded by design).
type Topo struct {
	Services []Service
	Volumes  []string
	Network  string
}

// Topology projects a manifest onto its compose-visible topology (sorted, canonical).
func Topology(m StackManifest) Topo {
	services := append([]Service(nil), m.Services...)
	sort.Slice(services, func(i, j int) bool { return services[i].Name < services[j].Name })
	var vols []string
	for _, v := range m.Volumes {
		vols = append(vols, v.Name)
	}
	sort.Strings(vols)
	return Topo{Services: services, Volumes: vols, Network: m.Network.Name}
}

// ParseCompose recovers the topology from an emitted compose — a pure line parser.
func ParseCompose(compose string) (Topo, error) {
	var t Topo
	var cur *Service
	section := ""
	for _, raw := range strings.Split(compose, "\n") {
		line := strings.TrimRight(raw, " ")
		switch line {
		case "services:":
			section = "services"
			continue
		case "networks:":
			flush(&t, &cur)
			section = "networks"
			continue
		case "volumes:":
			flush(&t, &cur)
			section = "volumes"
			continue
		}
		trimmed := strings.TrimSpace(line)
		switch section {
		case "services":
			if strings.HasPrefix(line, "  ") && !strings.HasPrefix(line, "   ") && strings.HasSuffix(trimmed, ":") {
				flush(&t, &cur)
				cur = &Service{Name: strings.TrimSuffix(trimmed, ":")}
				continue
			}
			if cur == nil {
				continue
			}
			switch {
			case strings.HasPrefix(trimmed, "image: "):
				cur.Image = strings.TrimPrefix(trimmed, "image: ")
			case strings.HasPrefix(trimmed, "# role: "):
				cur.Role = strings.TrimPrefix(trimmed, "# role: ")
			case strings.HasPrefix(trimmed, "# internal_port: "):
				if n, err := strconv.Atoi(strings.TrimPrefix(trimmed, "# internal_port: ")); err == nil {
					cur.InternalPort = n
				}
			case strings.Contains(trimmed, "loadbalancer.server.port="):
				part := trimmed[strings.Index(trimmed, "loadbalancer.server.port=")+len("loadbalancer.server.port="):]
				part = strings.TrimSuffix(part, `"`)
				if n, err := strconv.Atoi(part); err == nil {
					cur.InternalPort = n
				}
			case strings.HasPrefix(trimmed, "- ") && cur.Profile == "pending-profile":
				cur.Profile = strings.TrimPrefix(trimmed, "- ")
			case trimmed == "profiles:":
				cur.Profile = "pending-profile"
			}
		case "networks":
			if strings.HasPrefix(line, "  ") && !strings.HasPrefix(line, "   ") && strings.HasSuffix(trimmed, ":") && t.Network == "" {
				t.Network = strings.TrimSuffix(trimmed, ":")
			}
		case "volumes":
			if strings.HasPrefix(line, "  ") && !strings.HasPrefix(line, "   ") && strings.HasSuffix(trimmed, ":") {
				t.Volumes = append(t.Volumes, strings.TrimSuffix(trimmed, ":"))
			}
		}
	}
	flush(&t, &cur)
	if len(t.Services) == 0 {
		return t, fmt.Errorf("no services recovered from compose")
	}
	sort.Slice(t.Services, func(i, j int) bool { return t.Services[i].Name < t.Services[j].Name })
	sort.Strings(t.Volumes)
	return t, nil
}

func flush(t *Topo, cur **Service) {
	if *cur != nil {
		t.Services = append(t.Services, **cur)
		*cur = nil
	}
}

// TopologyEqual asserts the manifest's compose-visible topology equals the recovered one.
func TopologyEqual(m StackManifest, got Topo) bool {
	want := Topology(m)
	if want.Network != got.Network || len(want.Services) != len(got.Services) || len(want.Volumes) != len(got.Volumes) {
		return false
	}
	for i := range want.Services {
		if want.Services[i] != got.Services[i] {
			return false
		}
	}
	for i := range want.Volumes {
		if want.Volumes[i] != got.Volumes[i] {
			return false
		}
	}
	return true
}
