#!/usr/bin/env bash
set -euo pipefail

port="${1:-8080}"
context="${KUBE_CONTEXT:-docker-desktop}"
namespace="${KUBE_NAMESPACE:-evaluation}"

if [[ ! "$port" =~ ^[0-9]{1,5}$ ]] || (( 10#$port < 1 || 10#$port > 65535 )); then
  echo "Usage: bash scripts/start-ui-forward.sh [port: 1-65535]" >&2
  exit 1
fi
port=$((10#$port))

if ! command -v kubectl >/dev/null 2>&1; then
  echo 'kubectl was not found. Enable Docker Desktop WSL integration for this distribution.' >&2
  exit 1
fi

kubectl --context "$context" -n "$namespace" get service evaluation-ui

echo "UI: http://127.0.0.1:$port/individual/evaluation/catalog"
echo 'Keep this terminal open. Press Ctrl+C to stop forwarding.'
exec kubectl --context "$context" -n "$namespace" \
  port-forward service/evaluation-ui "$port:8080" --address 127.0.0.1
