// account.go — the S61 ACCOUNT MODEL: the content-addressed accounts.users record
// (id, email, identity_provider) and its deterministic construction. The `accounts`
// schema is auth's OWN below-the-line zone — never the Kernel (ROADMAP S61). A user
// record is content-addressed and append-only, exactly like a project (S53): its id is
// the SHA-256 of its canonical body, so the SAME (email, provider) always lands under the
// SAME address (idempotent) and a change writes a NEW row.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): NewUser is a PURE function — canonical JSON →
// content hash. Same input ⇒ byte-identical record (the reproducibility property pins
// it). No clock, no rng, no LLM enters the identity model.
package authn

import (
	"encoding/json"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// UserBodyKind is the discriminator stored in the canonical body — "user". It keeps the
// content address namespaced (a user and a project with the same fields never collide).
const UserBodyKind = "user"

// User is a row of the accounts.users table — the account model the roadmap names
// (id, email, identity_provider). It is BELOW the wall: the agent role may read/write the
// `accounts` schema, never kernel/mirrors/fitness. The Identity that propagates to both
// walls (gateway scope + RLS GUC) is exactly User.ID.
type User struct {
	// ID is the content address (SHA-256 hex of the canonical body) — also the stable
	// subject the RLS app.identity GUC and projectwall.Scope.Identity key on.
	ID string `json:"id"`
	// Email is the verified email claim from the OIDC provider.
	Email string `json:"email"`
	// Provider is the OIDC issuer that vouched for this user.
	Provider IdentityProvider `json:"identity_provider"`
}

// userBody is the canonical JSON the user id is hashed over. Field order is fixed; the
// records.Canonicalize re-marshals with sorted keys, so the hash is stable under key
// reordering. The `kind` discriminator namespaces the address.
type userBody struct {
	Kind     string `json:"kind"`
	Email    string `json:"email"`
	Provider string `json:"identity_provider"`
}

// NewUser builds a content-addressed User from a verified (email, provider). PURE and
// total: the id is records.Hash(canonical body), so the same input yields a byte-identical
// record (idempotent — re-issuing the same user lands the same row). It writes NOTHING;
// persistence into the `accounts` schema is the HTTP server's below-the-line store path.
func NewUser(email string, provider IdentityProvider) (User, error) {
	body := userBody{Kind: UserBodyKind, Email: email, Provider: string(provider)}
	raw, err := json.Marshal(body)
	if err != nil {
		return User{}, err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return User{}, err
	}
	return User{ID: records.Hash(canon), Email: email, Provider: provider}, nil
}

// AsPrincipal projects a stored User to the Principal that propagates to both walls. PURE.
func (u User) AsPrincipal() Principal {
	return Principal{Identity: u.ID, Email: u.Email, Provider: u.Provider}
}
