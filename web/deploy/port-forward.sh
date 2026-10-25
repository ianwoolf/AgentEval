#!/usr/bin/env bash
set -euo pipefail

port="${1:-18082}"
es_port="${2:-9200}"
context="${KUBE_CONTEXT:-$(kubectl config current-context)}"
namespace="${KUBE_NAMESPACE:-evaluation}"

if [[ ! "$port" =~ ^[0-9]{1,5}$ ]] || (( 10#$port < 1 || 10#$port > 65535 )); then
  echo "Usage: bash deploy/port-forward.sh [port: 1-65535]" >&2
  exit 1
fi
if [[ ! "$es_port" =~ ^[0-9]{1,5}$ ]] || (( 10#$es_port < 1 || 10#$es_port > 65535 )); then
  echo 'Usage: bash deploy/port-forward.sh [ui-port] [es-port]' >&2
  exit 1
fi
port=$((10#$port))
es_port=$((10#$es_port))
if (( port == es_port )); then
  echo 'UI and ES must use different local ports.' >&2
  exit 1
fi

if ! command -v kubectl >/dev/null 2>&1; then
  echo 'kubectl was not found. Enable Docker Desktop WSL integration for this distribution.' >&2
  exit 1
fi

kubectl --context "$context" -n "$namespace" get service evaluation-ui evaluation-es

echo "UI: http://127.0.0.1:$port/individual/evaluation/catalog"
echo "ES: http://127.0.0.1:$es_port"
echo 'Keep this terminal open. Press Ctrl+C to stop forwarding.'
pids=()
cleanup() {
  trap - EXIT INT TERM
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
kubectl --context "$context" -n "$namespace" \
  port-forward service/evaluation-ui "$port:8080" --address 127.0.0.1 &
pids+=("$!")
kubectl --context "$context" -n "$namespace" \
  port-forward service/evaluation-es "$es_port:9200" --address 127.0.0.1 &
pids+=("$!")
# If either forward exits, stop the other rather than leaving a partial setup.
status=1
while kill -0 "${pids[0]}" 2>/dev/null && kill -0 "${pids[1]}" 2>/dev/null; do
  sleep 2
done
echo 'Port forwarding stopped.' >&2
exit "$status"
