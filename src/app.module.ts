import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LangGraphService } from './current-system/langgraph.service';
import { GraphBuilderService } from './current-system/graph-builder.service';
import { LLMService } from './services/llm.service';
import { LoggerService } from './services/logger.service';
import { ThreadStoreModule } from './thread-store/thread-store.module';
import { WorkflowOrchestratorService } from './orchestrator/workflow-orchestrator.service';

@Module({
  controllers: [AppController],
  imports: [ThreadStoreModule],
  providers: [AppService, GraphBuilderService, LangGraphService, LoggerService, LLMService, WorkflowOrchestratorService],
})
export class AppModule {}
