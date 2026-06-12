// model.go — THROWAWAY (DP01 spike). The minimal StackManifest the probe declares: app name,
// services (name / role / image / internal port / profile), named volumes, network, connector
// scopes. Pure data — the manifest DECLARES topology; it resolves no URL and no secret (that
// is the per-environment projection, EPIC B). Roles probe the closed set DP02 would engrave.
package stackmanifest

// Service is one declared service of the emitted stack.
type Service struct {
	Name         string
	Role         string // probe of the DP02 closed set: server|datastore|cache|interpreter|…
	Image        string
	InternalPort int
	Profile      string // probe of the compose profiles: core|docs|observability|…
}

// Volume is a named bind volume per the /data/dockers convention
// (driver_opts: {type: none, device: ${APP_DATA_PATH}, o: bind}).
type Volume struct {
	Name string
	// DeviceVar is the ENV VAR REFERENCE for the bind device (e.g. "APP_DATA_PATH") —
	// never a hardcoded path (SPEC-stack-2026: no hardcoded URL/host/secret/path).
	DeviceVar string
}

// Network is the external reverse-proxy network (traefik_default, owned by the traefik
// deployment, external everywhere else).
type Network struct {
	Name     string
	External bool
}

// StackManifest is the DP01 minimal declaration of the emitted stack.
type StackManifest struct {
	AppName         string
	Services        []Service
	Volumes         []Volume
	Network         Network
	ConnectorScopes []string // e.g. "gmail:read-only" — declared, never resolved here
}

// Fixture is the spike's pinned minimal manifest: one reverse-proxied server (the emitted app),
// one datastore, one named bind volume, the external traefik network, one connector scope.
// Deliberately small — the probe measures the MECHANISM, not the full 19-layer stack.
func Fixture() StackManifest {
	return StackManifest{
		AppName: "alphaspike",
		Services: []Service{
			{Name: "app", Role: "server", Image: "denoland/deno:alpine", InternalPort: 3571, Profile: "core"},
			{Name: "postgres", Role: "datastore", Image: "postgres:17-alpine", InternalPort: 5432, Profile: "core"},
		},
		Volumes: []Volume{
			{Name: "app_data", DeviceVar: "APP_DATA_PATH"},
		},
		Network:         Network{Name: "traefik_default", External: true},
		ConnectorScopes: []string{"postgres:read-only"},
	}
}
