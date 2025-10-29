#!/bin/bash
set -euo pipefail

curl -s -S -X POST \
  http://localhost:3000/add-graph \
  -H "Content-Type: application/json" \
  -d @- <<'JSON'
{
  "name": "dynamicShortGraph",
  "annotationType": "DefaultGraphAnnotation",
  "nodes": [
    "inputAnalysisNode",
    "awaitApprovalNode"
  ],
  "edges": [
    { "start": "__start__", "end": "inputAnalysisNode" },
    { "start": "inputAnalysisNode", "end": "awaitApprovalNode" },
    { "start": "awaitApprovalNode", "end": "__end__" }
  ],
  "selectionWords": [
    "@dynamic-short"
  ]
}
JSON

echo "Submitted dynamicShortGraph specification to /add-graph"
