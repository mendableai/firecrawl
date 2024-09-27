#!/bin/bash -e

if [ $UID -eq 0 ]; then
  ulimit -n 65535
  echo "NEW ULIMIT: $(ulimit -n)"
else
  echo ENTRYPOINT DID NOT RUN AS ROOT
fi

if [ $FLY_PROCESS_GROUP -eq "app" ]; then
  node --max-old-space-size=8192 dist/src/index.js
elif [ $FLY_PROCESS_GROUP -eq "worker" ]; then
  node --max-old-space-size=8192 dist/src/services/queue-worker.js
else
  echo "NO FLY PROCESS GROUP, RUNNING app BY DEFAULT"
  node --max-old-space-size=8192 dist/src/index.js
fi

