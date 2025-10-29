#!/bin/bash
curl -X POST http://localhost:3000/execute-new \
  -H "Content-Type: application/json" \
  -d '{
    "message": "@test-concurrent Test message for new workflow orchestrator",
    "userId": "test-user-123"
  }'