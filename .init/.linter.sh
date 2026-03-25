#!/bin/bash
cd /home/kavia/workspace/code-generation/manufacturing-oee-monitoring-system-300-309/frontend_dashboard
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

