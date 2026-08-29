#!/usr/bin/env bash
# Setup + push helper for homebridge-rainpoint-irrigation-control
# GitHub user: jeremyhaggard
set -euo pipefail

GITHUB_USER="jeremyhaggard"
REPO_NAME="homebridge-rainpoint-irrigation-control"
REPO_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"
TAG="v1.0.0"

echo "=============================================="
echo " Rainpoint Irrigation Control — publish helper"
echo " GitHub: ${GITHUB_USER}/${REPO_NAME}"
echo "=============================================="
echo

# --- Find plugin directory ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CANDIDATES=(
  "${SCRIPT_DIR}/${REPO_NAME}"
  "${SCRIPT_DIR}"
  "${HOME}/homebridge-rainpoint-irrigation-control"
  "${HOME}/Downloads/${REPO_NAME}"
  "$(pwd)/${REPO_NAME}"
  "$(pwd)"
)

PLUGIN_DIR=""
for d in "${CANDIDATES[@]}"; do
  if [[ -f "${d}/package.json" ]] && grep -q "homebridge-rainpoint-irrigation-control" "${d}/package.json" 2>/dev/null; then
    PLUGIN_DIR="$(cd "${d}" && pwd)"
    break
  fi
done

if [[ -z "${PLUGIN_DIR}" ]]; then
  echo "ERROR: Could not find the plugin folder."
  echo "Put this script next to (or inside) the '${REPO_NAME}' directory, or cd into it and run again."
  exit 1
fi

echo "Plugin directory: ${PLUGIN_DIR}"
cd "${PLUGIN_DIR}"

# --- Update package.json links ---
if command -v python3 >/dev/null 2>&1; then
  python3 - <<'PY'
import json
from pathlib import Path
p = Path("package.json")
pkg = json.loads(p.read_text())
pkg["name"] = "homebridge-rainpoint-irrigation-control"
pkg["author"] = {"name": "jeremyhaggard"}
pkg["repository"] = {
    "type": "git",
    "url": "https://github.com/jeremyhaggard/homebridge-rainpoint-irrigation-control.git",
}
pkg["bugs"] = {
    "url": "https://github.com/jeremyhaggard/homebridge-rainpoint-irrigation-control/issues",
}
pkg["homepage"] = "https://github.com/jeremyhaggard/homebridge-rainpoint-irrigation-control#readme"
if "keywords" not in pkg or "homebridge-plugin" not in pkg.get("keywords", []):
    pkg.setdefault("keywords", [])
    if "homebridge-plugin" not in pkg["keywords"]:
        pkg["keywords"].insert(0, "homebridge-plugin")
p.write_text(json.dumps(pkg, indent=2) + "\n")
print("Updated package.json repository URLs.")
PY
else
  echo "WARNING: python3 not found; edit package.json repository URLs manually if needed."
fi

# --- Ensure .gitignore ---
if [[ ! -f .gitignore ]]; then
  cat > .gitignore <<'EOF'
node_modules/
*.tgz
.DS_Store
npm-debug.log*
.env
config.json
EOF
  echo "Created .gitignore"
fi

# --- Git init / commit ---
if [[ ! -d .git ]]; then
  git init
  echo "Initialized git repository."
fi

git branch -M main 2>/dev/null || true

git add -A
if git diff --cached --quiet; then
  echo "Nothing new to commit (working tree clean or already committed)."
else
  git commit -m "Initial release: Rainpoint Irrigation Control ${TAG}"
  echo "Created commit."
fi

# --- Remote ---
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "${REPO_URL}"
else
  git remote add origin "${REPO_URL}"
fi
echo "Remote origin -> ${REPO_URL}"
git remote -v
echo

# --- Pre-push checks ---
echo "BEFORE PUSH — do these if you have not already:"
echo "  1. Create an empty public repo named '${REPO_NAME}' at:"
echo "     https://github.com/new"
echo "     Owner: ${GITHUB_USER}  |  Name: ${REPO_NAME}  |  Public  |  Issues enabled"
echo "  2. Authenticate (password login will NOT work):"
echo "       • Recommended:  gh auth login"
echo "       • Or HTTPS token: https://github.com/settings/tokens  (classic, scope: repo)"
echo

read -r -p "Repo exists on GitHub and you are ready to push? [y/N] " READY
if [[ ! "${READY}" =~ ^[Yy]$ ]]; then
  echo "Stopped. Create the GitHub repo / finish auth, then re-run this script."
  exit 0
fi

# Prefer gh if available and authenticated
if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    echo "Using GitHub CLI authentication."
    # Create repo if missing
    if ! gh repo view "${GITHUB_USER}/${REPO_NAME}" >/dev/null 2>&1; then
      echo "Repo not found; creating public repo with gh..."
      gh repo create "${GITHUB_USER}/${REPO_NAME}" --public --source=. --remote=origin --push
      echo "Repo created and pushed via gh."
    else
      git push -u origin main
    fi
  else
    echo "gh is installed but not logged in. Run: gh auth login"
    echo "Falling back to git push (token as password if prompted)..."
    git push -u origin main
  fi
else
  echo "Pushing with git (Username: ${GITHUB_USER} / Password: paste a Personal Access Token)..."
  git push -u origin main
fi

echo
echo "Push finished."

# --- Optional tag + release hint ---
if ! git rev-parse "${TAG}" >/dev/null 2>&1; then
  git tag -a "${TAG}" -m "Release ${TAG}"
  echo "Created local tag ${TAG}"
fi

read -r -p "Push tag ${TAG} to GitHub? [y/N] " PUSH_TAG
if [[ "${PUSH_TAG}" =~ ^[Yy]$ ]]; then
  git push origin "${TAG}" || true
fi

echo
echo "=============================================="
echo " Next steps"
echo "=============================================="
echo "1. Open: https://github.com/${GITHUB_USER}/${REPO_NAME}"
echo "2. Releases → Draft a new release → choose tag ${TAG} → Publish"
echo "3. Publish to npm (lists the plugin in Homebridge search):"
echo "     npm login"
echo "     npm publish --access public"
echo "4. In Homebridge UI search: homebridge-rainpoint-irrigation-control"
echo
echo "Config platform name: RainpointIrrigationControl"
echo "Done."
