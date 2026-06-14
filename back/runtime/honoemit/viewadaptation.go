package honoemit

// viewadaptation.go — LE LOOPBACK : vue ENFANT validée → requirement SOFT capitalisée → reproduite.
//
// Modèle (utilisatrice, gravé 2026-06-14) : « comme il y a un LOOPBACK, quand j'ai VALIDÉ une vue
// elle devient requirement complet (PAS au sens fort, mais pour que ça se REPRODUISE) ». Une
// adaptation ENFANT (l'override per-plateforme que portent EmitMobileChildAdapted /
// EmitDesktopChildAdapted — AppName mobile, WindowTitle desktop) que l'humain VALIDE devient une
// requirement CAPITALISÉE : SOFT (pas un invariant, pas une vérité au sens fort), content-adressée,
// append-only, provenancée (qui / quel enfant / quelle maître). Le RECOMPILE l'applique PUREMENT —
// l'enfant reproduit l'override validé sans qu'on le re-saisisse (l'adaptation n'est plus perdue,
// elle fait partie de la spec de l'enfant).
//
// LE MUR / DÉTERMINISME-FIRST (§2/§6/§8). Une adaptation validée = une DÉCISION enregistrée
// (« pas au sens fort »), capitalisée BELOW-THE-LINE — exactement comme une behavior/procédure. La
// capitalisation RÉUTILISE compound.Compound (la MÊME boucle CE03 que les behaviors/procédures, le
// SEUL passage par le mur firewall.ViaIdea → idée → miroir → /goal) — elle ne FORKE pas la boucle,
// n'écrit AUCUNE vérité (Capture.WroteKernel toujours false), ne touche ni la fitness ni un poids.
// Le RECOMPILE (ReproduceWithCapitalised) est une FONCTION PURE, byte-stable : mêmes capitalisations
// ⇒ même enfant ; il ré-applique l'override capitalisé via EmitMobileChildAdapted/EmitDesktopChildAdapted.
//
// ANTI-OVERWRITE §9. Un enfant SANS capitalisation reste BYTE-IDENTIQUE au canonique (la
// reproduction de la forme base = EmitMobileChild/EmitDesktopChild). Le parentId reste TOUJOURS la
// maître (master.Hash()) — l'override est platform-specific, jamais un nouveau besoin : il ne change
// pas la requirement canonique. Calque du modèle HITL envrollback.HumanValidation (DP28) pour la
// porte validation_humaine, et de archive/brain/memory.KindProcedural pour le sink.

import (
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/compound"
)

// AdaptationOverride is the per-platform DIFF an adaptation pins — the smallest surface that bends
// a child's FORM without changing the master requirement. It is the UNION of the sibling override
// shapes (DesktopAdaptation.WindowTitle, MobileAdaptation.AppName) so ONE capitalised requirement
// can reconstruct the right per-platform adaptation at recompile time. A field is applied iff the
// capitalised requirement targets that child (ChildDesktop reads WindowTitle, ChildMobile reads
// AppName). The web child's form is frozen (EmitWebApp) — it carries no override yet. Empty = the
// canonical form (no override).
type AdaptationOverride struct {
	// WindowTitle is the desktop child's BrowserWindow title override (DesktopAdaptation.WindowTitle).
	// Read only when the requirement targets ChildDesktop. Empty → the project name (the default).
	WindowTitle string `json:"window_title,omitempty"`
	// AppName is the mobile child's displayed Expo app name override (MobileAdaptation.AppName).
	// Read only when the requirement targets ChildMobile. Empty → the project name (the default).
	AppName string `json:"app_name,omitempty"`
}

// ViewAdaptation is the SOFT capitalised requirement the loopback persists — a validated per-platform
// adaptation captured so a recompile REPRODUCES it deterministically. It is content-addressed (ID =
// records.Hash of the canonical body) and append-only: capitalising a validation is a recorded
// DECISION, never an edit (anti-overwrite §9, calque envrollback.HumanValidation DP28). NOT a truth
// at the strong sense — no version-freeze, no mirror; it lives below the line like a procedural
// memory. The ParentID stays the MASTER (the adaptation never bends the canonical requirement).
type ViewAdaptation struct {
	// ID is the content address of the whole adaptation (the idempotency key). Empty until capitalised
	// (CapitaliseViewAdaptation stamps it); same (target, parent, override, validation) → same ID.
	ID string `json:"id,omitempty"`
	// ChildTarget is the platform the adaptation applies to (ChildMobile / ChildDesktop). The
	// recompile reads the matching override field for this target. ChildWeb carries no override (its
	// form is frozen) — a web target reproduces the byte-identical web child.
	ChildTarget ChildTarget `json:"child_target"`
	// ParentID is the content address of the MASTER (master.Hash()) — the `composes` edge (S18). The
	// adaptation NEVER changes it: the master is the same requirement, the override is platform-only.
	ParentID string `json:"parent_id"`
	// Override is the per-platform diff (WindowTitle / AppName) the adaptation pins (the soft spec).
	Override AdaptationOverride `json:"override"`
	// Validated is true iff a human validation_humaine validated the override (the loopback trigger).
	// CapitaliseViewAdaptation sets it from the AdaptationValidation; a non-validated adaptation is
	// never capitalised (Capitalised stays false).
	Validated bool `json:"validated"`
	// By records WHO validated the adaptation (provenance §9 — defaults to "human", never empty).
	By string `json:"by"`
}

// AdaptationValidation is the « validation_humaine » over a CHILD VIEW adaptation (the HITL trigger
// of the loopback, calque envrollback.HumanValidation DP28). The human SAW the live child view with
// the override and validated|refused it. PURE input — no clock (determinism-first §6); the writer
// role stamps the time at ChangeSet-apply.
type AdaptationValidation struct {
	// Validated is the human verdict: true = « j'ai vu la vue enfant adaptée et je la valide », false
	// = refusée. Only true capitalises the adaptation (fail-closed — false capitalises nothing).
	Validated bool `json:"validated"`
	// By is the human/role recording the decision (defaults to "human" — provenance §9, never empty).
	By string `json:"by,omitempty"`
}

// CapitalisedAdaptation is the result of CapitaliseViewAdaptation: whether the adaptation was
// capitalised, the content-addressed soft requirement (when capitalised), and the compound.Capture
// the SAME CE03 loop emitted (a procedural recall + a behavior candidate via the wall — NO kernel
// write). VALUES only; it WRITES NOTHING (the wall).
type CapitalisedAdaptation struct {
	// Capitalised is true iff the validation validated the adaptation (the loopback fired). A
	// non-validated adaptation yields Capitalised=false, an empty Requirement, an empty Capture.
	Capitalised bool `json:"capitalised"`
	// Requirement is the content-addressed, append-only soft requirement (the capitalised override).
	// Zero value when not capitalised — the recompile then applies no override (the child stays base).
	Requirement ViewAdaptation `json:"requirement"`
	// Capture is what compound.Compound emitted for the captured motif — a procedural memory
	// write-input + a behavior-candidate idea (via firewall.ViaIdea). WroteKernel is always false.
	Capture compound.Capture `json:"-"`
}

// adaptationBody is the content-addressed JSONB shape of an adaptation (the body the ID hashes over).
// PURE: same (target, parent, override, validation) → same bytes → same ID. Anti-overwrite §9: a
// changed override OR a changed target yields a new requirement node, never an in-place mutation.
func adaptationBody(a ViewAdaptation) map[string]any {
	return map[string]any{
		"child_target": string(a.ChildTarget),
		"parent_id":    a.ParentID,
		"override":     a.Override,
		"validated":    a.Validated,
		"by":           a.By,
	}
}

// CapitaliseViewAdaptation is the LOOPBACK capture: on a VALIDATED human validation_humaine over a
// child view adaptation, it RECORDS the adaptation as a soft, content-addressed, append-only
// requirement AND capitalises its motif through compound.Compound (the SAME CE03 loop as the
// behaviors/procedures — the only door is firewall.ViaIdea, no kernel write). A NON-validated
// adaptation capitalises NOTHING (Capitalised=false, empty Requirement, empty Capture — the child
// stays base; fail-closed). PURE, TOTAL: same (adaptation, validation) → byte-identical result.
//
// REUSE, DON'T REINVENT (ADR 0007): the capture is NOT a new loop — it builds a compound.GoalClose
// whose gesture/spec patterns describe the validated adaptation, and runs the existing
// compound.Compound (CE03). The captured pattern lands below the line (a KindProcedural recall) +
// proposes a behavior candidate via the wall, exactly like any other goal motif.
func CapitaliseViewAdaptation(a ViewAdaptation, v AdaptationValidation) (CapitalisedAdaptation, error) {
	by := v.By
	if by == "" {
		by = "human"
	}

	if !v.Validated {
		// Fail-closed: a refused (or absent) validation capitalises nothing. The child stays base —
		// the override is NOT a recorded requirement (anti-overwrite §9, no silent capture).
		return CapitalisedAdaptation{Capitalised: false}, nil
	}

	// Record the soft requirement: stamp Validated + By, then content-address the whole body. Same
	// input → same ID (idempotent, append-only — recording it twice yields the same node, not an edit).
	req := a
	req.Validated = true
	req.By = by
	canon, err := records.Canonicalize(mustJSON(adaptationBody(req)))
	if err != nil {
		return CapitalisedAdaptation{}, fmt.Errorf("capitalise view adaptation: address body: %w", err)
	}
	req.ID = records.Hash(canon)

	// Capitalise the motif through the EXISTING CE03 loop (compound.Compound) — the SAME boundary
	// the behaviors/procedures cross. The gesture motif is the loopback gesture (a procedural recall);
	// the spec motif is the captured override-as-soft-requirement (a behavior candidate via the wall).
	// Green=true: a validated adaptation is a CLOSE event (the human's validation IS the close).
	cap, err := compound.Compound(compound.GoalClose{
		GoalID:         "view-adaptation:" + req.ID,
		Branch:         "main",
		Green:          true,
		GesturePattern: capitalisationGesturePattern(req),
		SpecPattern:    capitalisationSpecPattern(req),
	})
	if err != nil {
		return CapitalisedAdaptation{}, fmt.Errorf("capitalise view adaptation: compound capture: %w", err)
	}

	return CapitalisedAdaptation{
		Capitalised: true,
		Requirement: req,
		Capture:     cap,
	}, nil
}

// capitalisationGesturePattern renders the loopback GESTURE motif (the procedural recall) for the
// validated adaptation — the ordered units a recompile of a similar child replays instead of
// re-deriving. Deterministic (fixed units, the child target verbatim).
func capitalisationGesturePattern(a ViewAdaptation) []string {
	return []string{
		"observe_validated_child_view:" + string(a.ChildTarget),
		"capture_per_platform_override",
		"content_address_soft_requirement",
		"recompile_child_with_capitalised",
	}
}

// capitalisationSpecPattern renders the loopback SPEC motif (the behavior candidate proposed via the
// wall) — the captured override as a reusable soft-requirement shape. Deterministic.
func capitalisationSpecPattern(a ViewAdaptation) []string {
	return []string{
		"per_platform_adaptation:" + string(a.ChildTarget),
		"reproduce_validated_override",
	}
}

// ReproduceWithCapitalised RECOMPILES a child from the master, APPLYING the capitalised adaptations
// for that child target (the loopback's reproduction). PURE, TOTAL, byte-stable: same (master,
// target, capitalised) → byte-identical child. It reconstructs the per-platform adaptation from the
// capitalised override and calls the EXISTING EmitMobileChildAdapted / EmitDesktopChildAdapted —
// reusing the emitters, never re-deriving the form. The reproduced child reproduces the VALIDATED
// override without it being re-entered.
//
//   - No capitalised adaptation for the target ⇒ the canonical (base) child, byte-identical to
//     EmitMobileChild / EmitDesktopChild (anti-overwrite §9 — an un-adapted child never bends).
//   - The parentId stays the MASTER (master.Hash()) regardless of the override (the override is
//     platform-specific, not a new requirement — the canonical requirement is invariant).
//
// Only the capitalisations TARGETING childTarget AND parented to THIS master (ParentID == master.Hash())
// AND Validated are applied — a capitalisation of another child / another master / a non-validated one
// is ignored (the determinism + provenance frontier). The last matching capitalisation wins (append-only:
// a later recorded validation supersedes an earlier one for the same target).
func ReproduceWithCapitalised(m MasterView, childTarget ChildTarget, capitalised []ViewAdaptation) (ChildView, *blockreason.BlockReason) {
	override := resolveOverride(m, childTarget, capitalised)

	switch childTarget {
	case ChildMobile:
		child, br := EmitMobileChildAdapted(m, MobileAdaptation{AppName: override.AppName})
		if br != nil {
			return ChildView{}, br
		}
		return ChildView{Target: ChildMobile, ParentID: child.ParentID, MasterHash: child.MasterHash, Artifacts: child.Artifacts}, nil
	case ChildDesktop:
		child, br := EmitDesktopChildAdapted(m, DesktopAdaptation{WindowTitle: override.WindowTitle})
		if br != nil {
			return ChildView{}, br
		}
		return ChildView{Target: ChildDesktop, ParentID: child.ParentID, MasterHash: child.MasterHash, Artifacts: child.Artifacts}, nil
	case ChildWeb:
		// The web child's form is frozen (EmitWebApp byte-identical) — it carries no override. The
		// reproduction is the byte-identical web child (anti-overwrite §9). We cannot rebuild the
		// WebAppSpec from the MasterView, so a web reproduction needs the spec; refuse honestly.
		br := blockReproduceWeb()
		return ChildView{}, &br
	default:
		br := blockReproduceUnknownTarget(childTarget)
		return ChildView{}, &br
	}
}

// ChildView is the uniform shape ReproduceWithCapitalised returns for ANY child target (mobile /
// desktop) — the reproduced artifacts + the parent linkage. It mirrors the MobileChild/DesktopChild
// shapes (Target + ParentID + MasterHash + Artifacts) so the call sites read one type regardless of
// the platform. The ParentID is ALWAYS the master (the override never bends it).
type ChildView struct {
	// Target is the platform the reproduced child adapts (ChildMobile / ChildDesktop).
	Target ChildTarget `json:"target"`
	// ParentID is the content address of the master (master.Hash()) — the `composes` edge (S18). The
	// override never changes it.
	ParentID string `json:"parent_id"`
	// MasterHash is an alias of ParentID kept explicit (the family signature). Always == ParentID.
	MasterHash string `json:"master_hash"`
	// Artifacts are the reproduced child files (byte-stable, content-addressed). Byte-identical to the
	// base child when no capitalisation applies; byte-equal to the validated child when one does.
	Artifacts []Artifact `json:"artifacts"`
}

// resolveOverride collapses the capitalised adaptations into the ONE per-platform override to apply
// for the target — a PURE fold over the corpus. Only capitalisations that (1) target this child, (2)
// are parented to THIS master (ParentID == master.Hash()), and (3) are Validated are applied; the
// rest are ignored (the provenance frontier — a capitalisation of another master/child never leaks).
// The capitalisations are processed in content-address (ID) order for determinism, last match wins
// (append-only supersession). An empty corpus yields the empty override (the canonical base form).
func resolveOverride(m MasterView, childTarget ChildTarget, capitalised []ViewAdaptation) AdaptationOverride {
	parent := m.Hash()
	matching := make([]ViewAdaptation, 0, len(capitalised))
	for _, c := range capitalised {
		if c.ChildTarget == childTarget && c.ParentID == parent && c.Validated {
			matching = append(matching, c)
		}
	}
	// Deterministic order: by content-address ID (stable, no input-order leak). The id may be empty
	// for a hand-built capitalisation (the property test passes Validated values without an ID); fall
	// back to the override fields so the tie-break stays total.
	sort.SliceStable(matching, func(i, j int) bool {
		if matching[i].ID != matching[j].ID {
			return matching[i].ID < matching[j].ID
		}
		return overrideKey(matching[i].Override) < overrideKey(matching[j].Override)
	})

	var out AdaptationOverride
	for _, c := range matching {
		// Last match wins (append-only supersession). Only the field for the target is meaningful.
		switch childTarget {
		case ChildDesktop:
			out.WindowTitle = c.Override.WindowTitle
		case ChildMobile:
			out.AppName = c.Override.AppName
		}
	}
	return out
}

// overrideKey is a stable string key for an override (the deterministic tie-break when two
// capitalisations share an ID). PURE.
func overrideKey(o AdaptationOverride) string {
	return o.WindowTitle + "\x00" + o.AppName
}

// blockReproduceWeb is the honest refusal for a web reproduction: the web child's form is frozen
// (EmitWebApp byte-identical) and is rebuilt from the WebAppSpec, not the MasterView — the loopback
// reproduction targets the ADAPTABLE children (mobile / desktop), the only ones with an override
// point. No prison: the how_to_fix names the right door.
func blockReproduceWeb() blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Reproduction du WEB CHILD refusée : le web child n'a PAS de point d'adaptation (sa forme est " +
			"gelée — EmitWebApp byte-identique, anti-overwrite §9). Le loopback reproduit les enfants ADAPTABLES " +
			"(mobile / desktop), les seuls portant un override per-plateforme.",
		HowToFix: []string{
			"use_emit_web_child : pour le web, appelez EmitWebChild(spec) — sa forme est byte-identique, sans override.",
			"target_mobile_or_desktop : ReproduceWithCapitalised cible ChildMobile ou ChildDesktop (les enfants adaptables).",
		},
	}
}

// blockReproduceUnknownTarget is the honest refusal for an unknown child target (the closed enum is
// web / mobile / desktop — nothing invented). No prison.
func blockReproduceUnknownTarget(target ChildTarget) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Reproduction refusée : la cible enfant " + string(target) + " est inconnue. L'ensemble est CLOS " +
			"(web / mobile / desktop) — le loopback n'invente aucune plateforme (honnêteté, le mur §8).",
		HowToFix: []string{
			"use_a_known_child : ciblez ChildWeb, ChildMobile ou ChildDesktop.",
		},
	}
}
