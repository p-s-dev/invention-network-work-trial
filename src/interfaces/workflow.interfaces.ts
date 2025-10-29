/**
 * WORKFLOW ORCHESTRATOR INTERFACES
 *
 * These interfaces define the architecture for the new pluggable workflow system
 * that should replace the hard-coded LangGraphService
 */

export interface ExecutionContext {
  message: string;
  threadId: string;
  userId: string;
  rootId: string;
  conversationContext: ConversationContext;
  metadata?: Record<string, any>;
}

export interface ConversationContext {
  threadMessages: Array<{ kind: 'message.human' | 'message.ai'; text: string }>;
  conversationHistory: string[]; // Full conversation history for easy access
  workflowExecutionHistory: Array<{ workflowId: string; timestamp: number; results: any }>; // Previous workflow results
  userInteractionHistory: Array<{ interactionId: string; response: any; timestamp: number }>; // Interactive workflow responses
  inventionDisclosureId?: string;
}

export interface RoutingContext {
  message: string;
  userId: string;
  threadId: string;
  conversationHistory: string[];
  userTier: 'basic' | 'premium' | 'enterprise';
  hasInventionDisclosure: boolean;
  uploadedFiles?: Array<{ name: string; type: string; extension: string }>;
  metadata?: Record<string, any>;
}

export interface WorkflowEvent {
  type:
    | 'workflow_started'
    | 'step_started'
    | 'step_progress'
    | 'step_completed'
    | 'step_failed'
    | 'workflow_completed'
    | 'workflow_failed';
  workflowId: string;
  stepId?: string;
  timestamp: number;
  data?: any;
  metadata?: Record<string, any>;
}

export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  dependencies: string[]; // Step IDs that must complete first
  timeout?: number; // milliseconds
  retryPolicy?: RetryPolicy;

  execute(context: StepExecutionContext): Promise<StepResult>;
  supportsStreaming?(): boolean;
  executeWithStreaming?(context: StepExecutionContext): AsyncIterable<WorkflowEvent>;
}

export interface StepExecutionContext {
  workflowContext: ExecutionContext;
  previousResults: Record<string, any>; // Results from completed steps
  stepConfig?: Record<string, any>;
}

export interface StepResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
  retryOnErrors?: string[]; // Error types to retry on
}

export enum ExecutionStrategy {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  MIXED = 'mixed',
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;

  // Routing: When should this workflow be selected?
  canHandle: (context: RoutingContext) => Promise<number>; // 0-100 confidence score

  // Execution: How should the workflow run?
  steps: WorkflowStep[];
  executionStrategy: ExecutionStrategy;

  // Configuration
  timeout?: number;
  errorHandlingStrategy?: ErrorHandlingStrategy;
  metadata?: Record<string, any>;
}

export enum ErrorHandlingStrategy {
  FAIL_FAST = 'fail_fast', // Stop on first error
  CONTINUE_ON_ERROR = 'continue', // Continue with other steps
  RETRY_FAILED = 'retry', // Retry failed steps
}