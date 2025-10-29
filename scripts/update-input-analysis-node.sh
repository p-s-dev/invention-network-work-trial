#!/bin/bash
set -euo pipefail

curl -s -S -X POST \
  http://localhost:3000/update-node \
  -H "Content-Type: application/json" \
  -d '{
    "stepName": "inputAnalysisNode",
    "data": {
      "model": "gpt-5",
      "temperature": 0.4
    }
  }'

echo "Submitted update for inputAnalysisNode to use model=gpt-5, temperature=0.4"
