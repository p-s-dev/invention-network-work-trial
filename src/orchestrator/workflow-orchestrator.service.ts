import { Injectable } from '@nestjs/common';
import { ThreadStoreService } from '../thread-store/thread-store.service';
import { ThreadRecord } from '../thread-store/thread-store.types';
import { AIMessage, type BaseMessage, HumanMessage } from '@langchain/core/messages';
import { GraphInstance, GraphState } from '../current-system/langgraph.service';
import type { LangGraphRunnableConfig, StateGraph, CompiledStateGraph } from '@langchain/langgraph';
import { GraphBuilderService, ResearchGraphAnnotation, ResearchGraphState } from '../current-system/graph-builder.service';
import selectGraphConfig from './select-graph-config.json';
import { threadId } from 'worker_threads';
import { LoggerService } from '../services/logger.service';

export interface EnsureMostRecentResult {
  createdNew: boolean;
  created?: ThreadRecord;
  mostRecent?: ThreadRecord;
}

export interface SelectedGraph {
  graphType: string;
  graph: CompiledStateGraph<any, any>;
  config: LangGraphRunnableConfig;
  newThread: boolean;
  threadAndRoot: ThreadAndRoot;
}

export interface ThreadAndRoot {
  threadId: string,
  rootId: string
}

// Simplified types from your actual system
interface ConversationContext {
  threadMessages: Array<{ kind: 'message.human' | 'message.ai'; text: string }>;
  conversationHistory: string[];
  workflowExecutionHistory: Array<{ workflowId: string; timestamp: number; results: any }>;
  userInteractionHistory: Array<{ interactionId: string; response: any; timestamp: number }>;
  inventionDisclosureId?: string;
}

// Helper builders
interface NewThreadStateParams {
  graphType: string;
  message: string;
  conversationContext: ConversationContext;
  userId: string;
  threadId: string;
  rootThreadId: string;
}

interface GraphThreadCountAndMostRecentDate {
  count: number,
  lastUpdatedAt: Date,
  lastUpdatedThreadId: string
  lastUpdatedRootId: string
}

interface SelectGraphConfig {
  fiveMinutes: number;
  pointsForThread: number;
  pointsForRecent: number;
  pointsForWordMatch: number;
  pointsForKeyWordMatch: number;
}

const {
  fiveMinutes,
  pointsForThread,
  pointsForRecent,
  pointsForWordMatch,
  pointsForKeyWordMatch,
} = selectGraphConfig as SelectGraphConfig;

@Injectable()
export class WorkflowOrchestratorService {
  constructor(
    private readonly threadStore: ThreadStoreService,
    private readonly graphBuilder: GraphBuilderService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Check if user has any existing graph/thread instances
   *   return a count of threads for each thread type
   */
  async findThreadTypeCountsByUser(
    userId: string
  ): Promise<Map<string, GraphThreadCountAndMostRecentDate>> {
    const threads = await this.threadStore.readThreadsByUser(userId);

    const graphsCountAndLastUpdated = new Map<string, GraphThreadCountAndMostRecentDate>();

    for (const item of threads) {
      const existing = graphsCountAndLastUpdated.get(item.graphType);

      if (!existing) {
        graphsCountAndLastUpdated.set(item.graphType, {
          count: 1,
          lastUpdatedAt: item.lastUpdatedAt,
          lastUpdatedThreadId: item.threadId,
          lastUpdatedRootId: item.rootThreadId,
        });
        continue;
      }

      const updated: GraphThreadCountAndMostRecentDate = {
        count: existing.count + 1,
        lastUpdatedAt: existing.lastUpdatedAt,
        lastUpdatedThreadId: existing.lastUpdatedThreadId,
        lastUpdatedRootId: existing.lastUpdatedRootId,
      };

      if (item.lastUpdatedAt > existing.lastUpdatedAt) {
        updated.lastUpdatedAt = item.lastUpdatedAt;
        updated.lastUpdatedThreadId = item.threadId;
        updated.lastUpdatedRootId = item.rootThreadId;
      }

      graphsCountAndLastUpdated.set(item.graphType, updated);
    }

    return graphsCountAndLastUpdated;
  }

  /**
   * Dynamic selecting of Graph
   * 
   * 1. select the graph to call
   * 2. get graph from graphBuilder
   * 3. compile graph
   * 4. build runnable config for graph
   * 5. build initialState for graph if first thread for that graph type
   * 
   * @param userId 
   * @param message 
   * @param conversationContext 
   * @param mostRecentResult 
   * @returns 
   */
  async selectGraph(
    userId: string, 
    message: string, 
    conversationContext: ConversationContext, 
    threadTypeCountsByUser: Map<string, GraphThreadCountAndMostRecentDate>
  ): Promise<SelectedGraph> {

    const graphType = this.scoreGraphsAndSelectOne(message, threadTypeCountsByUser);

    const threadAndRoot = await this.getThreadId(userId, graphType, threadTypeCountsByUser);

    // Fetch the dynamic graph by name from GraphBuilderService
    const graph = this.graphBuilder.getDynamicGraph(graphType);

    // Build LangGraphRunnableConfig 
    const config: LangGraphRunnableConfig = this.getConfigForGraph(
      graphType,
      conversationContext,
      threadAndRoot.threadId,
    );

    const stateSnapshot = await graph.getState(config);
    const newThread = !stateSnapshot?.createdAt;

    return {
      graphType,
      graph,
      config,
      newThread,
      threadAndRoot
    };
  }

  // if history contains selected graphType, return lastUpdate
  // else make new history and return new threadId
  private async getThreadId(
    userId: string, 
    graphType: string, 
    threadTypeCountsByUser: Map<string, GraphThreadCountAndMostRecentDate>
  ): Promise<ThreadAndRoot> {
    // if selected a graph with no history, make it
    if (threadTypeCountsByUser.has(graphType)) {
      const lastUpdatedThreadId = threadTypeCountsByUser.get(graphType).lastUpdatedThreadId;
      await this.threadStore.updateLastUpdatedAtFor(userId, lastUpdatedThreadId);
      return {
        threadId: lastUpdatedThreadId,
        rootId: threadTypeCountsByUser.get(graphType).lastUpdatedRootId,
      }
    } else {
      return this.makeNewThread(userId, graphType);
    }
  }

  private async makeNewThread(
    userId: string, 
    graphType: string
  ): Promise<ThreadAndRoot> {
    const newThreadIdRandomPart = `thread_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const rootId = "root_" + newThreadIdRandomPart
    const threadId = graphType + "_" + newThreadIdRandomPart
    const created = await this.threadStore.createThread({ 
        userId, 
        rootThreadId: rootId, 
        threadId: threadId, 
        graphType: graphType 
      });
      return {
        threadId: created.threadId,
        rootId: created.rootThreadId
      };
  }

  /**
   * Score each graph type to select.
   * 
   * Search the message:
   *  For each graph selection word, add 1 point
   *  For each special word, add 10 points
   * 
   * For existing graphTypes:
   *  Each thread adds 1 point
   *  Threads less than 5 minutes old add 5 points
   * 
   * TODO: consider AI sentiment for selection of graph to route to
   */
  private scoreGraphsAndSelectOne(
    message: string,
    threadTypeCountsByUser: Map<string, GraphThreadCountAndMostRecentDate>    
  ): string {

    const graphsAndSelectionWords = this.graphBuilder.getAllGraphsAndSelectionWords();

    let maxKey: string | undefined;
    let maxScore = -Infinity;
    const scores = new Map<string, number>();

    // count times message contains each graph's selection words
    // if selection word starts with @ then it counts as 10 matches
    for (const [key, arr] of Object.entries(graphsAndSelectionWords)) {
      const count = arr.reduce((acc, word) => {
        if (!message.includes(word)) return acc;
        return acc + (word.startsWith("@") ? pointsForKeyWordMatch : pointsForWordMatch);
      }, 0);
      scores.set(key, count)
    }

    // Add 1 for each thread
    // Add 5 if thread less than 5 min old
    for (const key of Object.keys(graphsAndSelectionWords)) {
      const threadHistory = threadTypeCountsByUser.get(key);
      if (threadHistory !== undefined) {
        let updateScore = scores.get(key);
        const threadCount = threadTypeCountsByUser.get(key).count;
        const lastUpdated = threadTypeCountsByUser.get(key).lastUpdatedAt.getTime();

        updateScore += threadCount * pointsForThread;

        if (Date.now() - lastUpdated < fiveMinutes) {
          updateScore += pointsForRecent;
        }

        scores.set(key, updateScore);
      }
    }
    const scoreLog = Array.from(scores.entries())
      .filter(([_, v]) => v !== 0)
      .map(([k, v]) => `${k}:${v}`)
      .join(", ");

    this.logger.info('scores', {scoreLog});


    // return key with max score
    for (const [key, value] of scores) {
      if (value > maxScore) {
        maxScore = value;
        maxKey = key;
      }
    }    

    return maxKey;
  }

  /**
   * Build the LangGraph runnable config for a selected graph, binding
   * the conversation context and thread identifier.
   */
  private getConfigForGraph(
    graphType: string,
    conversationContext: ConversationContext,
    threadId: string,
  ): LangGraphRunnableConfig {

    return {
      configurable: {
        conversation_context: conversationContext,
        thread_id: threadId
      },
    } as LangGraphRunnableConfig;
  }

  /**
   * Build initial state when executing a graph for the first time
   */
  public getInitialStateForNewThread(params: NewThreadStateParams): GraphState {
    const { graphType, message, conversationContext, userId, threadId, rootThreadId } = params;

    // Convert conversation context to LangGraph messages and include current message
    const langGraphMessages: BaseMessage[] = conversationContext.threadMessages.map((msg) =>
      msg.kind === 'message.human' ? new HumanMessage(msg.text) : new AIMessage(msg.text),
    );
    langGraphMessages.push(new HumanMessage(message));

    const initialState = this.graphBuilder.getInitialStateRuntime(
      graphType, 
      langGraphMessages,
      {
        activeThreadId: threadId,
        rootId: rootThreadId,
        userId: userId,
      }      
    );

    return initialState;
  }

}
