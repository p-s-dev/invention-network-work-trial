import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppService } from './app.service';
import { LangGraphService } from './current-system/langgraph.service';
import { WorkflowOrchestratorService } from './orchestrator/workflow-orchestrator.service';
import { GraphBuilderService, GraphJsonGraphSpec, StepData } from './current-system/graph-builder.service';

interface ExecuteNodeUpdateRequest {
  stepName: string;
  data: StepData;
}

interface ExecuteRequest {
  message: string;
  userId: string;
  threadId?: string;
  rootId?: string;
  conversationContext?: {
    threadMessages: Array<{ kind: 'message.human' | 'message.ai'; text: string }>;
    conversationHistory: string[];
    workflowExecutionHistory: Array<{ workflowId: string; timestamp: number; results: any }>;
    userInteractionHistory: Array<{ interactionId: string; response: any; timestamp: number }>;
    inventionDisclosureId?: string;
  };
}

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly langGraphService: LangGraphService,
    private readonly orchestrator: WorkflowOrchestratorService,
    private readonly graphBuilderService: GraphBuilderService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  healthCheck() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Current System Endpoint - demonstrates the existing implementation
   */
  @Post('execute-current')
  async executeCurrentSystem(@Body() request: ExecuteRequest, @Res() response: Response) {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');

    const threadId = request.threadId ||`thread_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const rootId = request.rootId || `root_${threadId}`;
    const conversationContext = request.conversationContext || { 
      threadMessages: [], 
      conversationHistory: [], 
      workflowExecutionHistory: [], 
      userInteractionHistory: [] 
    };

    try {
      for await (const chunk of this.langGraphService.executeResearch(
        request.message,
        threadId,
        rootId,
        request.userId,
        conversationContext,
      )) {
        const sseData = `data: ${JSON.stringify(chunk)}\n\n`;
        response.write(sseData);
      }
    } catch (error) {
      response.write(`data: ${JSON.stringify({ error: error.message , type: 'error'})}\n\n`);
    } finally {
      response.end();
    }
  }

  /**
   * NEW SYSTEM ENDPOINT - for your workflow orchestrator implementation
   * 
   * TODO: Implement this endpoint using your new WorkflowOrchestrator
   */
  @Post('execute-new')
  async executeNewSystem(@Body() request: ExecuteRequest, @Res() response: Response) {
    // Stream execution using most recent or newly created thread from orchestrator
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');

    const conversationContext = request.conversationContext || {
      threadMessages: [],
      conversationHistory: [],
      workflowExecutionHistory: [],
      userInteractionHistory: [],
    };

    const threadTypeCountsByUser = 
      await this.orchestrator.findThreadTypeCountsByUser(request.userId);

    const graph = 
      await this.orchestrator.selectGraph(
        request.userId, 
        request.message,
        conversationContext, 
        threadTypeCountsByUser);

    try {
      if (graph.newThread) {
        const initialState = this.orchestrator.getInitialStateForNewThread({
            graphType: graph.graphType,
            message: request.message,
            conversationContext: conversationContext,
            userId: request.userId,
            threadId: graph.threadAndRoot.threadId,
            rootThreadId: graph.threadAndRoot.rootId,
          });

        for await (const chunk of this.langGraphService.executeNewKnownGraph(
          request.message,
          graph.config.configurable.thread_id,
          graph.threadAndRoot.rootId,
          request.userId,
          conversationContext,
          graph.graphType,
          graph.graph,
          graph.config,
          initialState
        )) {
          const sseData = `data: ${JSON.stringify(chunk)}\n\n`;
          response.write(sseData);
        }
      } else {
        for await (const chunk of this.langGraphService.executeKnownGraph(
          request.message,
          graph.threadAndRoot.threadId,
          graph.threadAndRoot.rootId,
          request.userId,
          conversationContext,
          graph.graphType,
          graph.graph,
          graph.config,
        )) {
          const sseData = `data: ${JSON.stringify(chunk)}\n\n`;
          response.write(sseData);
        }
      }

    } catch (error) {
      response.write(`data: ${JSON.stringify({ error: (error as Error).message, type: 'error' })}\n\n`);
    } finally {
      response.end();
    }
  }

  @Post('add-graph')
  async executeAddGraph(@Body() request: GraphJsonGraphSpec, @Res() response: Response) {
    try {
      this.graphBuilderService.registerGraphFromSpec(request);
    } catch (error) {
      response.write(`data: ${JSON.stringify({ error: (error as Error).message, type: 'error' })}\n\n`);
    } finally {
      response.end();
    }
  }

  @Post('update-node')
  async executeUpdateNodeParams(@Body() request: ExecuteNodeUpdateRequest, @Res() response: Response) {
    try {
      this.graphBuilderService.addOrUpdateStep(request.stepName, request.data);
    } catch (error) {
      response.write(`data: ${JSON.stringify({ error: (error as Error).message, type: 'error' })}\n\n`);
    } finally {
      response.end();
    }
  }


}
