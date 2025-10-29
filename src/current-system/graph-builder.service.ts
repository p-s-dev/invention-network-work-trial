import { Injectable, type OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AIMessage, type BaseMessage, HumanMessage } from '@langchain/core/messages';
import { Annotation, interrupt, MemorySaver, StateGraph, CompiledStateGraph, START, END } from '@langchain/langgraph';
import type { LangGraphRunnableConfig, AnnotationRoot } from '@langchain/langgraph';
import { LLMService } from '../services/llm.service';
import { LoggerService } from '../services/logger.service';

// Simplified types from your actual system
interface ConversationContext {
  threadMessages: Array<{ kind: 'message.human' | 'message.ai'; text: string }>;
  conversationHistory: string[];
  workflowExecutionHistory: Array<{ workflowId: string; timestamp: number; results: any }>;
  userInteractionHistory: Array<{ interactionId: string; response: any; timestamp: number }>;
  inventionDisclosureId?: string;
}

interface GraphJsonNodeSpec {
  name: string;
  stateType?: string;
  model?: string;
  temperature?: number;
}

export interface GraphJsonGraphSpec {
  name: string;
  annotationType?: string;
  nodes?: string[];
  edges?: Array<{ start: string; end: string }>;
  selectionWords?: string[];
}

interface GraphJsonSpec {
  nodes?: GraphJsonNodeSpec[];
  graphs?: GraphJsonGraphSpec[];
}

// Research Graph State using LangGraph Annotation
export const ResearchGraphAnnotation = Annotation.Root({
  activeThreadId: Annotation<string>(),
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  rootId: Annotation<string>(),
  userId: Annotation<string>(),
  currentStep: Annotation<string>(),
  analysisResults: Annotation<Record<string, any>>(),
});

export type ResearchGraphState = typeof ResearchGraphAnnotation.State;

type AnalysisResults = {
  inputAnalysis?: {
    analysis: string
    keyTerms: string[]
    timestamp: string
  }
  noveltyAnalysis?: {
    analysis: string
    noveltyScore: number
    timestamp: string
  }
  feasibilityAnalysis?: {
    analysis: string
    feasibilityScore: number
    timestamp: string
  }
  impactAnalysis?: {
    analysis: string
    impactScore: number
    timestamp: string
  }
  synthesis?: {
    overallScore: number
    recommendation: string
    summary: string
    timestamp: string
  }
}

// Concurrent Research Graph State using LangGraph Annotation
export const ConcurrentResearchGraphAnnotation = Annotation.Root({
  activeThreadId: Annotation<string>(),
  messages: Annotation<BaseMessage[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  rootId: Annotation<string>(),
  userId: Annotation<string>(),
  currentSteps: Annotation<string[]>({
    default: () => [],
    reducer: (a, b) => a.concat(b),
  }),
  analysisResults: Annotation<AnalysisResults>({
    default: () => ({}),
    reducer: (a, b) => ({ ...a, ...b }),
  }),
});

export type ConcurrentResearchGraphState = typeof ConcurrentResearchGraphAnnotation.State;

export const DefaultGraphAnnotation = Annotation.Root({
  activeThreadId: Annotation<string>(),
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  rootId: Annotation<string>(),
  userId: Annotation<string>(),
  currentStep: Annotation<string>(),
  analysisResults: Annotation<Record<string, any>>(),
});

export type DefaultGraphState = typeof DefaultGraphAnnotation.State;

// Monetization Graph State using LangGraph Annotation  
export const MonetizationGraphAnnotation = Annotation.Root({
  activeThreadId: Annotation<string>(),
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  rootId: Annotation<string>(),
  userId: Annotation<string>(),
  currentMonetizationAgent: Annotation<string>(),
  monetizationAgents: Annotation<string[]>(),
  originalDisclosure: Annotation<{
    nodeId: string;
    title: string;
    disclosureText: string;
  } | null>(),
  marketAnalysis: Annotation<Record<string, any>>(),
});

export type MonetizationGraphState = typeof MonetizationGraphAnnotation.State;

// Generic compiled graph state
export type GraphState =
      Partial<ResearchGraphState> | Partial<MonetizationGraphState> | Partial<ConcurrentResearchGraphState>;

type GraphStateMap = {
  "monetizationGraph": Partial<MonetizationGraphState>;
  "researchGraph": Partial<ResearchGraphState>;
  "concurrentResearchGraph": Partial<ConcurrentResearchGraphState>;
  "defaultGraph": Partial<DefaultGraphState>;
};

const GRAPH_TYPES = ['monetizationGraph','researchGraph','concurrentResearchGraph'] as const;
type GraphType = typeof GRAPH_TYPES[number];

const makeMonetization = (msgs: BaseMessage[], ids: {activeThreadId:string;rootId:string;userId:string;}): 
GraphStateMap['monetizationGraph'] => ({
  activeThreadId: ids.activeThreadId,
  currentMonetizationAgent: '',
  marketAnalysis: {},
  messages: msgs,
  monetizationAgents: [],
  originalDisclosure: null,
  rootId: ids.rootId,
  userId: ids.userId,
});

const makeResearch = (msgs: BaseMessage[], ids: {activeThreadId:string;rootId:string;userId:string;}): 
GraphStateMap['researchGraph'] => ({
  activeThreadId: ids.activeThreadId,
  analysisResults: {},
  currentStep: '',
  messages: msgs,
  rootId: ids.rootId,
  userId: ids.userId,
});

const makeConcurrentResearch = (msgs: BaseMessage[], ids: {activeThreadId:string;rootId:string;userId:string;}): 
GraphStateMap['concurrentResearchGraph'] => ({
  activeThreadId: ids.activeThreadId,
  analysisResults: {},
  currentSteps: [],
  messages: msgs,
  rootId: ids.rootId,
  userId: ids.userId,
});

const makeDefault = (msgs: BaseMessage[], ids: {activeThreadId:string;rootId:string;userId:string;}): 
GraphStateMap['defaultGraph'] => ({
  activeThreadId: ids.activeThreadId,
  analysisResults: {},
  currentStep: '',
  messages: msgs,
  rootId: ids.rootId,
  userId: ids.userId,
});


/**
 * GraphBuilderService
 *
 * This represents your existing implementation with its architectural problems:
 * 1. Hard-coded routing logic mixed with execution
 * 2. String-based thread isolation
 * 3. Eager initialization of both graphs
 * 4. Tightly coupled workflow selection and execution
 *
 * THE CHALLENGE: Refactor this into a pluggable workflow orchestrator
 */
@Injectable()
export class GraphBuilderService implements OnModuleInit {
  private stepMap = new StepMap()
  private checkpointer = new MemorySaver();
  private dynamicGraphs: Record<string, CompiledStateGraph<any, any>> = {};
  private dynamicGraphBuilders: Record<string, StateGraph<any>> = {};
  private graphSelectionWords: Record<string, string[]> = {};
  private readonly annotationsMap: Record<string, AnnotationRoot<any>> = {
    ResearchGraphAnnotation,
    MonetizationGraphAnnotation,
    ConcurrentResearchGraphAnnotation,
    DefaultGraphAnnotation
  };

  private nodeFuctionMap: Record<string, Function> = {};
  private graphSpecCache?: GraphJsonSpec | null;

  constructor(
    private readonly logger: LoggerService,
    private readonly llmService: LLMService,
  ) {}

  async onModuleInit() {
    this.logger.info('Building Nodes');
    await this.buildNodeMethodMap();
    await this.dynamicLoadNodes();

    this.logger.info('Building Graphs');
    await this.dynamicLoadGraphs();
  }

  private async buildNodeMethodMap() {
    // Enumerate all methods ending with "Node" and capture references
    const proto = Object.getPrototypeOf(this) as Record<string, any>;
    const methodNames = Object.getOwnPropertyNames(proto);
    const nodeMethodNames = methodNames.filter(
      (name) => name !== 'constructor' && name.endsWith('Node') && typeof (this as any)[name] === 'function',
    );
    this.logger.info('Found Node Methods', { nodes: nodeMethodNames });
  }

  private async dynamicLoadNodes() {
    try {
      const spec = await this.loadGraphSpec();
      const items = spec?.nodes ?? [];
      for (const item of items) {
        for (const name of Object.getOwnPropertyNames(GraphBuilderService.prototype)) {
          if (name === item.name && name !== 'constructor' && typeof (GraphBuilderService.prototype as any)[name] === 'function') {
            this.nodeFuctionMap[name] = (GraphBuilderService.prototype as any)[name];
            this.addOrUpdateStep(item.name, {model: item.model, temperature: item.temperature});
          }
        }        
      }
    } catch (err) {
      this.logger.error('Failed to register nodes from graphs.json', err);
    }
    this.logger.info('Registered node handlers', { nodes: Object.keys(this.nodeFuctionMap) });
  }

  private async dynamicLoadGraphs() {
    try {
      const spec = await this.loadGraphSpec();
      const items = spec?.graphs ?? [];
      for (const item of items) {
        try {
          this.registerGraphFromSpec(item);
        } catch (err) {
          this.logger.error(`Failed to register dynamic graph '${item.name}'`, err);
        }
      }
    } catch (err) {
      this.logger.error('Failed to dynamically load graphs.json for graph loading', err);
    }
    this.logger.info('Registered graphs ', { graphs: Object.keys(this.dynamicGraphs) });

  }

  public registerGraphFromSpec(item: GraphJsonGraphSpec): void {
    const annotationName = item.annotationType;
    if (!annotationName) {
      this.logger.warn(`Graph '${item.name}' missing annotationType; skipping`);
      return;
    }

    const annotationRoot = this.annotationsMap[annotationName];
    if (!annotationRoot) {
      this.logger.warn(
        `Unknown annotation '${annotationName}' for graph '${item.name}'; available: ${Object.keys(
          this.annotationsMap,
        ).join(', ')}`,
      );
      return;
    }

    const builder = new StateGraph(annotationRoot);

    for (const nodeName of item.nodes ?? []) {
      const nodeFn = this.nodeFuctionMap[nodeName];
      if (!nodeFn) {
        throw new Error(`Node function '${nodeName}' not registered for graph '${item.name}'`);
      }
      builder.addNode(nodeName, nodeFn.bind(this));
    }

    // add edges
    for (const nodeEdgeNames of item.edges ?? []) {
      let startNode = null;
      let endNode = null;
      if (nodeEdgeNames.start === "__start__") {
        startNode = START;
      } else {
        startNode = nodeEdgeNames.start;
      }
      if (nodeEdgeNames.end === "__end__") {
        endNode = END;
      } else {
        endNode = nodeEdgeNames.end;
      }
      builder.addEdge(startNode, endNode);
    }    

    this.dynamicGraphBuilders[item.name] = builder;
    this.graphSelectionWords[item.name] = item.selectionWords ?? [];
    this.logger.info('Dynamically created StateGraph', { name: item.name, annotation: annotationName });
  }

  /**
   * Retrieve a dynamically loaded graph by name.
   * Compile on first request for graphType
   * Returns undefined if no graph with that name exists.
   */
  public getDynamicGraph(name: string): CompiledStateGraph<any, any> {
    const graph = this.dynamicGraphs[name];
    if (!graph) {
      const builder = this.dynamicGraphBuilders[name];
      if (builder) {
        this.dynamicGraphs[name] = builder.compile({ checkpointer: this.checkpointer });
        this.logger.info('Compiled graph', { name: name });
      } else {
        this.logger.warn(`Dynamic graph not found: ${name}`);
      }
    }
    return this.dynamicGraphs[name];
  }

  /**
   * Returns a list of the GraphTypes
   * as defined by the keys of the Record (map) that holds the graphs
   */
  public getAllGraphsAndSelectionWords(): Record<string, string[]> {
    return this.graphSelectionWords;
  }

  public getInitialStateRuntime(
    graphTypeStr: string,
    msgs: BaseMessage[],
    ids: {activeThreadId:string;rootId:string;userId:string;}    
  ): GraphState {
    if (!this.isGraphType(graphTypeStr)) {
      this.logger.warn(`Unknown graphType '${graphTypeStr}', falling back to default initial state.`);
      return makeDefault(msgs, ids);
    }

    return this.makeInitialState(graphTypeStr, msgs, ids);
  }

  private isGraphType(x: string): x is GraphType {
    return (GRAPH_TYPES as readonly string[]).includes(x);
  }  

  private makeInitialState<T extends GraphType>(
    graphType: T,
    msgs: BaseMessage[],
    ids: {activeThreadId:string;rootId:string;userId:string;}
  ): GraphStateMap[T] {
    switch (graphType) {
      case 'monetizationGraph':
        return makeMonetization(msgs, ids) as GraphStateMap[T];
      case 'researchGraph':
        return makeResearch(msgs, ids) as GraphStateMap[T];
      case 'concurrentResearchGraph':
        return makeConcurrentResearch(msgs, ids) as GraphStateMap[T];
      default:
        return makeDefault(msgs, ids) as GraphStateMap[T];
    }
  }  

  public addOrUpdateStep(stepName: string, data: StepData): void {
    this.stepMap.addOrUpdateStep(stepName, data);
  }

  // Node methods

  // Research Graph Nodes
  private async inputAnalysisNode(
    state: ResearchGraphState,
  ): Promise<Partial<ResearchGraphState>> {
    const lastMessage = state.messages[state.messages.length - 1];
    this.logger.info('Starting input analysis...');

    const messageContent = typeof lastMessage.content === 'string' ? lastMessage.content : 
      Array.isArray(lastMessage.content) ? lastMessage.content.map(c => typeof c === 'string' ? c : JSON.stringify(c)).join(' ') : String(lastMessage.content);

    const stepData = this.stepMap.get("inputAnalysisNode");
    const response = await this.llmService.executePrompt({
      model: stepData.model,
      prompt: `Analyze this invention disclosure for key information: ${messageContent}`,
      temperature: stepData.temperature,
    });

    return {
      analysisResults: {
        ...state.analysisResults,
        inputAnalysis: {
          analysis: response.content,
          keyTerms: this.extractKeyTerms(messageContent),
          timestamp: new Date().toISOString(),
        },
      },
      currentStep: 'input_analysis',
      messages: [new AIMessage(`Input Analysis Complete: ${response.content}`)],
    };
  }

  private async concurrentInputAnalysisNode(
    state: ConcurrentResearchGraphState,
  ): Promise<Partial<ConcurrentResearchGraphState>> {
    const lastMessage = state.messages[state.messages.length - 1];
    this.logger.info('Starting concurrent input analysis...');

    const messageContent = typeof lastMessage.content === 'string' ? lastMessage.content : 
      Array.isArray(lastMessage.content) ? lastMessage.content.map(c => typeof c === 'string' ? c : JSON.stringify(c)).join(' ') : String(lastMessage.content);

    const stepData = this.stepMap.get("concurrentInputAnalysisNode");
    const response = await this.llmService.executePrompt({
      model: stepData.model,
      prompt: `Analyze this invention disclosure for key information: ${messageContent}`,
      temperature: stepData.temperature,
    });

    return {
      analysisResults: {
        inputAnalysis: {
          analysis: response.content,
          keyTerms: this.extractKeyTerms(messageContent),
          timestamp: new Date().toISOString(),
        },
      },
      currentSteps: ['concurrent_input_analysis'],
      messages: [new AIMessage(`Input Analysis Complete: ${response.content}`)],
    };
  }

  private async noveltyAnalysisNode(
    state: ResearchGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<ResearchGraphState>> {
    this.logger.info('Performing novelty analysis...');

    const stepData = this.stepMap.get("noveltyAnalysisNode");
    const response = await this.llmService.executePrompt({
      model: stepData.model,
      prompt: `Analyze novelty based on: ${state.analysisResults?.inputAnalysis?.analysis}`,
      temperature: stepData.temperature,
    });

    return {
      analysisResults: {
        ...state.analysisResults,
        noveltyAnalysis: {
          analysis: response.content,
          noveltyScore: this.extractScore(response.content),
          timestamp: new Date().toISOString(),
        },
      },
      currentStep: 'novelty_analysis',
      messages: [new AIMessage(`Novelty Analysis: ${response.content}`)],
    };
  }

  private async concurrentNoveltyAnalysisNode(
    state: ConcurrentResearchGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<ConcurrentResearchGraphState>> {
    this.logger.info('Performing concurrent novelty analysis...');

    const stepData = this.stepMap.get("concurrentNoveltyAnalysisNode");
    const response = await this.llmService.executePrompt({
      model: stepData.model,
      prompt: `Analyze novelty based on: ${state.analysisResults?.inputAnalysis?.analysis}`,
      temperature: stepData.temperature,
    });

    return {
      analysisResults: {
        noveltyAnalysis: {
          analysis: response.content,
          noveltyScore: this.extractScore(response.content),
          timestamp: new Date().toISOString(),
        },
      },
      currentSteps: ['concurrent_novelty_analysis'],
      messages: [new AIMessage(`Novelty Analysis: ${response.content}`)],
    };
  }

  private async feasibilityAnalysisNode(
    state: ResearchGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<ResearchGraphState>> {
    this.logger.info('Performing feasibility analysis...');

    const stepData = this.stepMap.get("feasibilityAnalysisNode");
    const response = await this.llmService.executePrompt({
      model: stepData.model,
      prompt: `Analyze technical feasibility based on: ${state.analysisResults?.inputAnalysis?.analysis}`,
      temperature: stepData.temperature,
    });

    return {
      analysisResults: {
        ...state.analysisResults,
        feasibilityAnalysis: {
          analysis: response.content,
          feasibilityScore: this.extractScore(response.content),
          timestamp: new Date().toISOString(),
        },
      },
      currentStep: 'feasibility_analysis',
      messages: [new AIMessage(`Feasibility Analysis: ${response.content}`)],
    };
  }

  private async concurrentFeasibilityAnalysisNode(
    state: ConcurrentResearchGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<ConcurrentResearchGraphState>> {
    this.logger.info('Performing concurrent feasibility analysis...');

    const stepData = this.stepMap.get("concurrentFeasibilityAnalysisNode");
    const response = await this.llmService.executePrompt({
      model: stepData.model,
      prompt: `Analyze technical feasibility based on: ${state.analysisResults?.inputAnalysis?.analysis}`,
      temperature: stepData.temperature,
    });

    return {
      analysisResults: {
        feasibilityAnalysis: {
          analysis: response.content,
          feasibilityScore: this.extractScore(response.content),
          timestamp: new Date().toISOString(),
        },
      },
      currentSteps: ['concurrent_feasibility_analysis'],
      messages: [new AIMessage(`Feasibility Analysis: ${response.content}`)],
    };
  }

  private async impactAnalysisNode(
    state: ResearchGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<ResearchGraphState>> {
    this.logger.info('Performing impact analysis...');

    const stepData = this.stepMap.get("impactAnalysisNode");
    const response = await this.llmService.executePrompt({
      model: stepData.model,
      prompt: `Analyze market impact based on: ${state.analysisResults?.inputAnalysis?.analysis}`,
      temperature: stepData.temperature,
    });

    return {
      analysisResults: {
        ...state.analysisResults,
        impactAnalysis: {
          analysis: response.content,
          impactScore: this.extractScore(response.content),
          timestamp: new Date().toISOString(),
        },
      },
      currentStep: 'impact_analysis',
      messages: [new AIMessage(`Impact Analysis: ${response.content}`)],
    };
  }

  private async concurrentImpactAnalysisNode(
    state: ConcurrentResearchGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<ConcurrentResearchGraphState>> {
    this.logger.info('Performing concurrent impact analysis...');

    const stepData = this.stepMap.get("impactAnalysisNode");
    const response = await this.llmService.executePrompt({
      model: stepData.model,
      prompt: `Analyze market impact based on: ${state.analysisResults?.inputAnalysis?.analysis}`,
      temperature: stepData.temperature,
    });

    return {
      analysisResults: {
        impactAnalysis: {
          analysis: response.content,
          impactScore: this.extractScore(response.content),
          timestamp: new Date().toISOString(),
        },
      },
      currentSteps: ['concurrent_impact_analysis'],
      messages: [new AIMessage(`Impact Analysis: ${response.content}`)],
    };
  }

  private async synthesisNode(
    state: ResearchGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<ResearchGraphState>> {
    this.logger.info('Generating research synthesis...');

    const { noveltyAnalysis, feasibilityAnalysis, impactAnalysis } = state.analysisResults || {};
    
    const overallScore = Math.round(
      ((noveltyAnalysis?.noveltyScore || 50) +
        (feasibilityAnalysis?.feasibilityScore || 50) +
        (impactAnalysis?.impactScore || 50)) / 3
    );

    const synthesis = {
      overallScore,
      recommendation: this.generateRecommendation(overallScore),
      summary: `Research complete. Novelty: ${noveltyAnalysis?.noveltyScore || 'N/A'}, Feasibility: ${feasibilityAnalysis?.feasibilityScore || 'N/A'}, Impact: ${impactAnalysis?.impactScore || 'N/A'}`,
      timestamp: new Date().toISOString(),
    };

    return {
      analysisResults: {
        ...state.analysisResults,
        synthesis,
      },
      currentStep: 'synthesis',
      messages: [new AIMessage(`Research Summary: ${synthesis.summary}\n\nRecommendation: ${synthesis.recommendation}`)],
    };
  }

  private async concurrentSynthesisNode(
    state: ConcurrentResearchGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<ConcurrentResearchGraphState>> {
    this.logger.info('Generating concurrent research synthesis...');

    const { noveltyAnalysis, feasibilityAnalysis, impactAnalysis } = state.analysisResults || {};
    
    const overallScore = Math.round(
      ((noveltyAnalysis?.noveltyScore || 50) +
        (feasibilityAnalysis?.feasibilityScore || 50) +
        (impactAnalysis?.impactScore || 50)) / 3
    );

    const synthesis = {
      overallScore,
      recommendation: this.generateRecommendation(overallScore),
      summary: `Research complete. Novelty: ${noveltyAnalysis?.noveltyScore || 'N/A'}, Feasibility: ${feasibilityAnalysis?.feasibilityScore || 'N/A'}, Impact: ${impactAnalysis?.impactScore || 'N/A'}`,
      timestamp: new Date().toISOString(),
    };

    return {
      analysisResults: {
        synthesis,
      },
      currentSteps: ['concurrent_synthesis'],
      messages: [new AIMessage(`Research Summary: ${synthesis.summary}\n\nRecommendation: ${synthesis.recommendation}`)],
    };
  }

  private async awaitApprovalNode(
    state: ResearchGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<ResearchGraphState>> {
    this.logger.info('Awaiting user approval for research results...');

    // REAL LANGGRAPH INTERRUPT - This pauses the workflow for human input!
    const userResponse = await interrupt({
      value: {
        prompt: 'Do you want to proceed with this research analysis?',
        options: ['Yes, proceed', 'No, revise analysis', 'Need more information'],
        type: 'approval_gate',
        results: state.analysisResults?.synthesis,
      },
    });

    return {
      currentStep: 'await_approval',
      messages: [new AIMessage(`User decision: ${JSON.stringify(userResponse)}`)],
    };
  }

  private async concurrentAwaitApprovalNode(
    state: ConcurrentResearchGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<ConcurrentResearchGraphState>> {
    this.logger.info('Awaiting concurrent user approval for research results...');

    // REAL LANGGRAPH INTERRUPT - This pauses the workflow for human input!
    const userResponse = await interrupt({
      value: {
        prompt: 'Do you want to proceed with this research analysis?',
        options: ['Yes, proceed', 'No, revise analysis', 'Need more information'],
        type: 'approval_gate',
        results: state.analysisResults?.synthesis,
      },
    });

    return {
      currentSteps: ['concurrent_await_approval'],
      messages: [new AIMessage(`User decision: ${JSON.stringify(userResponse)}`)],
    };
  }

  // Monetization Graph Nodes
  private async marketResearchNode(
    state: MonetizationGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<MonetizationGraphState>> {
    this.logger.info('Conducting market research...');

    const stepData = this.stepMap.get("marketResearchNode");
    const lastMessage = state.messages[state.messages.length - 1];
    const response = await this.llmService.executePrompt({
      model: stepData.model,
      prompt: `Conduct market research for: ${lastMessage.content}`,
      temperature: stepData.temperature,
    });

    return {
      marketAnalysis: {
        ...state.marketAnalysis,
        marketResearch: {
          analysis: response.content,
          marketSize: Math.floor(Math.random() * 1000000) + 100000,
          timestamp: new Date().toISOString(),
        },
      },
      messages: [new AIMessage(`Market Research: ${response.content}`)],
    };
  }

  private async businessModelNode(
    state: MonetizationGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<MonetizationGraphState>> {
    this.logger.info('Developing business model...');

    const stepData = this.stepMap.get("businessModelNode");
    const response = await this.llmService.executePrompt({
      model: stepData.model,
      prompt: `Develop business model based on market research: ${state.marketAnalysis?.marketResearch?.analysis}`,
      temperature: stepData.temperature,
    });

    return {
      marketAnalysis: {
        ...state.marketAnalysis,
        businessModel: {
          model: response.content,
          revenueStreams: ['Licensing', 'Direct Sales', 'Subscription'],
          timestamp: new Date().toISOString(),
        },
      },
      messages: [new AIMessage(`Business Model: ${response.content}`)],
    };
  }

  private async pricingStrategyNode(
    state: MonetizationGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<MonetizationGraphState>> {
    this.logger.info('Developing pricing strategy...');

    const stepData = this.stepMap.get("pricingStrategyNode");
    const response = await this.llmService.executePrompt({
      model: stepData.model,
      prompt: `Create pricing strategy for: ${state.marketAnalysis?.businessModel?.model}`,
      temperature: stepData.temperature,
    });

    return {
      marketAnalysis: {
        ...state.marketAnalysis,
        pricingStrategy: {
          strategy: response.content,
          pricePoints: ['$99/month', '$999/year', '$5000 enterprise'],
          timestamp: new Date().toISOString(),
        },
      },
      messages: [new AIMessage(`Pricing Strategy: ${response.content}`)],
    };
  }

  private async awaitStrategyApprovalNode(
    state: MonetizationGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<MonetizationGraphState>> {
    this.logger.info('Awaiting monetization strategy approval...');

    // REAL LANGGRAPH INTERRUPT - Shows interactive workflow capability!
    const userResponse = await interrupt({
      value: {
        prompt: 'Choose your preferred monetization approach:',
        options: ['Licensing Focus', 'Direct Product Sales', 'Hybrid Approach'],
        type: 'strategy_selection',
        context: state.marketAnalysis,
      },
    });

    return {
      messages: [new AIMessage(`Strategy approved: ${JSON.stringify(userResponse)}`)],
    };
  }

  private async implementationPlanNode(
    state: MonetizationGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<MonetizationGraphState>> {
    this.logger.info('Creating implementation plan...');

    const stepData = this.stepMap.get("implementationPlanNode");
    const response = await this.llmService.executePrompt({
      model: stepData.model,
      prompt: `Create implementation plan for approved strategy: ${JSON.stringify(state.marketAnalysis)}`,
      temperature: stepData.temperature,
    });

    return {
      marketAnalysis: {
        ...state.marketAnalysis,
        implementationPlan: {
          plan: response.content,
          timeline: '6 months',
          milestones: ['Legal Setup', 'Product Development', 'Market Entry'],
          timestamp: new Date().toISOString(),
        },
      },
      messages: [new AIMessage(`Implementation Plan: ${response.content}`)],
    };
  }

  // Helper methods
  private extractKeyTerms(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 4)
      .slice(0, 10);
  }

  private extractScore(content: string): number {
    const match = content.match(/(\d+)(?:\/100|%)/);
    return match ? Number.parseInt(match[1]) : 50;
  }

  private generateRecommendation(score: number): string {
    if (score >= 80) return 'Highly recommended for patent filing and commercialization';
    if (score >= 60) return 'Recommended with further development';
    if (score >= 40) return 'Proceed with caution, needs significant work';
    return 'Not recommended in current form';
  }

  private async loadGraphSpec(): Promise<GraphJsonSpec | null> {
    if (this.graphSpecCache !== undefined) {
      return this.graphSpecCache;
    }

    const candidates = [
      path.resolve(process.cwd(), 'src/current-system/graphs.json'),
      path.resolve(__dirname, 'graphs.json'),
    ];

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
      } catch (err) {
        // continue trying next candidate on access errors, log parse issues
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          this.logger.error(`Error reading graphs.json candidate: ${candidate}`, err);
        }
        continue;
      }

      try {
        const raw = await fs.readFile(candidate, 'utf-8');
        this.graphSpecCache = JSON.parse(raw) as GraphJsonSpec;
        return this.graphSpecCache;
      } catch (err) {
        this.logger.error(`Failed to parse graphs.json at ${candidate}`, err);
        this.graphSpecCache = null;
        return this.graphSpecCache;
      }
    }

    this.logger.warn('graphs.json not found; skipping dynamic graph load');
    this.graphSpecCache = null;
    return this.graphSpecCache;
  }  
}

export interface StepData {
  model?: string
  temperature?: number
}

class StepMap {
  private steps: Map<string, StepData> = new Map()

  addOrUpdateStep(stepName: string, data: StepData): void {
    this.steps.set(stepName, data)
  }

  // optional getter
  get(stepName: string): StepData | undefined {
    return this.steps.get(stepName)
  }
}
