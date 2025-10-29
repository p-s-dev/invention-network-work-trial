# Principal Engineer Trial - Workflow Orchestrator Challenge

## Overview

This project contains a **realistic codebase challenge** for principal engineer candidates. It's based on actual production code from The Invention Network's IP platform, simplified for the trial.

## The Challenge

### Current System Problems

Your team is using `LangGraphService` (see `src/current-system/langgraph.service.ts`) for AI-powered workflows, but it has architectural issues:

1. **Hard-coded Routing**: Workflow selection logic is embedded in execution logic
2. **Poor Extensibility**: Adding new workflows requires code changes to core service
3. **Resource Inefficiency**: Always initializes all graphs regardless of usage
4. **Brittle Thread Management**: Uses string-based thread isolation

### Your Task

**Design and implement a `WorkflowOrchestrator` that addresses these architectural problems.**

## Requirements

### Core Architecture
- [ ] **Dynamic Workflow Registry**: Plugin system for registering workflows (or alternative)
- [ ] **Pluggable Routing Engine**: Route workflows based on context, not hard-coded rules
  - [ ] **ML-Based Workflow Selection**: Analyze message content and intent using NLP models
  - [ ] **User Behavior Pattern Matching**: Route based on historical user preferences and interaction patterns
  - [ ] **A/B Testing Framework**: Experimental workflow routing with statistical significance tracking
  - [ ] **Multi-Criteria Decision Making**: Weighted scoring across multiple routing factors with configurable weights
- [ ] **Execution Strategies**: Support sequential and parallel step execution
- [ ] **Mixed Execution**: Combine sequential and parallel strategies in single workflow
- [ ] **Error Handling**: Implement retry policies and circuit breaker patterns
- [ ] **Hot Swapping**: Add/modify workflows without restarting service
- [ ] **Workflow Configs**: Define workflows in either code or config files

### Interactive Workflows
- [ ] **Human-in-the-Loop**: Pause workflows for user input/approval at specific steps
- [ ] **Session Management**: Handle workflow suspension/resumption across days/weeks
- [ ] **User Interaction Types**: Support text input, multiple choice, approval gates
- [ ] **Timeout Handling**: Manage abandoned workflows with configurable timeouts
- [ ] **Concurrent Access**: Handle multiple users interacting with same workflow instance

## Existing Code Structure

```
src/
├── current-system/
│   └── langgraph.service.ts      # Current implementation (your starting point)
└── services/
    ├── logger.service.ts          # Mock logger service
    └── llm.service.ts            # Mock LLM service
```

## Business Context

The system processes invention disclosures through different analysis workflows:

- **Research Workflow**: Patent analysis, novelty assessment, feasibility study
- **Monetization Workflow**: Business model analysis, market sizing, IP strategy

Users trigger workflows via:
- Message content (e.g., `@monetize` keyword)
- User context (tier, history)
- Context and attachments

## Getting Started

```bash
# Install dependencies
pnpm install

# Run the current system
pnpm run start:dev
```

## Testing the Endpoints

Once the application is running (default port 3000), you can test the endpoints:

### Health Check
```bash
curl http://localhost:3000/health
```

### Test Current System (Research Workflow)
```bash
curl -X POST http://localhost:3000/execute-current \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I have invented a new solar panel design with improved efficiency",
    "userId": "test-user-123"
  }'
```

**Expected Behavior:** This will execute the research workflow through all analysis steps (input analysis → novelty analysis → feasibility analysis → impact analysis → synthesis) and then pause at the human approval gate showing an interrupt with the research results.

### Continue Research Workflow (After Interrupt)
```bash
curl -X POST http://localhost:3000/execute-current \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Yes, proceed with the analysis",
    "userId": "test-user-123"
  }'
```

**Expected Behavior:** This will resume the paused workflow from the approval gate and complete the remaining steps. The workflow demonstrates real LangGraph patterns including state persistence, human-in-the-loop interactions, and thread management.

### Test Current System (Monetization Workflow)
```bash
curl -X POST http://localhost:3000/execute-current \
  -H "Content-Type: application/json" \
  -d '{
    "message": "@monetize I have invented a new solar panel design",
    "userId": "test-user-123"
  }'
```

### Test New System (Placeholder - Will Return 501)
```bash
curl -X POST http://localhost:3000/execute-new \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Test message for new workflow orchestrator",
    "userId": "test-user-123"
  }'
```

**Note:** The `/execute-current` endpoint streams responses as Server-Sent Events (SSE). The `/execute-new` endpoint currently returns a 501 "Not implemented" response - this is where you'll implement your `WorkflowOrchestrator`.

## Success Metrics

1. **Extensibility**: Add new workflow in <10 minutes vs current 5+ hours
2. **Routing Accuracy**: >90% correct workflow selection vs ~70% keyword matching
3. **Performance**: Faster execution than current LangGraph implementation
4. **Maintainability**: Product team can configure workflows without engineering