#!/bin/bash
# deploy.sh — Push mishigami-card to GitHub Pages
# Usage: ./deploy.sh YOUR_GITHUB_USERNAME
# Example: ./deploy.sh jackpeck
#
# Prerequisites:
#   1. Create a PUBLIC repo named "mishigami-card" at https://github.com/new
#   2. Run: chmod +x deploy.sh
#   3. Run: ./deploy.sh YOUR_GITHUB_USERNAME

set -e

GITHUB_USER="${1}"

if [ -z "$GITHUB_USER" ]; then
  echo "Usage: ./deploy.sh YOUR_GITHUB_USERNAME"
  exit 1
fi

REPO="mishigami-card"
REMOTE="https://github.com/${GITHUB_USER}/${REPO}.git"

echo "→ Deploying to ${REMOTE}"

# Initialize git if not already done
if [ ! -d .git ]; then
  git init -b main
  echo "  Initialized git repo"
else
  echo "  Git repo already initialized"
fi

# Stage all files
git add -A
git status --short

# Commit
git commit -m "Deploy Mishigami Race Card PWA" || echo "  Nothing new to commit"

# Set remote (replace if already set)
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE"

# Push
echo "→ Pushing to GitHub…"
git push -u origin main

echo ""
echo "✓ Pushed to GitHub."
echo ""
echo "Next steps:"
echo "  1. Go to: https://github.com/${GITHUB_USER}/${REPO}/settings/pages"
echo "  2. Source → Deploy from branch → main → / (root) → Save"
echo "  3. At your domain registrar, add a CNAME record:"
echo "     Name: card"
echo "     Value: ${GITHUB_USER}.github.io"
echo ""
echo "The site will be live at https://card.midwestultracycling.com in ~5 minutes"
echo "(after DNS propagates — may take up to 30 min)"
