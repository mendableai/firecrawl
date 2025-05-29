#!/bin/bash -e

if [ "$UID" -eq 0 ]; then
  set +e # disable failing on errror
  ulimit -n 65535
  echo "NEW ULIMIT: $(ulimit -n)"
  set -e # enable failing on error
else
  echo ENTRYPOINT DID NOT RUN AS ROOT
fi

if [ "$FLY_PROCESS_GROUP" = "app" ]; then
  echo "RUNNING app"
  exec node --max-old-space-size=6144 dist/src/index.js &
elif [ "$FLY_PROCESS_GROUP" = "worker" ]; then
  echo "RUNNING worker"
  exec node --max-old-space-size=3072 dist/src/services/queue-worker.js &
elif [ "$FLY_PROCESS_GROUP" = "index-worker" ]; then
  echo "RUNNING index worker"
  exec node --max-old-space-size=3072 dist/src/services/indexing/index-worker.js &
else
  echo "NO FLY PROCESS GROUP"
  exec node --max-old-space-size=8192 dist/src/index.js &
fi

FC_PID=$!

trap 'kill -SIGTERM $FC_PID; wait $FC_PID' SIGTERM
trap 'kill -SIGINT $FC_PID; wait $FC_PID' SIGINT
trap 'kill -SIGKILL $FC_PID; wait $FC_PID' SIGKILL

wait $FC_PID

echo "ALL PROCESSES TERMINATED"
