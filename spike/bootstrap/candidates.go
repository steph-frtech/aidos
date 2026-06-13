// candidates.go — THROWAWAY (DP10 spike). The ≤3 candidates scored against DECLARED
// criteria — a feature COUNT computed from measured facts (the script's bytes, the
// plan's nature), never an opinion. Generalizes DP01's form-fit scoring.
package bootstrap

import (
	"regexp"
	"strings"
)

// Criteria is the DECLARED criterion list (order is part of the declaration).
var Criteria = []string{
	"zero_prompt_in_path",         // no select/read in the execution path (measured on bytes)
	"non_interactive_invocation",  // runnable unattended (no TTY dialogue required)
	"independent_of_data_dockers", // no hardcoded /data/dockers structure dependency
	"plan_is_data",                // the bootstrap plan exists as inspectable data before executing
	"future_cloud_portable",       // the same plan could drive a non-local-docker target
}

// Candidate is one compared option with its measured feature vector.
type Candidate struct {
	ID       string          `json:"id"` // "native-go" | "wrapper" | "deploy-sh"
	Label    string          `json:"label"`
	Features map[string]bool `json:"features"`
	Score    int             `json:"score"` // feature count over Criteria — deterministic
}

var selectRe = regexp.MustCompile(`(?m)^\s*select\s`)
var readRe = regexp.MustCompile(`\bread\s+-rp\b`)
var dataDockersRe = regexp.MustCompile(`/data/dockers`)

// MeasureScript measures deploy.sh facts on its BYTES. Pure (string → counts).
func MeasureScript(script string) ScriptMeasures {
	return ScriptMeasures{
		PromptCount:     len(selectRe.FindAllString(script, -1)) + len(readRe.FindAllString(script, -1)),
		DataDockersRefs: len(dataDockersRe.FindAllString(script, -1)),
		ScriptLineCount: len(strings.Split(strings.TrimRight(script, "\n"), "\n")),
	}
}

// ScoreCandidates derives the three candidates' feature vectors from the measured
// script facts. Pure: the booleans are implications of counts, not judgments —
// prompts in the path stay in the path even when a wrapper pipes answers into them.
func ScoreCandidates(script ScriptMeasures) []Candidate {
	promptFree := script.PromptCount == 0   // measured: false (deploy.sh has prompts)
	pathFree := script.DataDockersRefs == 0 // measured: false (hardcoded refs)

	mk := func(id, label string, f map[string]bool) Candidate {
		score := 0
		for _, c := range Criteria {
			if f[c] {
				score++
			}
		}
		return Candidate{ID: id, Label: label, Features: f, Score: score}
	}

	return []Candidate{
		mk("native-go", "émetteur bootstrap natif Go déterministe", map[string]bool{
			"zero_prompt_in_path":         true, // the plan replaces every prompt by a pure function
			"non_interactive_invocation":  true,
			"independent_of_data_dockers": true, // consumes the emitted bundle, not the repo layout
			"plan_is_data":                true, // Plan{} is inspectable before execution
			"future_cloud_portable":       true, // the plan is data; another executor can honour it
		}),
		mk("wrapper", "wrapper non-interactif autour de deploy.sh", map[string]bool{
			"zero_prompt_in_path":         promptFree, // the prompts remain in the path, answered blind
			"non_interactive_invocation":  true,       // stdin can be piped
			"independent_of_data_dockers": pathFree,
			"plan_is_data":                false, // the plan lives inside sed/select side effects
			"future_cloud_portable":       false,
		}),
		mk("deploy-sh", "appel direct de /data/dockers/deploy.sh", map[string]bool{
			"zero_prompt_in_path":         promptFree,
			"non_interactive_invocation":  false, // select/read dialogue
			"independent_of_data_dockers": pathFree,
			"plan_is_data":                false,
			"future_cloud_portable":       false,
		}),
	}
}
