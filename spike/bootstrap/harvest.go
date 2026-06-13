// harvest.go — THROWAWAY (DP10 spike). The /harvest output: the verdict lifted into
// a DRAFT candidate-Idea RECORD — content-addressed, append-only by nature, never a
// prose declaration. It PROPOSES; the human freezes later via /goal. The wall is
// intact: this struct models the idea_capture the real intake MCP would perform,
// NEVER a kernel/mirrors/fitness write. HasMirror/HasVersion are ALWAYS false.
package bootstrap

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
)

// HarvestRecord is the harvested verdict-as-record (DP01 motif).
type HarvestRecord struct {
	Proposes       string   `json:"proposes"` // "operation" — the lesson proposes the DP12 bootstrap emitter op
	Intent         string   `json:"intent"`
	Go             bool     `json:"go"`
	VerdictHash    string   `json:"verdictHash"`
	ProvenanceKind string   `json:"provenanceKind"` // "human"
	ProvenanceFrom string   `json:"provenanceFrom"` // "spike:DP10 (spike/bootstrap)"
	Status         string   `json:"status"`         // "draft"
	HasMirror      bool     `json:"hasMirror"`      // ALWAYS false
	HasVersion     bool     `json:"hasVersion"`     // ALWAYS false
	RecordHash     string   `json:"recordHash"`
	OpenQuestions  []string `json:"openQuestions"`
}

// Harvest lifts the computed verdict into the DRAFT record. Pure function of the verdict.
func Harvest(v Verdict) HarvestRecord {
	r := HarvestRecord{
		Proposes:       "operation",
		Go:             v.Go,
		VerdictHash:    v.VerdictHash,
		ProvenanceKind: "human",
		ProvenanceFrom: "spike:DP10 (spike/bootstrap)",
		Status:         "draft",
		HasMirror:      false,
		HasVersion:     false,
		OpenQuestions: []string{
			"OQ-DP10-1 secrets-check : le spike couvre réseau→ports→ordre→healthchecks→URLs ; la matérialisation .env + secret-store + gitleaks-scan est l'affaire de DP12/S91 (le mot de passe jetable vient d'une variable d'environnement, jamais en dur).",
			"OQ-DP10-2 volumes : le spike ne monte aucun volume bind (probe éphémère) ; les volumes nommés bind ${APP_DATA_PATH} (convention /data/dockers) sont émis par DP03/DP12.",
			"OQ-DP10-3 traefik prod : le traefik jetable porte un constraint Label(dp10.spike.expose) et son propre réseau — le traefik de prod (traefik_default) n'est jamais touché ; DP12 cible le VRAI traefik_default (exigence utilisateur 1 : https://<projet>-dev.sagedesk.fr).",
			"OQ-DP10-4 le mur : le spike ne persiste RIEN ; l'écriture réelle du verdict en `ideas` passe par idea_capture (provenance human) — ce record MODÉLISE la capture, il ne l'exécute pas.",
		},
	}
	if v.Go {
		r.Intent = "émettre le bootstrap one-shot déterministe (DP12) : la mesure DP10 prouve qu'un plan-as-data pur (résolution de ports sur ss+docker ps, ordre traefik→datastore→serveur, healthchecks bloquants, print-URLs) démarre une stack réelle de façon REPRODUCTIBLE (2 runs, mêmes événements ordonnés, même port) là où deploy.sh impose " + fmt.Sprintf("%d", v.Measurement.Script.PromptCount) + " prompts interactifs et " + fmt.Sprintf("%d", v.Measurement.Script.DataDockersRefs) + " références /data/dockers en dur — DP11-DP13 peuvent s'écrire."
	} else {
		r.Intent = "réutiliser deploy.sh directement : la mesure DP10 ne prouve pas la valeur du bootstrap natif — ADR de réutilisation documentée, DP11-DP13 ne s'écrivent pas."
	}
	r.RecordHash = recordHash(r)
	return r
}

func recordHash(r HarvestRecord) string {
	var b strings.Builder
	fmt.Fprintf(&b, "proposes=%s\nintent=%s\ngo=%t\nverdict=%s\nprovenance=%s/%s\nstatus=%s\nhas_mirror=%t\nhas_version=%t\n",
		r.Proposes, r.Intent, r.Go, r.VerdictHash, r.ProvenanceKind, r.ProvenanceFrom, r.Status, r.HasMirror, r.HasVersion)
	for _, q := range r.OpenQuestions {
		fmt.Fprintf(&b, "oq=%s\n", q)
	}
	sum := sha256.Sum256([]byte(b.String()))
	return hex.EncodeToString(sum[:])
}
