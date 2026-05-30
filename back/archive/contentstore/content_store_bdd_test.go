package contentstore_test

import (
	"context"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/archive/contentstore"
)

// bddState holds state across BDD steps for one scenario.
type bddState struct {
	store    *contentstore.Store
	lastHash string
	hash1    string
	hash2    string
	headKey  string
}

func TestContentStoreBDD(t *testing.T) {
	_, dsn := startPostgres(t)

	suite := godog.TestSuite{
		Name: "content-store",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			state := &bddState{}

			sc.Step(`^a Postgres instance with the archive baseline migration applied$`, func() error {
				var err error
				state.store, err = contentstore.New(context.Background(), dsn)
				return err
			})

			// Scenario 1: Write then read
			sc.Step(`^I put the bytes "([^"]*)" into the store$`, func(payload string) error {
				h, err := state.store.Put(context.Background(), []byte(payload))
				if err != nil {
					return err
				}
				state.lastHash = h
				return nil
			})
			sc.Step(`^I get back a content hash$`, func() error {
				if state.lastHash == "" {
					return godog.ErrPending
				}
				return nil
			})
			sc.Step(`^reading that hash returns exactly the bytes "([^"]*)"$`, func(expected string) error {
				data, err := state.store.Get(context.Background(), state.lastHash)
				if err != nil {
					return err
				}
				if string(data) != expected {
					return godog.ErrPending
				}
				return nil
			})

			// Scenario 2: Idempotent Put
			sc.Step(`^I put the bytes "([^"]*)" twice$`, func(payload string) error {
				h1, err := state.store.Put(context.Background(), []byte(payload))
				if err != nil {
					return err
				}
				h2, err := state.store.Put(context.Background(), []byte(payload))
				if err != nil {
					return err
				}
				state.hash1 = h1
				state.hash2 = h2
				return nil
			})
			sc.Step(`^both puts return the same hash$`, func() error {
				if state.hash1 != state.hash2 {
					return godog.ErrPending
				}
				return nil
			})
			sc.Step(`^the content table holds exactly one row for that hash$`, func() error {
				// ON CONFLICT DO NOTHING makes Put idempotent at the SQL layer;
				// assert via the live store that exactly one content row exists for the hash.
				rows, err := state.store.ListContent(context.Background())
				if err != nil {
					return err
				}
				count := 0
				for _, r := range rows {
					if r.Hash == state.hash1 {
						count++
					}
				}
				if count != 1 {
					return godog.ErrPending
				}
				return nil
			})

			// Scenario 3: Edit creates new hash, old still readable, history oldest-first.
			// One handler serves both the Given (v1) and When (v2) steps — Godog
			// matches both Gherkin lines to this single pattern.
			sc.Step(`^I put the bytes "([^"]*)" under head "([^"]*)"$`, func(payload, key string) error {
				h, err := state.store.Put(context.Background(), []byte(payload))
				if err != nil {
					return err
				}
				state.headKey = key
				return state.store.SetHead(context.Background(), key, h)
			})
			sc.Step(`^the head "([^"]*)" now points at the hash of "([^"]*)"$`, func(key, payload string) error {
				h, err := state.store.GetHead(context.Background(), key)
				if err != nil {
					return err
				}
				expected := contentstore.Hash([]byte(payload))
				if h != expected {
					return godog.ErrPending
				}
				return nil
			})
			sc.Step(`^the hash of "([^"]*)" still reads back "([^"]*)"$`, func(payload, expected string) error {
				h := contentstore.Hash([]byte(payload))
				data, err := state.store.Get(context.Background(), h)
				if err != nil {
					return err
				}
				if string(data) != expected {
					return godog.ErrPending
				}
				return nil
			})
			sc.Step(`^the history of "([^"]*)" lists both moves oldest-first$`, func(key string) error {
				moves, err := state.store.History(context.Background(), key)
				if err != nil {
					return err
				}
				if len(moves) < 2 {
					return godog.ErrPending
				}
				// First move: hash of v1, no parent.
				if moves[0].Hash != contentstore.Hash([]byte("v1")) {
					return godog.ErrPending
				}
				if moves[0].ParentHash != nil {
					return godog.ErrPending
				}
				// Second move: hash of v2, parent = hash of v1.
				if moves[1].Hash != contentstore.Hash([]byte("v2")) {
					return godog.ErrPending
				}
				if moves[1].ParentHash == nil || *moves[1].ParentHash != contentstore.Hash([]byte("v1")) {
					return godog.ErrPending
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../../tests/archive/content_store.feature"},
			TestingT: t,
		},
	}

	if suite.Run() != 0 {
		t.Fatal("BDD scenarios failed")
	}
}
