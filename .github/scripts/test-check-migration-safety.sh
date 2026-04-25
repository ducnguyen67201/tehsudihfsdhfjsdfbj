#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scanner="$script_dir/check-migration-safety.sh"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

create_repo() {
  local repo="$1"
  mkdir -p "$repo"
  git init -q "$repo"
  git -C "$repo" config user.email "ci@example.com"
  git -C "$repo" config user.name "CI"
  echo "base" > "$repo/README.md"
  git -C "$repo" add README.md
  git -C "$repo" commit -qm "base"
}

risky_repo="$tmp_dir/risky"
create_repo "$risky_repo"
mkdir -p "$risky_repo/packages/database/prisma/migrations/20260101000000_risky"
cat > "$risky_repo/packages/database/prisma/migrations/20260101000000_risky/migration.sql" <<'SQL'
ALTER TABLE "AgentTeamRole"
  ALTER COLUMN "roleKey" SET NOT NULL;
SQL
git -C "$risky_repo" add .
git -C "$risky_repo" commit -qm "add risky migration"

if (cd "$risky_repo" && MIGRATION_SAFETY_BASE=HEAD^ "$scanner") > "$tmp_dir/risky.out" 2>&1; then
  echo "Expected multiline ALTER COLUMN SET NOT NULL migration to fail." >&2
  cat "$tmp_dir/risky.out" >&2
  exit 1
fi

reviewed_repo="$tmp_dir/reviewed"
create_repo "$reviewed_repo"
mkdir -p "$reviewed_repo/packages/database/prisma/migrations/20260101000000_reviewed"
cat > "$reviewed_repo/packages/database/prisma/migrations/20260101000000_reviewed/migration.sql" <<'SQL'
-- trustloop-migration: reviewed-destructive-change backfill already guarantees non-null values
ALTER TABLE "AgentTeamRole"
  ALTER COLUMN "roleKey" SET NOT NULL;
SQL
git -C "$reviewed_repo" add .
git -C "$reviewed_repo" commit -qm "add reviewed migration"

(cd "$reviewed_repo" && MIGRATION_SAFETY_BASE=HEAD^ "$scanner") > "$tmp_dir/reviewed.out" 2>&1

echo "Migration safety scanner self-test passed."
