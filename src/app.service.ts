import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return `
    🚀 Workflow Orchestrator Challenge

    This is a trial project based on real production code.
    
    Current Endpoints:
    - GET  /           - This welcome message
    - GET  /health     - Health check
    - POST /execute-current - Current LangGraphService implementation
    - POST /execute-new     - Your new WorkflowOrchestrator (TODO)
    
    📖 See README.md for full challenge details
    
    The goal is to refactor the hard-coded LangGraphService into a 
    pluggable workflow orchestrator with dynamic routing.
    `;
  }
}
