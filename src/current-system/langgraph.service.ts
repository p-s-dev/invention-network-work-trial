import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AIMessage, type BaseMessage, HumanMessage } from '@langchain/core/messages';
import type { LangGraphRunnableConfig, CompiledStateGraph } from '@langchain/langgraph';
import { Annotation, interrupt, MemorySaver, StateGraph } from '@langchain/langgraph';
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

// Generic compiled graph instance type (union of both factories)
export type AnnotationInstance =
  | typeof ResearchGraphAnnotation
  | typeof MonetizationGraphAnnotation;

export type AnyGraphState =
  | typeof ResearchGraphAnnotation.State
  | typeof MonetizationGraphAnnotation.State;

export const annotationsMap: Record<string, AnnotationInstance> = {
  ResearchGraphAnnotation,
  MonetizationGraphAnnotation,
};

// Generic compiled graph instance type (union of both factories)
// Use library-typed compiled graph for flexibility with dynamic/lazy graphs
export type GraphInstance = CompiledStateGraph<any, any>;

// Generic compiled graph state
export type GraphState =
      Partial<ResearchGraphState> | Partial<MonetizationGraphState>;

/**
 * CURRENT SYSTEM: LangGraphService (Realistic from your actual codebase)
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
export class LangGraphService implements OnModuleInit {
  private researchGraph!: ReturnType<typeof this.createResearchGraph>;
  private monetizationGraph!: ReturnType<typeof this.createMonetizationGraph>;

  private checkpointer = new MemorySaver();

  constructor(
    private readonly logger: LoggerService,
    private readonly llmService: LLMService,
  ) {}

  async onModuleInit() {
    // PROBLEM: Always initializes both graphs regardless of usage
    this.researchGraph = this.createResearchGraph();
    this.monetizationGraph = this.createMonetizationGraph();
  }

  /**
   * Create the research graph using real LangGraph StateGraph
   */
  private createResearchGraph() {
    return new StateGraph(ResearchGraphAnnotation)
      .addNode('input_analysis', this.inputAnalysisNode.bind(this))
      .addNode('novelty_analysis', this.noveltyAnalysisNode.bind(this))
      .addNode('feasibility_analysis', this.feasibilityAnalysisNode.bind(this))
      .addNode('impact_analysis', this.impactAnalysisNode.bind(this))
      .addNode('synthesis', this.synthesisNode.bind(this))
      .addNode('await_approval', this.awaitApprovalNode.bind(this))
      // Sequential flow
      .addEdge('__start__', 'input_analysis')
      .addEdge('input_analysis', 'novelty_analysis')
      .addEdge('novelty_analysis', 'feasibility_analysis')
      .addEdge('feasibility_analysis', 'impact_analysis')
      .addEdge('impact_analysis', 'synthesis')
      .addEdge('synthesis', 'await_approval')
      .addEdge('await_approval', '__end__')
      .compile({ checkpointer: this.checkpointer });
  }

  /**
   * Create the monetization graph using real LangGraph StateGraph
   */
  private createMonetizationGraph() {
    return new StateGraph(MonetizationGraphAnnotation)
      .addNode('market_research', this.marketResearchNode.bind(this))
      .addNode('business_model', this.businessModelNode.bind(this))
      .addNode('pricing_strategy', this.pricingStrategyNode.bind(this))
      .addNode('await_strategy_approval', this.awaitStrategyApprovalNode.bind(this))
      .addNode('implementation_plan', this.implementationPlanNode.bind(this))
      // Sequential flow with human interaction
      .addEdge('__start__', 'market_research')
      .addEdge('market_research', 'business_model')
      .addEdge('business_model', 'pricing_strategy')
      .addEdge('pricing_strategy', 'await_strategy_approval')
      .addEdge('await_strategy_approval', 'implementation_plan')
      .addEdge('implementation_plan', '__end__')
      .compile({ checkpointer: this.checkpointer });
  }

  // Research Graph Nodes
  private async inputAnalysisNode(
    state: ResearchGraphState,
  ): Promise<Partial<ResearchGraphState>> {
    const lastMessage = state.messages[state.messages.length - 1];
    this.logger.info('Starting input analysis...');

    const messageContent = typeof lastMessage.content === 'string' ? lastMessage.content : 
      Array.isArray(lastMessage.content) ? lastMessage.content.map(c => typeof c === 'string' ? c : JSON.stringify(c)).join(' ') : String(lastMessage.content);

    const response = await this.llmService.executePrompt({
      model: 'gpt-4',
      prompt: `Analyze this invention disclosure for key information: ${messageContent}`,
      temperature: 0.3,
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

  private async noveltyAnalysisNode(
    state: ResearchGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<ResearchGraphState>> {
    this.logger.info('Performing novelty analysis...');

    const response = await this.llmService.executePrompt({
      model: 'gpt-4',
      prompt: `Analyze novelty based on: ${state.analysisResults?.inputAnalysis?.analysis}`,
      temperature: 0.2,
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

  private async feasibilityAnalysisNode(
    state: ResearchGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<ResearchGraphState>> {
    this.logger.info('Performing feasibility analysis...');

    const response = await this.llmService.executePrompt({
      model: 'gpt-4',
      prompt: `Analyze technical feasibility based on: ${state.analysisResults?.inputAnalysis?.analysis}`,
      temperature: 0.2,
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

  private async impactAnalysisNode(
    state: ResearchGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<ResearchGraphState>> {
    this.logger.info('Performing impact analysis...');

    const response = await this.llmService.executePrompt({
      model: 'gpt-4',
      prompt: `Analyze market impact based on: ${state.analysisResults?.inputAnalysis?.analysis}`,
      temperature: 0.3,
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

  // Monetization Graph Nodes
  private async marketResearchNode(
    state: MonetizationGraphState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<MonetizationGraphState>> {
    this.logger.info('Conducting market research...');

    const lastMessage = state.messages[state.messages.length - 1];
    const response = await this.llmService.executePrompt({
      model: 'gpt-4',
      prompt: `Conduct market research for: ${lastMessage.content}`,
      temperature: 0.3,
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

    const response = await this.llmService.executePrompt({
      model: 'gpt-4',
      prompt: `Develop business model based on market research: ${state.marketAnalysis?.marketResearch?.analysis}`,
      temperature: 0.2,
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

    const response = await this.llmService.executePrompt({
      model: 'gpt-4',
      prompt: `Create pricing strategy for: ${state.marketAnalysis?.businessModel?.model}`,
      temperature: 0.2,
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

    const response = await this.llmService.executePrompt({
      model: 'gpt-4',
      prompt: `Create implementation plan for approved strategy: ${JSON.stringify(state.marketAnalysis)}`,
      temperature: 0.2,
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

  /**
   * PROBLEM: Hard-coded routing logic mixed with execution logic
   * This method does too many things:
   * - Decides which graph to use
   * - Manages thread isolation
   * - Handles state management
   * - Executes the workflow
   */
  async *executeResearch(
    message: string,
    activeThreadId: string,
    rootId: string,
    userId: string,
    conversationContext: ConversationContext,
  ) {
    // PROBLEM: String-based thread isolation is fragile
    const researchThreadId = `research_${activeThreadId}`;
    const monetizationThreadId = `monetization_${activeThreadId}`;

    const researchConfig: LangGraphRunnableConfig = {
      configurable: {
        conversation_context: conversationContext,
        thread_id: researchThreadId,
      },
    };

    const monetizationConfig: LangGraphRunnableConfig = {
      configurable: {
        conversation_context: conversationContext,
        thread_id: monetizationThreadId,
      },
    };

    // Check existing state
    const researchState = await this.researchGraph.getState(researchConfig);
    const monetizationState = await this.monetizationGraph.getState(monetizationConfig);

    const isNewThread = !researchState?.createdAt && !monetizationState?.createdAt;

    let graph: ReturnType<typeof this.createResearchGraph> | ReturnType<typeof this.createMonetizationGraph>;
    let isMonetizationRequest = false;

    if (isNewThread) {
      // PROBLEM: Hard-coded keyword matching for routing
      isMonetizationRequest = message.includes('@monetize');
      graph = isMonetizationRequest ? this.monetizationGraph : this.researchGraph;
    } else {
      // PROBLEM: Complex state inspection logic embedded in execution
      if (monetizationState?.createdAt) {
        isMonetizationRequest = true;
        graph = this.monetizationGraph;
        this.logger.info(`Resuming MONETIZATION conversation - Thread: ${activeThreadId}`);
      } else {
        graph = this.researchGraph;
        this.logger.info(`Resuming RESEARCH conversation - Thread: ${activeThreadId}`);
      }
    }

    const config = isMonetizationRequest ? monetizationConfig : researchConfig;
    const stateSnapshot = await graph.getState(config);
    const finalIsNewThread = !stateSnapshot?.createdAt;

    if (finalIsNewThread) {
      const graphType = isMonetizationRequest ? 'MONETIZATION' : 'RESEARCH';
      this.logger.info(
        `Starting NEW ${graphType} conversation - Root Node: ${rootId}, Thread: ${activeThreadId}, Query: ${message}`,
      );

      // Convert conversation context to LangGraph messages
      const langGraphMessages: BaseMessage[] = conversationContext.threadMessages.map((msg) => {
        return msg.kind === 'message.human' ? new HumanMessage(msg.text) : new AIMessage(msg.text);
      });
      
      // Add current message
      langGraphMessages.push(new HumanMessage(message));

      // PROBLEM: Complex state initialization logic
      let initialState: Partial<ResearchGraphState> | Partial<MonetizationGraphState>;

      if (graphType === 'MONETIZATION') {
        initialState = {
          activeThreadId: activeThreadId,
          currentMonetizationAgent: '',
          marketAnalysis: {},
          messages: langGraphMessages,
          monetizationAgents: [],
          originalDisclosure: null,
          rootId: rootId,
          userId: userId,
        } as Partial<MonetizationGraphState>;
      } else {
        initialState = {
          activeThreadId: activeThreadId,
          analysisResults: {},
          currentStep: '',
          messages: langGraphMessages,
          rootId: rootId,
          userId: userId,
        } as Partial<ResearchGraphState>;
      }

      // Stream the graph execution
      const stream = await graph.stream(initialState, {
        ...config,
        streamMode: ['updates'] as const,
      });

      for await (const chunk of stream) {
        // Emit progress events in a format similar to production
        yield {
          type: 'node_progress',
          data: chunk,
          timestamp: Date.now(),
        };
      }
    } else {
      // Resume existing conversation
      this.logger.info(
        `RESUMING conversation - Root Node: ${rootId}, Thread: ${activeThreadId}, Message: ${message}`,
      );

      const stream = await graph.stream(
        { messages: [new HumanMessage(message)] },
        {
          ...config,
          streamMode: ['updates'] as const,
        },
      );

      for await (const chunk of stream) {
        // Emit progress events in a format similar to production
        yield {
          type: 'node_progress',
          data: chunk,
          timestamp: Date.now(),
        };
      }
    }
  }

  async *executeNewKnownGraph(
    message: string,
    activeThreadId: string,
    rootId: string,
    userId: string,
    conversationContext: ConversationContext,
    graphType: string,
    graph: GraphInstance,
    config: LangGraphRunnableConfig,
    initialState: GraphState
  ) {
      this.logger.info(
        `Starting NEW ${graphType} conversation - Root Node: ${rootId}, Thread: ${activeThreadId}, Query: ${message}`,
      );

      // Convert conversation context to LangGraph messages
      const langGraphMessages: BaseMessage[] = conversationContext.threadMessages.map((msg) => {
        return msg.kind === 'message.human' ? new HumanMessage(msg.text) : new AIMessage(msg.text);
      });
      
      // Add current message
      langGraphMessages.push(new HumanMessage(message));
      
      // Stream the graph execution
      const stream = await graph.stream(initialState, {
        ...config,
        streamMode: ['updates'] as const,
      });

      for await (const chunk of stream) {
        // Emit progress events in a format similar to production
        yield {
          type: 'node_progress',
          data: chunk,
          timestamp: Date.now(),
        };
      }

  }

  async *executeKnownGraph(
    message: string,
    activeThreadId: string,
    rootId: string,
    userId: string,
    conversationContext: ConversationContext,
    graphType: string,
    graph: GraphInstance,
    config: LangGraphRunnableConfig
  ) {

    const graphRunnableConfig: LangGraphRunnableConfig = {
      configurable: {
        conversation_context: conversationContext,
        thread_id: activeThreadId,
      },
    };

    const graphState = await graph.getState(graphRunnableConfig);

      // Resume existing conversation
      this.logger.info(
        `RESUMING conversation - Root Node: ${rootId}, Thread: ${activeThreadId}, Message: ${message}`,
      );

      const stream = await graph.stream(
        { messages: [new HumanMessage(message)] },
        {
          ...config,
          streamMode: ['updates'] as const,
        },
      );

      for await (const chunk of stream) {
        // Emit progress events in a format similar to production
        yield {
          type: 'node_progress',
          data: chunk,
          timestamp: Date.now(),
        };
      }

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
}
