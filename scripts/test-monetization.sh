#!/bin/bash
curl -X POST http://localhost:3000/execute-current \
  -H "Content-Type: application/json" \
  -d '{
    "message": "@monetize I have invented a new solar panel design",
    "userId": "test-user-123"
  }'