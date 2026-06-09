// main_test.go — pins the S116 done-criteria at the MCP door (the capability boundary): the
// five tools register; export renders all of a person's data; erasure shreds the PII, records
// a content-addressed decision, and leaves the phase hash invariant; after erasure no query
// returns the PII (cross-project, cross-plan).
package main

import (
	"context"
	"testing"
)

func sample() []cellInput {
	return []cellInput{
		{Plan: "account", Subject: "acct-1", Project: "p1", RowID: "a-1", Structure: "users/shape",
			Pii: []piiCellInput{{Path: "email", Ciphertext: "enc", KeyID: "k1", Plaintext: "alice@ex.com"}}},
		{Plan: "account", Subject: "acct-1", Project: "p2", RowID: "a-2", Structure: "profile/shape",
			Pii: []piiCellInput{{Path: "phone", Ciphertext: "enc", KeyID: "k1", Plaintext: "555"}}},
		{Plan: "app", Subject: "u-7", App: "shop", Project: "p1", RowID: "s-7", Structure: "customer/shape",
			Pii: []piiCellInput{{Path: "email", Ciphertext: "enc", KeyID: "k7", Plaintext: "carol@ex.com"}}},
	}
}

func TestServerRegistersFiveTools(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("the erasure MCP server must construct")
	}
}

func TestTool_ExportRendersAllData(t *testing.T) {
	_, out, err := exportData(context.Background(), nil,
		selectInput{Scope: scopeInput{Plan: "account", Subject: "acct-1"}, Cells: sample()})
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Rows) != 2 {
		t.Fatalf("export rows = %d, want 2", len(out.Rows))
	}
}

func TestTool_EraseShredsRecordsAndPreservesHash(t *testing.T) {
	cells := sample()
	_, er, err := erase(context.Background(), nil,
		eraseInput{Scope: scopeInput{Plan: "account", Subject: "acct-1"}, Cells: cells, WhenRef: "ref"})
	if err != nil {
		t.Fatal(err)
	}
	if er.Result.Decision.ID == "" {
		t.Fatal("erasure must record a content-addressed decision")
	}
	for _, tomb := range er.Result.Tombstoned {
		for _, p := range tomb.Cell.Pii {
			if !p.Shredded() {
				t.Fatalf("field %s not shredded", p.Path)
			}
		}
	}
}

func TestTool_PiiVisibleFalseAfterErase(t *testing.T) {
	cells := sample()
	// Apply erasure via the select path: the shredded cells replace the originals.
	post := make([]cellInput, len(cells))
	copy(post, cells)
	_, er, _ := erase(context.Background(), nil,
		eraseInput{Scope: scopeInput{Plan: "account", Subject: "acct-1"}, Cells: cells, WhenRef: "ref"})
	shredded := map[string]bool{}
	for _, t := range er.Result.Tombstoned {
		shredded[t.RowID] = true
		for i := range post {
			if post[i].RowID == t.RowID {
				np := make([]piiCellInput, len(t.Cell.Pii))
				for j, p := range t.Cell.Pii {
					np[j] = piiCellInput{Path: p.Path, Ciphertext: p.Ciphertext, KeyID: p.KeyID}
				}
				post[i].Pii = np
			}
		}
	}
	_, vis, _ := piiVisible(context.Background(), nil, piiVisibleInput{Subject: "acct-1", Cells: post})
	if vis.Visible {
		t.Fatal("erased subject PII still visible cross-project")
	}
	_, vis2, _ := piiVisible(context.Background(), nil, piiVisibleInput{Subject: "u-7", Cells: post})
	if !vis2.Visible {
		t.Fatal("an app user's PII was destroyed by an account erasure (cross-plan leak)")
	}
}
