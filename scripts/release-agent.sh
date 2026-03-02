#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  release-agent.sh — tag and push an agent release
#
#  Usage:
#    ./scripts/release-agent.sh 1.0.0
#    ./scripts/release-agent.sh 1.0.0 --force
# ─────────────────────────────────────────────────────────────
set -euo pipefail

FORCE=false
VERSION=""

for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=true ;;
    *)          VERSION="$arg" ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version> [--force]"
  echo "Example: $0 1.0.0"
  exit 1
fi

TAG="agent-v$VERSION"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo ""
echo "  Agent version : $VERSION"
echo "  Tag           : $TAG"
echo "  Force         : $FORCE"
echo ""

read -r -p "Proceed? [y/N] " confirm
case "$confirm" in
  [yY][eE][sS]|[yY]) ;;
  *) echo "Aborted."; exit 0 ;;
esac

if git rev-parse "$TAG" >/dev/null 2>&1; then
  if [[ "$FORCE" == true ]]; then
    git tag -d "$TAG"
  else
    echo "Error: tag $TAG already exists. Use --force to overwrite."
    exit 1
  fi
fi

git tag -a "$TAG" -m "Agent release $TAG"
echo "✓ Created tag $TAG"

if [[ "$FORCE" == true ]]; then
  git push origin "$TAG" --force
else
  git push origin "$TAG"
fi

echo "✓ Pushed tag $TAG"
echo ""
echo "🎉 Agent release $TAG — GitHub Actions will build binaries for all platforms."
