package generators

import (
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// HashForTest exposes the S02 content-hash used for source addressing so the
// fixture mirror can assert source_hash == Hash(Canonicalize(body)) WITHOUT forking
// the hash. It is a thin, test-facing re-export of records.Hash; production code
// never needs it (Emit computes the hash internally).
func HashForTest(canonicalBody []byte) string {
	return records.Hash(canonicalBody)
}

// APISourceBodyForTest exposes the canonical (operation ⊕ entity) body so the S36
// fixture can assert the api artifact's source_hash == Hash(Canonicalize(body)) WITHOUT
// forking the hash or the canonicalization. Test-facing only.
func APISourceBodyForTest(op operation.Operation, e entities.Entity) ([]byte, error) {
	return apiSourceBody(APISource{Operation: op, Entity: e})
}
