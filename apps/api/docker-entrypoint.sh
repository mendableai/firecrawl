#!/bin/bash -e

if [ "$UID" -eq 0 ]; then
  set +e # disable failing on errror
  ulimit -n 65535
  echo "ENTRYPOINT: NEW ULIMIT: $(ulimit -n)"
  set -e # enable failing on error
else
  echo "ENTRYPOINT: DID NOT RUN AS ROOT"
fi

if [ "$FLY_PROCESS_GROUP" = "app" ]; then
  echo "ENTRYPOINT: RUNNING app"
  exec node --max-old-space-size=6144 dist/src/index.js &
elif [ "$FLY_PROCESS_GROUP" = "worker" ]; then
  echo "ENTRYPOINT: RUNNING worker"
  exec node --max-old-space-size=3072 dist/src/services/queue-worker.js &
elif [ "$FLY_PROCESS_GROUP" = "index-worker" ]; then
  echo "ENTRYPOINT: RUNNING index worker"
  exec node --max-old-space-size=3072 dist/src/services/indexing/index-worker.js &
else
  echo "ENTRYPOINT: NO FLY PROCESS GROUP"
  exec node --max-old-space-size=8192 dist/src/index.js &
fi

FC_PID=$!
echo "ENTRYPOINT: Background process PID: $FC_PID"

trap 'echo "ENTRYPOINT: SIGTERM received. Forwarding to PID $FC_PID..."; kill -SIGTERM $FC_PID; echo "ENTRYPOINT: Waiting for PID $FC_PID to exit after SIGTERM..."; wait $FC_PID; echo "ENTRYPOINT: PID $FC_PID exited after SIGTERM."' SIGTERM
trap 'echo "ENTRYPOINT: SIGINT received. Forwarding to PID $FC_PID..."; kill -SIGINT $FC_PID; echo "ENTRYPOINT: Waiting for PID $FC_PID to exit after SIGINT..."; wait $FC_PID; echo "ENTRYPOINT: PID $FC_PID exited after SIGINT."' SIGINT

echo "ENTRYPOINT: Main script waiting for PID $FC_PID..."
wait $FC_PID

echo "ENTRYPOINT: All processes terminated. Script exiting."
