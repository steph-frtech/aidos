// model.go — THROWAWAY (DP10 spike). The probe's data shapes: the emitted bundle
// fixture (DP05-style), the observed host state (ss + docker ps AS DATA), the
// deterministic bootstrap plan, and the ordered event log of a real run.
package bootstrap

// Service is one service of the emitted bundle fixture (a DP05-style bundle,
// reduced to what the bootstrap probe needs).
type Service struct {
	Name         string // container suffix, e.g. "traefik"
	Role         string // closed set: "traefik" | "datastore" | "server"
	Image        string // local image only (the probe never pulls)
	InternalPort int
}

// Bundle is the emitted-bundle fixture the throwaway bootstrap consumes.
type Bundle struct {
	AppName  string
	Services []Service
	Network  string // throwaway network name (NEVER traefik_default — prod untouched)
	HostRule string // Host(`…`) the server is routed under through the spike traefik
}

// ObservedState is the host state AS DATA: the raw outputs of `ss -ltn` and
// `docker ps --format '{{.Ports}}'` captured once, then parsed by PURE functions.
type ObservedState struct {
	SSOutput       string
	DockerPSOutput string
}

// Plan is the deterministic bootstrap plan — pure function of (Bundle, ObservedState).
// The plan is DATA, inspectable before anything executes (candidate A's payoff).
type Plan struct {
	Network      string
	ResolvedPort int      // traefik web entrypoint on the host — first free ≥ BasePort
	Order        []string // service names in start order: traefik → datastore → server
	URLs         []string // the URLs printed once healthchecks are green
}

// Event is one step of a real bootstrap run, ordered by Seq.
type Event struct {
	Seq    int    `json:"seq"`
	Kind   string `json:"kind"` // closed set, e.g. "network-created", "traefik-up", "healthy:datastore", "urls-printed"
	Detail string `json:"detail"`
}

// RunResult is the measured outcome of one real throwaway run.
type RunResult struct {
	Events       []Event  `json:"events"`
	ResolvedPort int      `json:"resolvedPort"`
	OrderedOK    bool     `json:"orderedOk"`  // traefik-up < datastore-up < server-up in the event log
	HealthyAll   bool     `json:"healthyAll"` // every healthcheck went green before its deadline
	URLProbe     bool     `json:"urlProbe"`   // HTTP 200 through the spike traefik on the printed URL
	URLs         []string `json:"urls"`
}

// ScriptMeasures are the facts measured on deploy.sh's bytes (never an opinion).
type ScriptMeasures struct {
	PromptCount     int `json:"promptCount"`     // `select` + `read -rp` occurrences
	DataDockersRefs int `json:"dataDockersRefs"` // hardcoded /data/dockers references
	ScriptLineCount int `json:"scriptLineCount"`
}

// Measurement aggregates everything the verdict is computed from.
type Measurement struct {
	PlanDeterministic  bool           `json:"planDeterministic"`  // same snapshot → same plan (pure)
	OrderDeterministic bool           `json:"orderDeterministic"` // permuted services → same order
	Run1               RunResult      `json:"run1"`
	Run2               RunResult      `json:"run2"`
	RunsReproducible   bool           `json:"runsReproducible"` // same event kinds + same resolved port
	Script             ScriptMeasures `json:"script"`
	Candidates         []Candidate    `json:"candidates"`
}
