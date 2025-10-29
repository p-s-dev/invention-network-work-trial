#!/bin/bash
curl -X POST http://localhost:3000/execute-new \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Test message for new workflow orchestrator",
    "userId": "test-user-123",
    "threadId": "researchGraph_thread_1758207386950_b2f2d"
  }'