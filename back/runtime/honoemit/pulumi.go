package honoemit

// THE PULUMI PROGRAM PROJECTION (S87 / ADR 0043). EmitPulumiProgram projects a Pulumi/TS
// infra program from a StackManifest — the SOURCE stays the content-addressed StackManifest
// above the wall (DP02, forward-dependency OQ-S87-stackmanifest); the Pulumi program is a
// BELOW-the-line projection, byte-stable + FN02-pure. "Un programme → toutes les cibles"
// (Docker+Traefik today, k8s/Fly/cloud later via stacks). The emitter renders one Pulumi
// `docker.Container` resource per service (provider Docker) on the shared Traefik network,
// in CANONICAL service order — never a clock, never a guessed service/role.
//
// DETERMINISM-FIRST. EmitPulumiProgram is a PURE, TOTAL function of Canonicalize(manifest):
// services sorted by name, fixed import order, "\n" newlines — same manifest → byte-identical
// program (the S87 done-criterion "le programme Pulumi/TS émis est FN02-pur + byte-stable").
//
// FN02-PURITY (ADR 0036/0040). The emitted program is pure functional TS: the resources are
// declared in an exported `program()` function, no top-level mutable binding (`let`/`var` at
// module scope) — the purity mirror pins it.

import (
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// ServiceRole is the CLOSED role set a StackManifest service may carry (the honesty rule:
// an unknown role is a BlockReason, never guessed). It mirrors the DP02 role grammar
// (server | datastore | cache | pooler | interpreter | … ); honoemit pins the subset S87
// needs and grows it ADDITIVELY when a later DP fragment requires a new role.
type ServiceRole string

const (
	RoleServer      ServiceRole = "server"
	RoleDatastore   ServiceRole = "datastore"
	RoleCache       ServiceRole = "cache"
	RolePooler      ServiceRole = "pooler"
	RoleInterpreter ServiceRole = "interpreter" // the Go Operation-DSL sidecar (ADR 0040 Déc.7)
	RoleWorkflow    ServiceRole = "workflow"
	RoleBus         ServiceRole = "bus"
)

// serviceRoles is the closed role set in canonical order.
var serviceRoles = []ServiceRole{
	RoleServer, RoleDatastore, RoleCache, RolePooler, RoleInterpreter, RoleWorkflow, RoleBus,
}

// IsServiceRole reports whether r is one of the closed roles. Exposed so a decoder/panel
// never invents a role.
func IsServiceRole(r string) bool {
	for _, sr := range serviceRoles {
		if string(sr) == r {
			return true
		}
	}
	return false
}

// ServiceRoles returns the closed role set in canonical order.
func ServiceRoles() []ServiceRole { return append([]ServiceRole(nil), serviceRoles...) }

// Service is one service of the StackManifest: a name, a role (closed set), a container
// image, and the port the service listens on INSIDE the network (internal_port — never a
// published host port; Traefik exposes the server, the others are docker_internal).
type Service struct {
	Name         string      `json:"name"`
	Role         ServiceRole `json:"role"`
	Image        string      `json:"image"`
	InternalPort int         `json:"internal_port"`
}

// Volume is a named bind volume (name + the in-container path it mounts). The host bind path
// is resolved at bootstrap (DP12), never baked into the source — so the program stays pure.
type Volume struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

// Network is the shared Docker network the services attach to. external=true mirrors the
// /data/dockers convention (the traefik deployment OWNS traefik_default; everyone else
// attaches to it as external).
type Network struct {
	Name     string `json:"name"`
	External bool   `json:"external"`
}

// StackManifest is the SOURCE the Pulumi emitter consumes (OQ-S87-stackmanifest, the DP02
// forward-dependency). It DECLARES the topology — it resolves no URL and no secret (that is
// the per-environment projection, EPIC B). honoemit models it as the JSON body the emitter
// reads; when DP02 lands the kernel `stack_manifest` kind, the decoder binds to it unchanged.
type StackManifest struct {
	App      string    `json:"app"`
	Services []Service `json:"services"`
	Volumes  []Volume  `json:"volumes"`
	Network  Network   `json:"network"`
}

// validateManifest checks the manifest is projectable: an app name, ≥ 1 service, every
// service pins a name/image/known-role, internal ports unique, and at least one role=server
// (the app must expose a server). It invents nothing; an unpinned field is a cause, not a
// default. (Mirrors the DP02 validateStackManifest contract; the kernel record kind will
// own the canonical validator — here honoemit validates what it projects.)
func validateManifest(m StackManifest) error {
	if m.App == "" {
		return ErrNoProject
	}
	if len(m.Services) == 0 {
		return ErrNoServices
	}
	seenPort := map[int]bool{}
	hasServer := false
	for _, s := range m.Services {
		if s.Name == "" {
			return ErrServiceNoName
		}
		if s.Image == "" {
			return ErrServiceNoImage
		}
		if !IsServiceRole(string(s.Role)) {
			return ErrUnknownRole
		}
		if s.Role == RoleServer {
			hasServer = true
		}
		if s.InternalPort != 0 {
			if seenPort[s.InternalPort] {
				return ErrDupInternalPort
			}
			seenPort[s.InternalPort] = true
		}
	}
	if !hasServer {
		return ErrNoServer
	}
	return nil
}

// canonicalServices returns the manifest's services sorted by name (the CANONICAL emission
// order, so map/source order never leaks into the bytes).
func canonicalServices(m StackManifest) []Service {
	out := append([]Service(nil), m.Services...)
	sort.SliceStable(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// manifestBody re-serialises the manifest into a canonical, key-sorted JSON body so the
// SourceHash is a content address (S02 reused, never forked). Services walk canonical order.
func manifestBody(m StackManifest) ([]byte, error) {
	svcs := make([]map[string]any, 0, len(m.Services))
	for _, s := range canonicalServices(m) {
		svcs = append(svcs, map[string]any{
			"name": s.Name, "role": string(s.Role), "image": s.Image, "internal_port": s.InternalPort,
		})
	}
	vols := append([]Volume(nil), m.Volumes...)
	sort.SliceStable(vols, func(i, j int) bool { return vols[i].Name < vols[j].Name })
	body := map[string]any{
		"app":      m.App,
		"services": svcs,
		"volumes":  vols,
		"network":  map[string]any{"name": m.Network.Name, "external": m.Network.External},
	}
	return records.Canonicalize(mustJSON(body))
}

// ManifestHash is the content address of a StackManifest (the SourceHash the Pulumi artifact
// carries). Any byte change (a new service, a retargeted image) yields a new hash.
func ManifestHash(m StackManifest) (string, error) {
	body, err := manifestBody(m)
	if err != nil {
		return "", err
	}
	return records.Hash(body), nil
}

// EmitPulumiProgram renders the Pulumi/TS infra program for the manifest (ADR 0043): the
// shared (external) Docker network, one `docker.Container` per service on that network with
// its pinned image + internal port, and Traefik routing labels on the role=server service
// (the only public-facing one). FN02-pure: the resources are declared inside an exported
// `program()` function — no module-scope mutable binding. Byte-stable + content-addressed.
func EmitPulumiProgram(m StackManifest) (Artifact, *blockreason.BlockReason) {
	if err := validateManifest(m); err != nil {
		br := block(err)
		return Artifact{}, &br
	}
	sourceHash, err := ManifestHash(m)
	if err != nil {
		br := block(err)
		return Artifact{}, &br
	}

	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// S87 emitted app infra program (Pulumi/functional TS, ADR 0043). StackManifest →\n")
	b.WriteString("// one docker.Container per service on the shared Traefik network. One program → all targets.\n\n")
	b.WriteString("import * as docker from \"@pulumi/docker\";\n\n")

	// program() — a PURE FACTORY of the resource graph. No module-scope mutable binding (FN02).
	b.WriteString("export function program() {\n")
	fmt.Fprintf(&b, "\tconst networkName = %s;\n", jsStr(m.Network.Name))
	fmt.Fprintf(&b, "\tconst network = new docker.Network(%s, { name: networkName });\n\n", jsStr(m.Network.Name))

	containers := make([]string, 0, len(m.Services))
	for _, s := range canonicalServices(m) {
		varName := tsIdent(s.Name)
		containers = append(containers, varName)
		fmt.Fprintf(&b, "\tconst %s = new docker.Container(%s, {\n", varName, jsStr(s.Name))
		fmt.Fprintf(&b, "\t\timage: %s,\n", jsStr(s.Image))
		fmt.Fprintf(&b, "\t\tname: %s,\n", jsStr(s.Name))
		fmt.Fprintf(&b, "\t\trestart: \"unless-stopped\",\n")
		fmt.Fprintf(&b, "\t\tnetworksAdvanced: [{ name: networkName }],\n")
		if s.Role == RoleServer {
			// The only public service: Traefik labels (HTTPS router + HTTP→HTTPS redirect).
			b.WriteString("\t\tlabels: [\n")
			b.WriteString("\t\t\t{ label: \"traefik.enable\", value: \"true\" },\n")
			fmt.Fprintf(&b, "\t\t\t{ label: \"traefik.http.services.%s.loadbalancer.server.port\", value: %s },\n",
				s.Name, jsStr(fmt.Sprintf("%d", s.InternalPort)))
			fmt.Fprintf(&b, "\t\t\t{ label: \"traefik.http.routers.%s.entrypoints\", value: \"websecure\" },\n", s.Name)
			fmt.Fprintf(&b, "\t\t\t{ label: \"traefik.http.routers.%s.tls\", value: \"true\" },\n", s.Name)
			b.WriteString("\t\t],\n")
		}
		b.WriteString("\t}, { dependsOn: [network] });\n\n")
	}

	b.WriteString("\treturn { network, containers: { ")
	parts := make([]string, 0, len(containers))
	for _, c := range containers {
		parts = append(parts, c)
	}
	b.WriteString(strings.Join(parts, ", "))
	b.WriteString(" } };\n")
	b.WriteString("}\n")

	out := []byte(strings.TrimRight(b.String(), "\n") + "\n")
	return artifact("gen/"+m.App+"/infra/index.ts", TargetPulumiProgram, out, sourceHash), nil
}

// tsIdent renders a service name as a safe TS identifier (deterministic): non-alphanumerics
// become "_". It coins no name the source does not imply.
func tsIdent(name string) string {
	var b strings.Builder
	for i, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r == '_':
			b.WriteRune(r)
		case r >= '0' && r <= '9':
			if i == 0 {
				b.WriteRune('_')
			}
			b.WriteRune(r)
		default:
			b.WriteRune('_')
		}
	}
	if b.Len() == 0 {
		return "_"
	}
	return b.String()
}
