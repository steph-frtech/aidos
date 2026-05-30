-- name: InsertContent :exec
INSERT INTO archive.content (hash, data)
VALUES ($1, $2)
ON CONFLICT (hash) DO NOTHING;

-- name: GetContent :one
SELECT data FROM archive.content WHERE hash = $1;

-- name: ContentRowCount :one
SELECT COUNT(*) FROM archive.content WHERE hash = $1;

-- name: UpsertHead :exec
INSERT INTO archive.head (key, hash, updated_at)
VALUES ($1, $2, now())
ON CONFLICT (key) DO UPDATE SET hash = EXCLUDED.hash, updated_at = now();

-- name: GetHead :one
SELECT hash FROM archive.head WHERE key = $1;

-- name: InsertHistory :exec
INSERT INTO archive.history (key, hash, parent_hash)
VALUES ($1, $2, $3);

-- name: GetHistory :many
SELECT id, key, hash, parent_hash, created_at
FROM archive.history
WHERE key = $1
ORDER BY created_at ASC, id ASC;

-- name: ListContent :many
SELECT hash, byte_size, created_at FROM archive.content ORDER BY created_at DESC LIMIT 100;

-- name: ListHeads :many
SELECT key, hash, updated_at FROM archive.head ORDER BY key ASC LIMIT 100;
