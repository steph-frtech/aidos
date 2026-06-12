// hash.go — THROWAWAY (DP01 spike). The content-addressing probe: a canonical, field-explicit
// serialization of the manifest (sorted, no map order, no clock) hashed with sha256 — the
// source-hash a real record kind (DP02, records.Hash∘Canonicalize) would carry; plus the
// output-hash of emitted bytes and the drift predicate. ALL pure functions: the verdict is a
// hash equal/unequal measure, never an opinion.
package stackmanifest

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
)

// Canonicalize renders the manifest as a canonical string: every field explicit, slices
// sorted, "\n"-joined. Same manifest → same string, any field change → a different string.
func Canonicalize(m StackManifest) string {
	services := append([]Service(nil), m.Services...)
	sort.Slice(services, func(i, j int) bool { return services[i].Name < services[j].Name })
	volumes := append([]Volume(nil), m.Volumes...)
	sort.Slice(volumes, func(i, j int) bool { return volumes[i].Name < volumes[j].Name })
	scopes := append([]string(nil), m.ConnectorScopes...)
	sort.Strings(scopes)

	var b []string
	b = append(b, "stack_manifest/v0", "app="+m.AppName)
	for _, s := range services {
		b = append(b, fmt.Sprintf("service=%s role=%s image=%s port=%d profile=%s",
			s.Name, s.Role, s.Image, s.InternalPort, s.Profile))
	}
	for _, v := range volumes {
		b = append(b, "volume="+v.Name+" device_var="+v.DeviceVar)
	}
	b = append(b, fmt.Sprintf("network=%s external=%t", m.Network.Name, m.Network.External))
	for _, sc := range scopes {
		b = append(b, "connector_scope="+sc)
	}
	return strings.Join(b, "\n")
}

// SourceHash is the manifest's content address: sha256 of its canonical form.
func SourceHash(m StackManifest) string {
	sum := sha256.Sum256([]byte(Canonicalize(m)))
	return hex.EncodeToString(sum[:])
}

// OutputHash is the content address of an emitted artifact's bytes.
func OutputHash(emitted string) string {
	sum := sha256.Sum256([]byte(emitted))
	return hex.EncodeToString(sum[:])
}

// DriftDetected is the source path's audit predicate: the recorded output-hash no longer
// matches the bytes on disk ⇒ the projection was hand-edited (drift).
func DriftDetected(recordedOutputHash, currentBytes string) bool {
	return OutputHash(currentBytes) != recordedOutputHash
}

// TemplateCanDetectDrift measures the static-template path: a copied /data/dockers template
// records NO source-hash and NO output-hash, so a hand-edit is indistinguishable from the
// original by construction. Always false — that asymmetry is the measured payoff.
func TemplateCanDetectDrift() bool {
	return false
}
