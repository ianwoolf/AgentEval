#!/usr/bin/env bash
# Docker Desktop kind provisioner: Docker and the node use separate image stores.
# Run from WSL Ubuntu. Stream the image locally; never push to a remote registry.
set -euo pipefail
image="${1:?Usage: bash import-local-image.sh IMAGE:TAG}"
wsl_exe="${WSL_EXE:-/mnt/c/Windows/System32/wsl.exe}"
node_pid=""
for candidate in $($wsl_exe -d docker-desktop -- pidof containerd | tr -d '\r'); do
  if "$wsl_exe" -d docker-desktop -- test -f "/proc/$candidate/root/etc/kubernetes/kubelet.conf"; then
    node_pid="$candidate"
    break
  fi
done
if [[ ! "$node_pid" =~ ^[0-9]+$ ]]; then
  echo "Cannot identify the Docker Desktop Kubernetes node containerd process" >&2
  exit 1
fi
docker image inspect "$image" --format '{{.Id}}'
docker save "$image" | "$wsl_exe" -d docker-desktop -- nsenter -t "$node_pid" -m -p -- /usr/local/bin/ctr -n k8s.io images import -
