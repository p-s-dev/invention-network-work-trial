#!/bin/bash
curl -X POST http://localhost:3000/execute-current \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Yes, proceed with the analysis",
    "threadId": "thread_1757976147144_g40o08",
    "userId": "test-user-123"
  }'