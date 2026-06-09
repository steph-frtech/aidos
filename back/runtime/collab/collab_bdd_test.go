// collab_bdd_test.go — the S113 acceptance mirror (Godog, N0): drives
// back/tests/runtime/collab.feature. It pins the two named done-criteria DIRECTLY against
// the pure collab authority (the deterministic judge — no DB): a member WITHOUT administer
// authority can never approve (a viewer/editor is refused ROLE_FORBIDDEN, only an owner
// allowed); and a comment is stamped with the REAL acting user (provenance NEVER a
// placeholder — an unidentified actor is refused UNIDENTIFIED_ACTOR).
package collab

import (
	"fmt"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/runtime/membership"
)

type collabState struct {
	project  string
	actor    Actor
	decision Decision
	comment  Comment
	err      error
}

func memberOf(identity, project string, role membership.Role) *membership.Membership {
	m, err := membership.NewMembership(identity, project, role)
	if err != nil {
		panic(err)
	}
	return &m
}

func TestCollabBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "collab",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &collabState{}

			sc.Step(`^un projet "([^"]*)"$`, func(p string) error {
				st.project = p
				return nil
			})
			sc.Step(`^un membre "([^"]*)" avec le rôle "([^"]*)" dans "([^"]*)"$`, func(id, role, proj string) error {
				r := membership.Role(role)
				if !r.IsValid() {
					return fmt.Errorf("rôle invalide %q", role)
				}
				st.actor = Actor{Identity: id, ProjectID: proj, Member: memberOf(id, proj, r)}
				return nil
			})
			sc.Step(`^une identité "([^"]*)" sans adhésion dans "([^"]*)"$`, func(id, proj string) error {
				st.actor = Actor{Identity: id, ProjectID: proj, Member: nil}
				return nil
			})
			sc.Step(`^une identité vide$`, func() error {
				st.actor = Actor{Identity: "", ProjectID: st.project, Member: nil}
				return nil
			})
			sc.Step(`^"([^"]*)" tente d'approuver un changeset$`, func(_ string) error {
				st.decision = Authorize(st.actor, ActApprove)
				return nil
			})
			sc.Step(`^"([^"]*)" commente l'idée "([^"]*)" avec "([^"]*)"$`, func(_, target, body string) error {
				st.comment, st.decision, st.err = st.actor.Comment(TargetIdea, target, body)
				return st.err
			})
			sc.Step(`^cette identité commente l'idée "([^"]*)" avec "([^"]*)"$`, func(target, body string) error {
				st.comment, st.decision, st.err = st.actor.Comment(TargetIdea, target, body)
				return st.err
			})
			sc.Step(`^l'acte est refusé avec "([^"]*)"$`, func(code string) error {
				if st.decision.Verdict != VerdictDeny {
					return fmt.Errorf("attendu DENY, obtenu %s", st.decision.Verdict)
				}
				if st.decision.BlockReason == nil || string(st.decision.BlockReason.Code) != code {
					return fmt.Errorf("attendu code %q, obtenu %+v", code, st.decision.BlockReason)
				}
				if st.decision.BlockReason.Severity == "" || len(st.decision.BlockReason.HowToFix) == 0 {
					return fmt.Errorf("le refus doit être actionnable (severity + how_to_fix): %+v", st.decision.BlockReason)
				}
				return nil
			})
			sc.Step(`^l'acte est autorisé$`, func() error {
				if st.decision.Verdict != VerdictAllow {
					return fmt.Errorf("attendu ALLOW, obtenu %s (%+v)", st.decision.Verdict, st.decision.BlockReason)
				}
				return nil
			})
			sc.Step(`^le commentaire est enregistré avec l'auteur "([^"]*)"$`, func(author string) error {
				if st.decision.Verdict != VerdictAllow {
					return fmt.Errorf("attendu ALLOW, obtenu %s", st.decision.Verdict)
				}
				if st.comment.Author != author {
					return fmt.Errorf("attendu auteur %q, obtenu %q", author, st.comment.Author)
				}
				if st.comment.ID == "" {
					return fmt.Errorf("le commentaire doit être content-addressed (id non vide)")
				}
				return nil
			})
			sc.Step(`^l'auteur n'est jamais un placeholder$`, func() error {
				if st.comment.Author == "" || st.comment.Author == "placeholder" || st.comment.Author == "anonymous" {
					return fmt.Errorf("la provenance est un placeholder: %q", st.comment.Author)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format: "pretty",
			Paths:  []string{"../../tests/runtime/collab.feature"},
		},
	}
	if suite.Run() != 0 {
		t.Fatal("the collab feature is RED")
	}
}
