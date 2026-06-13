// runner.go — THROWAWAY (DP10 spike). The ONLY effectful file: snapshot the host
// state, execute the PURE plan against the local Docker daemon (namespaced
// dp10spike-*, own network, prod traefik_default untouched), block on healthchecks,
// probe the printed URL, tear down. Every decision was already taken purely in the
// plan — this file only carries it out and records the ordered event log.
//
// No secret is hardcoded: the throwaway Postgres password comes from the
// DP10_PG_PASSWORD environment variable (a throwaway default for the local probe).
package bootstrap

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

const containerPrefix = "dp10spike-"

// SnapshotObserved captures the host state ONCE as data (then everything is pure).
func SnapshotObserved() (ObservedState, error) {
	ss, err := exec.Command("ss", "-ltn").Output()
	if err != nil {
		return ObservedState{}, fmt.Errorf("ss -ltn: %w", err)
	}
	ps, err := exec.Command("docker", "ps", "-a", "--format", "{{.Ports}}").Output()
	if err != nil {
		return ObservedState{}, fmt.Errorf("docker ps: %w", err)
	}
	return ObservedState{SSOutput: string(ss), DockerPSOutput: string(ps)}, nil
}

// Bootstrap executes the plan: network → ordered start → healthchecks → print URLs.
// Returns the ordered event log; the caller tears down via Teardown.
func Bootstrap(b Bundle, plan Plan) RunResult {
	res := RunResult{ResolvedPort: plan.ResolvedPort, URLs: plan.URLs}
	seq := 0
	emit := func(kind, detail string) {
		seq++
		res.Events = append(res.Events, Event{Seq: seq, Kind: kind, Detail: detail})
	}
	fail := func(kind, detail string) RunResult {
		emit(kind, detail)
		return res
	}

	if out, err := run("docker", "network", "create", plan.Network); err != nil {
		return fail("network-failed", out)
	}
	emit("network-created", plan.Network)

	byName := map[string]Service{}
	for _, s := range b.Services {
		byName[s.Name] = s
	}
	for _, name := range plan.Order {
		svc := byName[name]
		args := startArgs(b, plan, svc)
		if out, err := run("docker", args...); err != nil {
			return fail("start-failed:"+name, out)
		}
		emit(svc.Role+"-up", containerPrefix+name)
		if ok, detail := waitHealthy(plan, svc); ok {
			emit("healthy:"+name, detail)
		} else {
			return fail("unhealthy:"+name, detail)
		}
	}
	res.OrderedOK = orderedOK(res.Events)
	res.HealthyAll = countHealthy(res.Events) == len(b.Services)

	ok, detail := probeURL(plan.ResolvedPort, b.HostRule)
	res.URLProbe = ok
	if ok {
		emit("url-probed", detail)
		emit("urls-printed", strings.Join(plan.URLs, " "))
	} else {
		emit("url-probe-failed", detail)
	}
	return res
}

// Teardown removes the throwaway containers + network. Idempotent, best-effort.
func Teardown(b Bundle) {
	for _, s := range b.Services {
		_, _ = run("docker", "rm", "-f", containerPrefix+s.Name)
	}
	_, _ = run("docker", "network", "rm", b.Network)
}

func startArgs(b Bundle, plan Plan, svc Service) []string {
	name := containerPrefix + svc.Name
	args := []string{"run", "-d", "--name", name, "--network", plan.Network,
		"--label", "dp10.spike=true"}
	switch svc.Role {
	case "traefik":
		args = append(args,
			"-p", fmt.Sprintf("127.0.0.1:%d:80", plan.ResolvedPort),
			"-v", "/var/run/docker.sock:/var/run/docker.sock:ro",
			svc.Image,
			"--providers.docker=true",
			"--providers.docker.exposedbydefault=false",
			"--providers.docker.constraints=Label(`dp10.spike.expose`,`true`)",
			"--entrypoints.web.address=:80",
		)
	case "datastore":
		pw := os.Getenv("DP10_PG_PASSWORD")
		if pw == "" {
			pw = "dp10spike-throwaway" // throwaway local probe only — never a real secret
		}
		args = append(args, "-e", "POSTGRES_PASSWORD="+pw, svc.Image)
	case "server":
		args = append(args,
			"--label", "dp10.spike.expose=true",
			"--label", "traefik.enable=true",
			"--label", fmt.Sprintf("traefik.http.routers.%s.rule=Host(`%s`)", b.AppName, b.HostRule),
			"--label", fmt.Sprintf("traefik.http.routers.%s.entrypoints=web", b.AppName),
			"--label", fmt.Sprintf("traefik.http.services.%s.loadbalancer.server.port=%d", b.AppName, svc.InternalPort),
			"--label", "traefik.docker.network="+plan.Network,
			svc.Image,
		)
	}
	return args
}

// waitHealthy blocks until the service's healthcheck is green (deadline 60s).
// traefik: TCP on the resolved host port; datastore: pg_isready; server: container running.
func waitHealthy(plan Plan, svc Service) (bool, string) {
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		switch svc.Role {
		case "traefik":
			c, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", plan.ResolvedPort), time.Second)
			if err == nil {
				_ = c.Close()
				return true, fmt.Sprintf("tcp 127.0.0.1:%d", plan.ResolvedPort)
			}
		case "datastore":
			if _, err := run("docker", "exec", containerPrefix+svc.Name, "pg_isready", "-U", "postgres"); err == nil {
				return true, "pg_isready"
			}
		case "server":
			if out, err := run("docker", "inspect", "-f", "{{.State.Running}}", containerPrefix+svc.Name); err == nil && strings.TrimSpace(out) == "true" {
				return true, "running"
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	return false, "deadline 60s exceeded"
}

// probeURL GETs the printed URL through the spike traefik (Host-header routed),
// retrying until traefik has registered the router (deadline 30s).
func probeURL(port int, hostRule string) (bool, string) {
	deadline := time.Now().Add(30 * time.Second)
	url := fmt.Sprintf("http://127.0.0.1:%d/", port)
	for time.Now().Before(deadline) {
		req, _ := http.NewRequest("GET", url, nil)
		req.Host = hostRule
		resp, err := http.DefaultClient.Do(req)
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == 200 {
				return true, fmt.Sprintf("GET %s (Host: %s) → 200", url, hostRule)
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	return false, "no 200 within 30s"
}

func orderedOK(events []Event) bool {
	idx := map[string]int{}
	for _, e := range events {
		if _, ok := idx[e.Kind]; !ok {
			idx[e.Kind] = e.Seq
		}
	}
	t, d, s := idx["traefik-up"], idx["datastore-up"], idx["server-up"]
	return t > 0 && d > 0 && s > 0 && t < d && d < s
}

func countHealthy(events []Event) int {
	n := 0
	for _, e := range events {
		if strings.HasPrefix(e.Kind, "healthy:") {
			n++
		}
	}
	return n
}

func run(cmd string, args ...string) (string, error) {
	out, err := exec.Command(cmd, args...).CombinedOutput()
	return string(out), err
}
