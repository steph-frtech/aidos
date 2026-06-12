// harvest.go — THROWAWAY (DP01 spike). The /harvest output: the verdict lifted into a DRAFT
// candidate-Idea RECORD — content-addressed (RecordHash), append-only by nature, never a prose
// declaration. It PROPOSES; the human freezes later via /goal. The wall is intact: this struct
// is the proposal the real idea-intake MCP would capture via idea_capture (provenance human),
// NEVER a kernel/mirrors/fitness write. HasMirror/HasVersion are ALWAYS false (an Idea is a
// need, not a truth).
package stackmanifest

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
)

// HarvestRecord is the harvested verdict-as-record: the measured go/no-go plus the durable
// lesson, content-addressed so "same verdict → same record" is checkable forever.
type HarvestRecord struct {
	Proposes       string // "entity" — the lesson proposes the stack_manifest record kind (DP02)
	Intent         string // the durable lesson, in the ubiquitous language
	Go             bool   // the MEASURED verdict (hash equality), never an opinion
	SourceHash     string // content address of the probe manifest
	OutputHash     string // content address of the emitted compose
	ProvenanceKind string // "human" — captured from the human-run spike
	ProvenanceFrom string // the source spike (DP01)
	Status         string // "draft" — never frozen, never grilled here
	HasMirror      bool   // ALWAYS false
	HasVersion     bool   // ALWAYS false
	RecordHash     string // content address of THIS record (sha256 of its canonical form)
	OpenQuestions  []string
}

// Harvest lifts the computed verdict into the DRAFT record. Pure function of the verdict.
func Harvest(v Verdict) HarvestRecord {
	r := HarvestRecord{
		Proposes:       "entity",
		Go:             v.Go,
		SourceHash:     v.Measurement.SourceHash,
		OutputHash:     v.Measurement.OutputHash,
		ProvenanceKind: "human",
		ProvenanceFrom: "spike:DP01 (spike/stackmanifest)",
		Status:         "draft",
		HasMirror:      false,
		HasVersion:     false,
		OpenQuestions: []string{
			"OQ-DP01-1 forme : le spike score 3 formes par critères DÉCLARÉS (corps, content-address, mur, append-only) ; DP02 doit graver le record kind via records.Hash∘Canonicalize (S02 réutilisé, jamais forké) — le score du spike est un proxy, pas la migration.",
			"OQ-DP01-2 round-trip : le parseur jetable est apparié à l'émetteur jetable ; DP03 doit round-tripper via un AST YAML réel (Target additif TargetDockerCompose / TargetPulumiProgram selon ADR 0043).",
			"OQ-DP01-3 conventions : le spike couvre le sous-ensemble /data/dockers mesurable (container_name, env_file, labels Traefik HTTPS+redirect, volume bind env-var, réseau externe) ; la matrice complète (profils 19 couches SPEC-stack-2026, connecteurs) est l'affaire de DP02–DP05/EPIC E.",
			"OQ-DP01-4 le mur : le spike ne persiste RIEN ; l'écriture réelle du verdict en `ideas` passe par idea_capture (provenance human) — ce record MODÉLISE la capture, il ne l'exécute pas.",
		},
	}
	if v.Go {
		r.Intent = "déclarer la stack émise comme une SOURCE Kernel de premier rang (record kind `stack_manifest`, content-adressé via records.Hash∘Canonicalize, append-only, gouverné par le mur) : la mesure DP01 prouve l'émission byte-identique, le round-trip compose, et la détection de dérive par source-hash qu'un template statique /data/dockers ne porte pas — DP02 peut graver."
	} else {
		r.Intent = "abandonner le StackManifest-as-source : la mesure DP01 prouve qu'un template statique /data/dockers porte les mêmes garanties — ADR d'abandon, la roadmap DP s'arrête honnêtement à DP01."
	}
	r.RecordHash = recordHash(r)
	return r
}

// recordHash content-addresses the record (RecordHash field excluded by construction).
func recordHash(r HarvestRecord) string {
	canon := strings.Join([]string{
		"harvest/dp01/v0",
		"proposes=" + r.Proposes,
		"intent=" + r.Intent,
		fmt.Sprintf("go=%t", r.Go),
		"source_hash=" + r.SourceHash,
		"output_hash=" + r.OutputHash,
		"provenance=" + r.ProvenanceKind + ":" + r.ProvenanceFrom,
		"status=" + r.Status,
		fmt.Sprintf("has_mirror=%t has_version=%t", r.HasMirror, r.HasVersion),
		strings.Join(r.OpenQuestions, "\n"),
	}, "\n")
	sum := sha256.Sum256([]byte(canon))
	return hex.EncodeToString(sum[:])
}
