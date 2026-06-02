package webcomponent

import (
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// validateBind proves the control-spec and the action-spec AGREE — the only place the
// two prior truths are checked to bind. It NEVER invents the missing link (honesty):
//
//   - the control must pin a name, a view, and both conditions (else the AST is malformed);
//   - the control's `triggers` must resolve to the bound action's name (no orphan trigger);
//   - the action's `on` must be a click on THIS control (no foreign / non-click bind).
//
// Any failure is a BlockReason (the S13 shape, reusing CodeOutOfScope — the S13 enum is
// closed and adding a code is a ChangeSet+ADR, out of scope here), never a panic, never
// a guessed default.
func validateBind(c control.Control, a action.Action) *blockreason.BlockReason {
	if c.Name == "" {
		br := blockMalformed(fmt.Errorf("control: missing name"))
		return &br
	}
	if c.View == "" {
		br := blockMalformed(fmt.Errorf("control: missing view"))
		return &br
	}
	if c.VisibleWhen == nil || c.EnabledWhen == nil {
		br := blockMalformed(control.ErrMissingCondition)
		return &br
	}
	// The control's trigger must resolve to the bound action (no orphan trigger).
	if c.Triggers != a.Name {
		br := blockOrphanBind(fmt.Sprintf(
			"le control %q déclenche l'action %q, mais l'action fournie est %q",
			c.Name, c.Triggers, a.Name))
		return &br
	}
	// The action must fire on a click of THIS control (no foreign / non-click bind).
	if a.On.Kind != action.EventClick {
		br := blockOrphanBind(fmt.Sprintf(
			"l'action %q se déclenche sur l'évènement %q ; seul click est projetable",
			a.Name, a.On.Kind))
		return &br
	}
	if a.On.Control != c.Name {
		br := blockOrphanBind(fmt.Sprintf(
			"l'action %q se déclenche sur le control %q, pas sur %q",
			a.Name, a.On.Control, c.Name))
		return &br
	}
	if a.Invoke == "" {
		br := blockOrphanBind(fmt.Sprintf("l'action %q n'épingle aucune opération à invoquer", a.Name))
		return &br
	}
	return nil
}

// blockMalformed renders the canonical BlockReason for a malformed/empty control or
// action AST — reusing the S13 shape and a non-empty French how_to_fix (no prison).
func blockMalformed(cause error) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Projection web refusée : la source (control-spec / action-spec) est malformée ou vide (" +
			cause.Error() + "). Un emitter REND exactement ce que la source épingle ; il n'invente jamais une vue, " +
			"un libellé, une condition ou un bind (honnêteté). Une source incomplète n'est pas projetable.",
		HowToFix: []string{
			"pin_the_control_ast : complétez le control-spec dans le kernel (view + label + visible_when + enabled_when + triggers).",
			"pin_the_action_ast : complétez l'action-spec (on:click(control) + invoke:operation).",
			"rerun /web-project : relancez l'émission une fois les deux sources complètes.",
		},
	}
}

// blockOrphanBind renders the canonical BlockReason for a control/action whose link does
// not resolve — the trigger does not name the action, or the action does not fire on
// this control's click. It NEVER invents the missing bind.
func blockOrphanBind(detail string) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Projection web refusée : le control-spec et l'action-spec ne se lient pas (" + detail +
			"). Le bouton est la PROJECTION du control + de l'action (S11) ; l'emitter ne projette que si le " +
			"`triggers` du control résout l'action et si l'action se déclenche sur le click de ce control. " +
			"Un bind orphelin est un monstre — jamais inventé.",
		HowToFix: []string{
			"align_the_trigger : faites pointer control.triggers sur le nom de l'action liée.",
			"align_the_on : faites pointer action.on sur click(<ce control>).",
			"rerun /web-project : relancez l'émission une fois le lien control→action résolu.",
		},
	}
}

// blockUnknownTarget renders the canonical BlockReason for a target outside the closed
// set (only ts-next is projectable here).
func blockUnknownTarget(t string) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Projection web refusée : la cible " + t + " est hors du jeu fermé. L'emitter web projette " +
			"uniquement la cible ts-next (un composant Next.js) pour kind=control ; le jeu cible × kind croît " +
			"de façon additive, jamais inventé.",
		HowToFix: []string{
			"use_ts_next : passez la cible \"ts-next\" — la seule cible que l'emitter web connaît.",
		},
	}
}
