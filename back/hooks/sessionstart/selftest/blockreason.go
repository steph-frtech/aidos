package selftest

import "github.com/steph-frtech/aidos/back/runtime/blockreason"

// The self-test's own block codes. They REUSE the S13 blockreason.BlockReason SHAPE
// (code, severity, explanation, how_to_fix[] — CLAUDE.md §2) but are declared LOCALLY,
// following the established hook precedent (pretooluse, posttooluse, ci-ratchet each
// declare their hook-specific codes locally rather than mutating S13's CLOSED enum in
// place — the anti-overwrite rule §9: extending S13's enum would need a ChangeSet +
// SemanticDiff). These three codes are the three guarantees of the meta-meta self-test;
// each names the door out (no BlockReason is a prison, KRD §44.5).
const (
	// CodeMutedSensor — a watched check no longer fires on its injected fault: a
	// guardrail was REMOVED (the méta loop may only ADD one — CLAUDE.md §5; KRD §70).
	// A dead sensor (CLAUDE.md §5) reddens the self-test. Also covers a missing/empty
	// sensor inventory (an empty inventory cannot prove the sensors fire).
	CodeMutedSensor blockreason.Code = "MUTED_SENSOR"
	// CodeWallBreached — an agent-role write above the line (kernel / mirrors /
	// fitness) was ACCEPTED: the wall (S04, CLAUDE.md §2) no longer holds. The agent
	// could write truth.
	CodeWallBreached blockreason.Code = "WALL_BREACHED"
	// CodeFitnessMutated — the recomputed fitness content-hash differs from the graven
	// baseline: a loop edited its own fitness (the cardinal sin, KRD §70). NIVEAU 3 is
	// inviolable — no loop edits the definition of "passed".
	CodeFitnessMutated blockreason.Code = "FITNESS_MUTATED"
)

// mutedSensorBlockReason names the dead/muted sensor(s) and how to revive them.
func mutedSensorBlockReason(r SelfTestReport) blockreason.BlockReason {
	muted := mutedSensorIDs(r)
	explanation := "Self-test méta-méta (KRD §70) : un garde-fou a été RETIRÉ — un capteur surveillé " +
		"ne se déclenche plus sur sa faute injectée (le miroir du miroir, KRD §60 : « est-ce que ce " +
		"détecteur détecte ? »). La boucle méta peut AJOUTER un garde-fou, JAMAIS en RETIRER un " +
		"(CLAUDE.md §5). Un capteur qui reste vert sur une casse injectée est mort."
	if len(muted) == 0 {
		explanation = "Self-test méta-méta (KRD §70) : l'inventaire des capteurs est VIDE — on ne peut " +
			"pas prouver que les capteurs se déclenchent sans inventaire (S07). Un inventaire manquant " +
			"est un garde-fou retiré."
	} else {
		explanation += " Capteur(s) muet(s) : " + joinIDs(muted) + "."
	}
	return blockreason.BlockReason{
		Code:        CodeMutedSensor,
		Severity:    blockreason.SeverityBlocking,
		Explanation: explanation,
		HowToFix: []string{
			"revive_sensor : réparez ou re-câblez le capteur muet — il doit virer au rouge sur sa faute injectée (S07, CLAUDE.md §5).",
			"add_never_remove : un artefact méta peut AJOUTER un garde-fou, jamais en retirer un — restaurez le garde-fou retiré (KRD §70).",
			"rerun /self-test : rejouez le self-test ; la session démarre quand chaque capteur se déclenche, le mur refuse, et la fitness est inchangée.",
		},
	}
}

// wallBreachedBlockReason names the breached schema(s) and how to restore the wall.
func wallBreachedBlockReason(r SelfTestReport) blockreason.BlockReason {
	breached := breachedSchemas(r)
	return blockreason.BlockReason{
		Code:     CodeWallBreached,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Self-test méta-méta (KRD §70) : le MUR ne tient plus — une écriture de l'agent " +
			"au-dessus de la ligne de flottaison (" + joinIDs(breached) + ") a été ACCEPTÉE. L'agent " +
			"pourrait écrire la vérité (kernel / mirrors / fitness — CLAUDE.md §2). Seul le rôle `aidos`, " +
			"via un ChangeSet approuvé, écrit la vérité.",
		HowToFix: []string{
			"restore_grants : ré-appliquez les GRANTs du mur (S04) — l'agent n'a AUCUN INSERT/UPDATE/DELETE au-dessus de la ligne ; rejouez la migration wall_grants_baseline.sql.",
			"check_pretooluse : vérifiez que le hook PreToolUse (S04) refuse toujours l'écriture above-the-line avant qu'elle n'atteigne la base.",
			"rerun /self-test : rejouez le self-test ; la session démarre quand le mur refuse sur kernel ∧ mirrors ∧ fitness.",
		},
	}
}

// fitnessMutatedBlockReason surfaces the baseline-vs-current hash mismatch.
func fitnessMutatedBlockReason(r SelfTestReport) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     CodeFitnessMutated,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Self-test méta-méta (KRD §70, le péché cardinal) : la FITNESS a été MODIFIÉE — le " +
			"hash de contenu recalculé Hash(Canonicalize(fitness rows)) (" + shortHash(r.FitnessProbe.CurrentHash) +
			") diffère de la baseline gravée (" + shortHash(r.FitnessProbe.BaselineHash) + "). Le NIVEAU 3 " +
			"(définition de « réussi ») est INVIOLABLE : aucune boucle n'édite sa propre fitness ; l'humain " +
			"+ la réalité en sont les seuls propriétaires, il n'y a pas de niveau 4.",
		HowToFix: []string{
			"revert_fitness : restaurez le schéma `fitness` à sa baseline gravée — aucune boucle ne peut éditer la définition de « réussi » (KRD §70).",
			"trace_the_edit : retrouvez le ChangeSet/override qui a touché la fitness ; une modification de fitness n'est légitime que par décision humaine enregistrée (ChangeSet + ADR + provenance, CLAUDE.md §8).",
			"rerun /self-test : rejouez le self-test ; la session démarre quand current_hash == baseline_hash.",
		},
	}
}

func mutedSensorIDs(r SelfTestReport) []string {
	var out []string
	for _, s := range r.SensorsChecked {
		if !s.Fired {
			out = append(out, s.SensorID)
		}
	}
	return out
}

func breachedSchemas(r SelfTestReport) []string {
	var out []string
	for _, a := range r.WallProbe.Attempts {
		if !a.Refused {
			out = append(out, a.Schema)
		}
	}
	return out
}

func joinIDs(ids []string) string {
	out := ""
	for i, id := range ids {
		if i > 0 {
			out += ", "
		}
		out += id
	}
	return out
}

func shortHash(h string) string {
	if len(h) > 12 {
		return h[:12] + "…"
	}
	if h == "" {
		return "(vide)"
	}
	return h
}

// SelfTestUnavailableBlockReason is returned when the harness cannot be built (no DB
// wiring, no pinned fitness baseline): the self-test FAILS CLOSED — a guarantee that
// cannot be PROVEN must not let the session start (KRD §82 .passthrough() anti-pattern).
var SelfTestUnavailableBlockReason = blockreason.BlockReason{
	Code:     CodeMutedSensor,
	Severity: blockreason.SeverityBlocking,
	Explanation: "Self-test méta-méta indisponible : impossible de construire le harness (base non " +
		"câblée ou baseline de fitness non épinglée). Le self-test échoue fermé — une garantie qui ne " +
		"peut pas être PROUVÉE ne laisse pas démarrer la session (KRD §82). On n'invente jamais une " +
		"baseline (honnêteté, CLAUDE.md §8).",
	HowToFix: []string{
		"wire_database : exportez DATABASE_URL vers le truth-store Postgres (les schémas kernel/mirrors/fitness + runtime).",
		"pin_baseline : exportez SELF_TEST_FITNESS_BASELINE = la baseline gravée Hash(Canonicalize(fitness rows)) — jamais une valeur devinée.",
		"rerun /self-test : rejouez le self-test une fois le harness câblé ; la session démarre quand les trois garanties tiennent.",
	},
}

// CanonicalSensorInventory is the S07 sensor inventory the self-test fault-injects. It
// is the PostToolUse computational suite (back/hooks/posttooluse CanonicalChecks) —
// this step PROBES that inventory, it does not coin a new sensor.
func CanonicalSensorInventory() []string {
	return []string{"gofmt", "vet", "lint", "archtest", "affected"}
}
