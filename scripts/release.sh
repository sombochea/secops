#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  release.sh — bump version, commit, tag, and push
#
#  Usage:
#    ./scripts/release.sh               # patch bump  (0.1.0 → 0.1.1)
#    ./scripts/release.sh minor         # minor bump  (0.1.0 → 0.2.0)
#    ./scripts/release.sh major         # major bump  (0.1.0 → 1.0.0)
#    ./scripts/release.sh patch --force # force-overwrite existing tag
#    ./scripts/release.sh --force       # patch + force
# ─────────────────────────────────────────────────────────────
set -euo pipefail

# ── Parse arguments ─────────────────────────────────────────
BUMP="patch"
FORCE=false

for arg in "$@"; do
  case "$arg" in
    major|minor|patch) BUMP="$arg" ;;
    --force|-f)        FORCE=true ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [major|minor|patch] [--force]"
      exit 1
      ;;
  esac
done

# ── Resolve project root (parent of scripts/) ───────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="$ROOT/package.json"

if [[ ! -f "$PKG" ]]; then
  echo "Error: package.json not found at $PKG"
  exit 1
fi

# ── Read current version ─────────────────────────────────────
CURRENT=$(node -p "require('$PKG').version" 2>/dev/null || \
          grep -oP '"version":\s*"\K[^"]+' "$PKG" | head -1)

if [[ -z "$CURRENT" ]]; then
  echo "Error: could not read version from package.json"
  exit 1
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

# ── Compute next version ─────────────────────────────────────
case "$BUMP" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

NEXT="$MAJOR.$MINOR.$PATCH"
TAG="v$NEXT"

echo ""
echo "  Current version : $CURRENT"
echo "  Next version    : $NEXT  ($BUMP bump)"
echo "  Tag             : $TAG"
echo "  Force overwrite : $FORCE"
echo ""

# ── Confirm ──────────────────────────────────────────────────
read -r -p "Proceed? [y/N] " confirm
case "$confirm" in
  [yY][eE][sS]|[yY]) ;;
  *)
    echo "Aborted."
    exit 0
    ;;
esac

# ── Check for uncommitted changes ────────────────────────────
cd "$ROOT"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo ""
  echo "Error: working tree has uncommitted changes. Commit or stash them first."
  exit 1
fi

# ── Update package.json (pure sed, no jq/bun required) ───────
sed -i.bak "s/\"version\": \"$CURRENT\"/\"version\": \"$NEXT\"/" "$PKG"
rm -f "$PKG.bak"

echo ""
echo "✓ Bumped package.json: $CURRENT → $NEXT"

# ── Commit ───────────────────────────────────────────────────
git add "$PKG"
git commit -m "chore: bump version to $NEXT"
echo "✓ Committed: chore: bump version to $NEXT"

# ── Handle existing tag ───────────────────────────────────────
if git rev-parse "$TAG" >/dev/null 2>&1; then
  if [[ "$FORCE" == true ]]; then
    git tag -d "$TAG"
    echo "✓ Deleted local tag $TAG (force)"
  else
    echo ""
    echo "Error: tag $TAG already exists. Use --force to overwrite."
    exit 1
  fi
fi

# ── Create tag ───────────────────────────────────────────────
git tag -a "$TAG" -m "Release $TAG"
echo "✓ Created tag $TAG"

# ── Push commit ──────────────────────────────────────────────
git push origin
echo "✓ Pushed commits to origin"

# ── Push tag (force if requested) ────────────────────────────
if [[ "$FORCE" == true ]]; then
  git push origin "$TAG" --force
else
  git push origin "$TAG"
fi

echo "✓ Pushed tag $TAG to origin"
echo ""
echo "🎉 Released $TAG — GitHub Actions will build & publish the image."
