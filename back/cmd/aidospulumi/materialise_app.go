package main

// materialise_app.go — l'EXÉCUTEUR PAR PROJET : émettre les DONNÉES du projet AVANT pulumi up.
//
// Intention (utilisatrice, 2026-06-14) : « aidospulumi up --project X déploie la VRAIE app de X avec
// les PROPRES entités de X ». L'émission par projet est OPT-IN (anti-overwrite §9) : sans --entities,
// Materialise/EmitOnly restent BYTE-IDENTIQUES (les tests existants verts) ; avec --entities, on
// EXÉCUTE aidosappemit (la projection de données) dans le dir du stack, PUIS on émet le programme
// Pulumi AVEC les montages (honoemit.EmitPulumiStackApp) — exactement le GOLD demoshop index.ts.
//
// DÉTERMINISME-FIRST. L'émission (aidosappemit.EmitProjectData + honoemit.EmitPulumiStackApp) est
// PURE ; l'exécuteur (écriture des fichiers de données sur disque, puis pulumi up) est le geste GATÉ
// side-effectant. L'exécuteur n'écrit AUCUNE vérité.

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/steph-frtech/aidos/back/runtime/appdata"
	"github.com/steph-frtech/aidos/back/runtime/generators"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// MaterialiseApp is the per-project DATA-aware materialisation: it emits the project's data
// (schema.sql + entities.json [+ seed.sql]) via the PURE aidosappemit.EmitProjectData INTO the stack
// dir, then renders the Pulumi program WITH the data mounts (honoemit.EmitPulumiStackApp) and lands
// the three Pulumi files byte-identically. It is the data twin of Materialise; Materialise itself is
// untouched (anti-overwrite). entitiesPath/seedPath are host files; an empty entitiesPath is an error
// (callers without project data use Materialise).
func MaterialiseApp(root, project, env, entitiesPath, seedPath, appName string) (Materialised, error) {
	if project == "" {
		return Materialised{}, errors.New("--project is required")
	}
	if env == "" {
		return Materialised{}, errors.New("--env is required")
	}
	if entitiesPath == "" {
		return Materialised{}, errors.New("--entities is required for a per-project data deploy (omit it for the gold default)")
	}

	entities, err := loadEntities(entitiesPath)
	if err != nil {
		return Materialised{}, err
	}

	stack := project + "-" + env
	dir := filepath.Join(root, ".deploy-pulumi", stack)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return Materialised{}, fmt.Errorf("create %s: %w", dir, err)
	}

	// (a) Emit the project's DATA + (additively) its OPERATION SERVER via appdata.EmitProjectServer — the
	// per-project emitter that WIRES the operation projector into this path (reusing honoemit.EmitServer, no
	// second projector). It is a SUPER-SET of EmitProjectData: with NO ops it returns the SAME schema.sql +
	// entities.json byte-for-byte (Server/Worker nil) — so the generic aidos-app data path is byte-identical
	// to before (zero regression on demoshop/techstore). With ops resolved (projectOps — the S17/S31 seam) it
	// ALSO lands server.ts (+ worker.ts when async) the deploy mounts. Today projectOps returns the createOrder
	// anchor and the generic admin server (aidos-app:latest) ignores the extra server.ts file, so the live
	// behaviour is unchanged; the operation server is materialised, ready for the wired-image path.
	ps, err := appdata.EmitProjectServer(project, entities, projectOps(project))
	if err != nil {
		return Materialised{}, err
	}
	schema, entitiesJSON := ps.Schema, ps.EntitiesJSON
	if err := os.WriteFile(filepath.Join(dir, "schema.sql"), schema, 0o644); err != nil {
		return Materialised{}, fmt.Errorf("write schema.sql: %w", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "entities.json"), entitiesJSON, 0o644); err != nil {
		return Materialised{}, fmt.Errorf("write entities.json: %w", err)
	}
	// Land the OPERATION SERVER artifacts additively (only when ops resolved → Server non-nil). The generic
	// aidos-app admin server does not run them, but materialising them here closes the emission gap (the
	// operation projector now reaches the per-project deploy dir). A pure projection, byte-stable.
	for _, art := range []*honoemit.Artifact{ps.Server, ps.Worker} {
		if art == nil {
			continue
		}
		name := filepath.Base(art.Path)
		if err := os.WriteFile(filepath.Join(dir, name), art.Bytes, 0o644); err != nil {
			return Materialised{}, fmt.Errorf("write %s: %w", name, err)
		}
	}

	// (b) The optional seed — copied verbatim as seed.sql (Pulumi mounts it as 02-seed.sql).
	seedPresent := false
	if seedPath != "" {
		seed, err := os.ReadFile(seedPath)
		if err != nil {
			return Materialised{}, fmt.Errorf("read --seed %q: %w", seedPath, err)
		}
		if err := os.WriteFile(filepath.Join(dir, "seed.sql"), seed, 0o644); err != nil {
			return Materialised{}, fmt.Errorf("write seed.sql: %w", err)
		}
		seedPresent = true
	}

	// (c) Emit the Pulumi program WITH the data mounts (the GOLD form) and land the three files.
	opts := honoemit.StackAppOpts{DataDir: dir, AppName: appName, SeedPresent: seedPresent}
	arts, br := honoemit.EmitPulumiStackApp(project, env, defaultManifest(project), opts)
	if br != nil {
		return Materialised{}, fmt.Errorf("emitter refused the stack (%s): %s", br.Code, br.Explanation)
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

// loadEntities decodes a JSON []EntitySource file (the project's entities) via the shared appdata
// decoder (defaults a missing kind to entity) and refuses an empty/malformed file.
func loadEntities(path string) ([]generators.EntitySource, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read --entities %q: %w", path, err)
	}
	ents, err := appdata.DecodeEntities(b)
	if err != nil {
		return nil, fmt.Errorf("decode --entities %q: %w", path, err)
	}
	if len(ents) == 0 {
		return nil, fmt.Errorf("--entities %q decoded to zero entities", path)
	}
	return ents, nil
}
