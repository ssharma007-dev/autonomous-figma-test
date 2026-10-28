#!/usr/bin/env bash
# Gets a Figma-hosted PNG link for one frame via the Figma REST API and prints
# the wrapper URL to use as the first step of an Autonomous Custom Flow.
#
# Usage: ./get-figma-link.sh <figma frame URL>
#   e.g. ./get-figma-link.sh "https://www.figma.com/design/hdJest9lMIQGKOsAopWtBG/x?node-id=1-2"
#
# Token: set FIGMA_TOKEN, or save it in ~/.figma_token (chmod 600).
# The token needs the "File content: read-only" scope.
set -euo pipefail

WRAPPER="${WRAPPER:-https://ssharma007-dev.github.io/autonomous-figma-test/wrapper/}"
FIGMA_URL="${1:?Usage: $0 <figma frame URL with node-id>}"

TOKEN="${FIGMA_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -f ~/.figma_token ]; then TOKEN="$(tr -d '[:space:]' < ~/.figma_token)"; fi
[ -n "$TOKEN" ] || { echo "No token: set FIGMA_TOKEN or create ~/.figma_token" >&2; exit 1; }

# Pull the file key and node id out of the Figma URL (node-id 1-2 -> 1:2)
FILE_KEY="$(sed -E 's#.*figma\.com/(design|file|proto)/([^/?]+).*#\2#' <<<"$FIGMA_URL")"
NODE_ID="$(sed -nE 's#.*[?&]node-id=([0-9]+)[-:%3A]+([0-9]+).*#\1:\2#p' <<<"$FIGMA_URL")"
[ -n "$NODE_ID" ] || { echo "The URL has no node-id. In Figma, select the frame and use Copy link to selection." >&2; exit 1; }

RESP="$(curl -sf -H "X-Figma-Token: $TOKEN" \
  "https://api.figma.com/v1/images/$FILE_KEY?ids=$NODE_ID&format=png&scale=1")" \
  || { echo "Figma API call failed (check the token and that it can open this file)" >&2; exit 1; }

IMG="$(python3 -I -c 'import json,sys; d=json.load(sys.stdin); print(next(iter(d.get("images",{}).values()),"") or "")' <<<"$RESP")"
[ -n "$IMG" ] || { echo "Figma returned no image: $RESP" >&2; exit 1; }

ENC="$(python3 -I -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$IMG")"
echo "Figma image link: $IMG"
echo
echo "Use this URL in the Custom Flow (Run 1):"
echo "$WRAPPER?img=$ENC"
