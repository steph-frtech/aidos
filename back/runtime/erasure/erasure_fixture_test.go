// erasure_fixture_test.go — the S116 acceptance mirror (N0, fixture form: scenario → erasure →
// observable facts). It PROVES the step's Godog done-criteria mechanically:
//   - "un export rend toutes les données d'une personne" — Export returns every PII field;
//   - "une suppression rend la PII irrécupérable tout en préservant l'append-only (le hash de
//     phase reste valide, le contenu PII est shredé)" — Erase shreds the key + tombstones the
//     ciphertext, the structure survives verbatim, PhaseHash is UNCHANGED across erasure;
//   - the two plans (account hard-delete; emitted-app data-subject) both reconcile;
//   - "une décision enregistrée" — the ErasureDecision is content-addressed.
//
// mirror record: reflects=S116-gdpr-export-erasure, test_kind=acceptance, cert_language=fixture,
//
//	liveness=live
package erasure

import "testing"

// sampleStore is the canonical fixture: an account "acct-1" with two projects, plus an emitted
// app "shop" with two end-users — a cross-project, cross-plan PII landscape.
func sampleStore() []Cell {
	return []Cell{
		// account "acct-1", project p1 — the account holder's own PII.
		{Plan: PlanAccount, Subject: "acct-1", Project: "p1", RowID: "a-1", Structure: "users/shape",
			Pii: []PiiCipher{
				{Path: "email", Ciphertext: "enc(alice@ex.com)", KeyID: "k-acct-1", Plaintext: "alice@ex.com"},
				{Path: "name", Ciphertext: "enc(Alice)", KeyID: "k-acct-1", Plaintext: "Alice"},
			}},
		// account "acct-1", project p2 — same subject, second project (hard-delete reaches both).
		{Plan: PlanAccount, Subject: "acct-1", Project: "p2", RowID: "a-2", Structure: "profile/shape",
			Pii: []PiiCipher{
				{Path: "phone", Ciphertext: "enc(555)", KeyID: "k-acct-1", Plaintext: "555-0100"},
			}},
		// a DIFFERENT account — must never be touched by acct-1's erasure.
		{Plan: PlanAccount, Subject: "acct-2", Project: "p9", RowID: "a-9", Structure: "users/shape",
			Pii: []PiiCipher{{Path: "email", Ciphertext: "enc(bob@ex.com)", KeyID: "k-acct-2", Plaintext: "bob@ex.com"}}},
		// emitted-app "shop", end-user "u-7" — the data-subject of the BUILT app.
		{Plan: PlanApp, Subject: "u-7", App: "shop", Project: "p1", RowID: "s-7", Structure: "customer/shape",
			Pii: []PiiCipher{
				{Path: "email", Ciphertext: "enc(carol@ex.com)", KeyID: "k-u-7", Plaintext: "carol@ex.com"},
				{Path: "address", Ciphertext: "enc(1 St)", KeyID: "k-u-7", Plaintext: "1 St"},
			}},
		// emitted-app "shop", a DIFFERENT end-user — must never be touched by u-7's erasure.
		{Plan: PlanApp, Subject: "u-8", App: "shop", Project: "p1", RowID: "s-8", Structure: "customer/shape",
			Pii: []PiiCipher{{Path: "email", Ciphertext: "enc(dave@ex.com)", KeyID: "k-u-8", Plaintext: "dave@ex.com"}}},
	}
}

// SCENARIO: an export renders ALL data of a person (account plan).
func TestFixture_ExportAccount_RendersAllData(t *testing.T) {
	rows := Export(Scope{Plan: PlanAccount, Subject: "acct-1"}, sampleStore())
	// Two rows (p1, p2), three PII fields total (email, name, phone).
	if len(rows) != 2 {
		t.Fatalf("export rows = %d, want 2", len(rows))
	}
	got := map[string]string{}
	for _, r := range rows {
		for _, f := range r.Fields {
			got[f.Path] = f.Value
		}
	}
	for path, want := range map[string]string{"email": "alice@ex.com", "name": "Alice", "phone": "555-0100"} {
		if got[path] != want {
			t.Fatalf("export[%s] = %q, want %q", path, got[path], want)
		}
	}
	// It must NOT include the other account's data.
	for _, r := range rows {
		if r.RowID == "a-9" {
			t.Fatal("export leaked another account's row")
		}
	}
}

// SCENARIO: an export renders all data of an emitted-app end-user (app plan).
func TestFixture_ExportAppUser_RendersAllData(t *testing.T) {
	rows := Export(Scope{Plan: PlanApp, Subject: "u-7", App: "shop"}, sampleStore())
	if len(rows) != 1 || len(rows[0].Fields) != 2 {
		t.Fatalf("app export = %+v, want 1 row / 2 fields", rows)
	}
}

// SCENARIO: a deletion renders PII irrecoverable WHILE preserving append-only — the phase hash
// stays valid, the PII content is shredded, the structure survives verbatim.
func TestFixture_Erase_ShredsPii_PreservesAppendOnly(t *testing.T) {
	store := sampleStore()
	before := PhaseHash(store)

	res := Erase(Scope{Plan: PlanAccount, Subject: "acct-1"}, store, "phase-ref-42")
	post := ApplyErasure(Scope{Plan: PlanAccount, Subject: "acct-1"}, store)
	after := PhaseHash(post)

	// (1) The phase hash is UNCHANGED — append-only / DAG integrity preserved across erasure.
	if before != after {
		t.Fatalf("phase hash changed by erasure: %s -> %s", before, after)
	}
	// (2) Every selected cell is tombstoned: ciphertext = Tombstone, key gone, structure kept.
	for _, tomb := range res.Tombstoned {
		for _, p := range tomb.Cell.Pii {
			if !p.Shredded() {
				t.Fatalf("cell %s field %s not shredded: %+v", tomb.RowID, p.Path, p)
			}
		}
	}
	// (3) The store still has the SAME number of rows (nothing destroyed — append-only).
	if len(post) != len(store) {
		t.Fatalf("rows after erasure = %d, want %d (append-only)", len(post), len(store))
	}
	// (4) Non-erased subjects keep their PII (acct-2, u-7, u-8 untouched).
	if !PiiVisible("acct-2", post) {
		t.Fatal("a DIFFERENT account's PII was destroyed by acct-1's erasure")
	}
	if !PiiVisible("u-7", post) {
		t.Fatal("an emitted-app user's PII was destroyed by an account erasure")
	}
	// (5) The erased subject's PII is irrecoverable — no query returns it.
	if PiiVisible("acct-1", post) {
		t.Fatal("erased subject's PII still queryable")
	}
	// (6) The export of an erased subject now returns NOTHING (irrecoverable, honestly).
	if rows := Export(Scope{Plan: PlanAccount, Subject: "acct-1"}, post); len(rows) != 0 {
		for _, r := range rows {
			if len(r.Fields) != 0 {
				t.Fatalf("erased subject still exports fields: %+v", r)
			}
		}
	}
	// (7) The decision is RECORDED and content-addressed (§9 — never a silent edit).
	if res.Decision.ID == "" {
		t.Fatal("erasure produced no recorded decision")
	}
	if len(res.Decision.KeyIDs) != 1 || res.Decision.KeyIDs[0] != "k-acct-1" {
		t.Fatalf("decision key ids = %v, want [k-acct-1]", res.Decision.KeyIDs)
	}
}

// SCENARIO: erasing an emitted-app end-user shreds only that user, across the app — the S103
// "tout PII oubliable" made concrete for the built app's people.
func TestFixture_Erase_AppUser_ScopedToOneSubject(t *testing.T) {
	store := sampleStore()
	post := ApplyErasure(Scope{Plan: PlanApp, Subject: "u-7", App: "shop"}, store)
	if PiiVisible("u-7", post) {
		t.Fatal("app user u-7 PII still visible after erasure")
	}
	if !PiiVisible("u-8", post) {
		t.Fatal("app user u-8 PII destroyed by u-7's erasure (scope leak)")
	}
	// The account holder's PII is in a different plan — untouched.
	if !PiiVisible("acct-1", post) {
		t.Fatal("account PII destroyed by an app-user erasure (cross-plan leak)")
	}
}
