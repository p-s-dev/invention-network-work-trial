# Workflow Orchestration Overview

This document summarizes how the orchestration layer in this project selects and executes graphs. It focuses on two core services: `WorkflowOrchestratorService` and `GraphBuilderService`.

## WorkflowOrchestratorService

### Graph selection and scoring pipeline
- The orchestrator asks `GraphBuilderService` for the active graph catalog and selection keywords (`getAllGraphsAndSelectionWords`).
- `scoreGraphsAndSelectOne` tallies a score for each graph by combining four signals:
  - Plain word matches add `pointsForWordMatch` per occurrence.
  - Words prefixed with `@` count as keywords and add `pointsForKeyWordMatch`.
  - Each existing thread for a graph contributes `pointsForThread`.
  - Recently updated threads (under the `fiveMinutes` threshold) add `pointsForRecent`.
- The graph with the highest total wins and is returned together with its compiled LangGraph instance and runnable config.

### Configurable scoring criteria
- Scoring weights live in `src/orchestrator/select-graph-config.json`, keeping the strategy tweakable without code changes.
- Selection vocabularies originate from `graphs.json` and can be replaced at runtime by calling `POST /add-graph` with a new spec. The orchestrator immediately sees the updated keywords because it always queries the `GraphBuilderService` catalog before scoring.
- Together, the static JSON weights and the HTTP-powered graph catalog give product teams a fast path to experiment with routing heuristics in production.

### Thread lifecycle management
- `findThreadTypeCountsByUser` asks `ThreadStoreService` for a user’s threads and aggregates count plus "last updated" metadata per graph type.
- `getThreadId` either reuses the freshest thread for a graph (and touches its `lastUpdatedAt`) or calls `makeNewThread` to mint a new pair of thread/root identifiers.
- New threads trigger `getInitialStateForNewThread`, which converts the last conversation exchange into LangGraph `BaseMessage` instances and requests a typed initial state from the graph builder.

## GraphBuilderService

### Decoupled graph construction
- On module init the service loads `graphs.json`, registers node handlers, and saves raw `StateGraph` builders keyed by graph name.
- `registerGraphFromSpec` wires nodes and edges from the JSON spec. Edges accept `__start__` / `__end__` tokens, letting product teams describe flows declaratively.
- Execution never rebuilds the graph; it simply asks the builder for the compiled graph on demand.

### Runtime graph and node updates
- `POST /add-graph` feeds a `GraphJsonGraphSpec` into `registerGraphFromSpec`, supporting on-the-fly graph creation or updates (including selection keywords used by the orchestrator).
- `POST /update-node` calls `addOrUpdateStep`, letting operations teams change a node’s LLM model or temperature without redeploying.

### Concurrent fan-out and merge support
- The concurrent research flow uses `ConcurrentResearchGraphAnnotation`, which defines reducers for `messages`, `currentSteps`, and `analysisResults`. Reducers allow child branches to emit partial state without clobbering each other when LangGraph merges paths.
- The graph spec (`graphs.json`) fans out from `concurrentInputAnalysisNode` to novelty, feasibility, and impact nodes, then converges on `concurrentSynthesisNode`, relying on the reducer-powered annotation to combine outputs safely.

### Typed initial state helpers
- Factory helpers (`makeResearch`, `makeConcurrentResearch`, `makeMonetization`, `makeDefault`) build strongly typed initial states keyed by graph type. The orchestrator calls `getInitialStateRuntime`, which validates the graph key and delegates to these helpers for consistent defaults.
- Each helper seeds required IDs, message arrays, and domain-specific slices (e.g., `analysisResults`, `marketAnalysis`), reducing the risk of shape mismatches when LangGraph resumes from persistence.

### Lazy compilation
- Graph builders are stored in `dynamicGraphBuilders`, while compiled graphs live in `dynamicGraphs`.
- `getDynamicGraph` checks for a compiled instance and compiles on first access via `builder.compile({ checkpointer: this.checkpointer })`, logging when compilation happens. Subsequent calls reuse the cached compiled graph, balancing startup time with runtime flexibility.

