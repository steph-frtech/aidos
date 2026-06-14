package main

// materialise_hono.go — L'EXÉCUTEUR DE LA VOIE HONO/TS PROPRE (3 conteneurs câblés).
//
// Intention (utilisatrice, 2026-06-14) : « déployer l'app ÉMISE DEPUIS LES SPECS, voie Hono/TS PROPRE
// — serveur Hono émis + SIDECAR INTERPRÉTEUR Go + postgres ». Materialise (gold) et MaterialiseApp
// (générique aidos-app) déploient l'AUTRE voie (un serveur Go générique). CELLE-CI matérialise les
// TROIS conteneurs CÂBLÉS via honoemit.EmitPulumiStackHono : le Hono émis route vers le sidecar, le
// sidecar exécute operation.Interpret sur postgres.
//
// `aidospulumi up --project X --env dev --hono [--entities f.json [--seed s.sql]]` :
//   - sans --entities : la topologie câblée par défaut, DB initialisée vide (le schema arrive par
//     migration) ;
//   - avec --entities : émet le schema du projet (appdata.EmitProjectData) dans le dir du stack, puis
//     le programme Pulumi câblé AVEC le montage du schema (01-schema.sql, le GOLD form).
//
// DÉTERMINISME-FIRST. L'émission (EmitProjectData + EmitPulumiStackHono) est PURE ; l'exécuteur
// (écriture disque puis pulumi up) est le geste GATÉ. Il n'écrit AUCUNE vérité (anti-overwrite §9 :
// Materialise/MaterialiseApp restent intouchés — la voie Hono est PUREMENT ADDITIVE).

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/steph-frtech/aidos/back/runtime/appdata"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// honoDefaultManifest returns the clean-Hono-path 3-container topology for a project×env: the emitted
// Hono server (role=server) + the Go interpreter sidecar (role=interpreter) + postgres (role=datastore),
// a pgdata volume, on the EXTERNAL traefik_default network. The placeholder images are rewritten to the
// clean images (aidos-hono / aidos-interpreter) by the emitter. (When the DP02 kernel `stack_manifest`
// kind lands, the executor reads the project's manifest from the truth-store instead; today it
// materialises this clean-path default. A below-the-line projection input, never a truth write.)
func honoDefaultManifest(project string) honoemit.StackManifest {
	return honoemit.StackManifest{
		App: project,
		Services: []honoemit.Service{
			{Name: "server", Role: honoemit.RoleServer, Image: "aidos-hono:latest", InternalPort: 3000},
			{Name: "interpreter", Role: honoemit.RoleInterpreter, Image: "aidos-interpreter:latest", InternalPort: 8080},
			{Name: "db", Role: honoemit.RoleDatastore, Image: "postgres:16-alpine", InternalPort: 5432},
		},
		Volumes: []honoemit.Volume{{Name: "pgdata", Path: "/var/lib/postgresql/data"}},
		Network: honoemit.Network{Name: "traefik_default", External: true},
	}
}

// MaterialiseHono renders the clean Hono-path stack for (project, env): with entitiesPath set it first
// emits the project's schema.sql (+ optional seed.sql) into the stack dir (what postgres mounts), then
// renders the WIRED Pulumi program (honoemit.EmitPulumiStackHono) and lands the three Pulumi files
// byte-identically. Without entitiesPath it renders the wired topology with no data mount (the DB boots
// empty). It is the clean-path twin of Materialise/MaterialiseApp; both are untouched (anti-overwrite).
func MaterialiseHono(root, project, env, entitiesPath, seedPath string) (Materialised, error) {
	if project == "" {
		return Materialised{}, errors.New("--project is required")
	}
	if env == "" {
		return Materialised{}, errors.New("--env is required")
	}

	stack := project + "-" + env
	dir := filepath.Join(root, ".deploy-pulumi", stack)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return Materialised{}, fmt.Errorf("create %s: %w", dir, err)
	}

	opts := honoemit.StackHonoOpts{}

	// (a) Optional project DATA: emit the schema (+ seed) into the stack dir — what postgres mounts.
	if entitiesPath != "" {
		entities, err := loadEntities(entitiesPath)
		if err != nil {
			return Materialised{}, err
		}
		schema, _, err := appdata.EmitProjectData(project, entities)
		if err != nil {
			return Materialised{}, err
		}
		if err := os.WriteFile(filepath.Join(dir, "schema.sql"), schema, 0o644); err != nil {
			return Materialised{}, fmt.Errorf("write schema.sql: %w", err)
		}
		opts.DataDir = dir

		if seedPath != "" {
			seed, err := os.ReadFile(seedPath)
			if err != nil {
				return Materialised{}, fmt.Errorf("read --seed %q: %w", seedPath, err)
			}
			if err := os.WriteFile(filepath.Join(dir, "seed.sql"), seed, 0o644); err != nil {
				return Materialised{}, fmt.Errorf("write seed.sql: %w", err)
			}
			opts.SeedPresent = true
		}
	}

	// (b) Emit the WIRED Pulumi program (3 containers) and land the three files byte-identically.
	arts, br := honoemit.EmitPulumiStackHono(project, env, honoDefaultManifest(project), opts)
	if br != nil {
		return Materialised{}, fmt.Errorf("emitter refused the clean Hono stack (%s): %s", br.Code, br.Explanation)
	}

	files := make(map[string]string, len(arts))
	url := ""
	for _, a := range arts {
		name := filepath.Base(a.Path)
		if err := os.WriteFile(filepath.Join(dir, name), a.Bytes, 0o644); err != nil {
			return Materialised{}, fmt.Errorf("write %s: %w", name, err)
		}
		files[name] = a.OutputHash
		if a.Target == honoemit.TargetPulumiProgram {
			url = urlFromProgram(a.Bytes)
		}
	}

	return Materialised{
		Project: project,
		Env:     env,
		Stack:   stack,
		Dir:     dir,
		URL:     url,
		Files:   files,
	}, nil
}

// honoContainers returns the container names the clean Hono stack runs (the wired three), for the
// up/preview result. <stack>-server, <stack>-interpreter, <stack>-db.
func honoContainers(stack string) []string {
	return []string{stack + "-server", stack + "-interpreter", stack + "-db"}
}

// PulumiUpHono runs the full lifecycle over the materialised CLEAN Hono stack (npm install if needed,
// pulumi login, stack select --create, pulumi up --yes), then reports the THREE wired container names.
// It JUDGES nothing — it executes the pure program EmitPulumiStackHono produced. It reuses the same
// gated pulumi helpers as PulumiUp (no fork); only the reported container set differs (3, not 2).
func PulumiUpHono(mat Materialised) (UpResult, error) {
	if err := npmInstallIfNeeded(mat.Dir); err != nil {
		return UpResult{}, err
	}
	if err := pulumi(mat.Dir, "login", loginBackend()); err != nil {
		return UpResult{}, err
	}
	if err := pulumi(mat.Dir, "stack", "select", "--create", mat.Stack); err != nil {
		return UpResult{}, err
	}
	if err := pulumi(mat.Dir, "up", "--yes", "--stack", mat.Stack); err != nil {
		return UpResult{}, err
	}
	return UpResult{
		Status:     "up",
		Stack:      mat.Stack,
		Dir:        mat.Dir,
		URL:        mat.URL,
		Containers: honoContainers(mat.Stack),
	}, nil
}
