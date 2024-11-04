#!/bin/bash -e

if [ $UID -eq 0 ]; then
  ulimit -n 65535
  echo "NEW ULIMIT: $(ulimit -n)"
else
  echo ENTRYPOINT DID NOT RUN AS ROOT
fi

if [ $FLY_PROCESS_GROUP = "app" ]; then
  echo "RUNNING app"
  node --max-old-space-size=8192 dist/src/index.js
elif [ $FLY_PROCESS_GROUP = "worker" ]; then
  echo "RUNNING worker"
  node --max-old-space-size=8192 dist/src/services/queue-worker.js
else
  echo "NO FLY PROCESS GROUP"
  node --max-old-space-size=8192 dist/src/index.js
fi
