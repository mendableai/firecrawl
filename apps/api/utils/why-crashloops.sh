#!/usr/bin/env bash
set -euo pipefail

NS="${1:-default}"

# Find crashlooping pods with the given prefix
pods=$(kubectl get pods -n "$NS" --no-headers \
  | awk '/^firecrawl-staging-worker-/ {print $1}')

if [ -z "${pods}" ]; then
  echo "No crashlooping firecrawl-worker pods found in namespace: $NS"
  exit 0
fi

for p in $pods; do
  echo "==== Pod: $p (namespace: $NS) ===="
  # Show last restart details for all containers in the pod
  kubectl get pod "$p" -n "$NS" \
    -o jsonpath=$'{range .status.containerStatuses[*]}Container: {@.name}\nRestartCount: {@.restartCount}\nState: {@.state}\nLastState: {@.lastState}\n\n{end}'
done