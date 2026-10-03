#!/usr/bin/env bash
# Start the Docker stack bound to this machine's current LAN IP, so the app,
# session cookie, CORS origin and GitHub OAuth callback all agree on one host
# that every device on the network can reach. Extra arguments go to
# `docker compose up` (e.g. --build). Set COMPOSE_FILE to pick a compose file.
set -euo pipefail

cd "$(dirname "$0")/.."
PORT="${LAN_PORT:-8080}"

detect_ip() {
  if command -v ipconfig >/dev/null 2>&1; then
    # macOS: use the interface that carries the default route.
    local iface
    iface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')"
    [ -n "$iface" ] && ipconfig getifaddr "$iface" 2>/dev/null && return
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null
  else
    ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}'
  fi
}

IP="${LAN_IP:-$(detect_ip || true)}"
if [ -z "$IP" ]; then
  echo "Could not detect a LAN IP. Connect to a network or set LAN_IP=x.x.x.x." >&2
  exit 1
fi

export CLIENT_ORIGIN="http://$IP:$PORT"
export GITHUB_CALLBACK_URL="$CLIENT_ORIGIN/auth/github/callback"

docker compose up -d "$@"

STATE_FILE=.lan-ip
PREVIOUS="$(cat "$STATE_FILE" 2>/dev/null || true)"
echo "$IP" > "$STATE_FILE"

echo
echo "App:  $CLIENT_ORIGIN  (use this URL on every device, this one included)"
if [ "$PREVIOUS" != "$IP" ]; then
  echo
  echo "LAN IP changed (${PREVIOUS:-first run} -> $IP). Set the GitHub OAuth app's"
  echo "Authorization callback URL to:"
  echo "  $GITHUB_CALLBACK_URL"
  echo "GitHub > Settings > Developer settings > OAuth Apps > your app"
fi
