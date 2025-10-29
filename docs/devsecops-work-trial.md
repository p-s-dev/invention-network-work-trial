# DevSecOps Work Trial - Infrastructure Context

This document provides comprehensive context about our services, costs, and infrastructure for the DevSecOps work trial candidate. Use this information to answer the trial questions about cost optimization, scaling, quality assurance, and ownership.

## Current Infrastructure Overview

### Core Services & Monthly Costs

#### LLM & AI Services
- **Anthropic Claude API**:
  - Primary model: Claude 3.5 Haiku
  - Invention disclosure analysis workflows
  - Usage growing as we prepare for launch
- **LangSmith**: $20/month (Development plan) 
  - LLM workflow tracing and debugging
  - Critical for non-deterministic output analysis
  - Planning to move away from langgraph so this might need to go

#### Infrastructure & Hosting
- **Railway Pro**: $20/month (single instance)
  - Frontend (Next.js) deployment
  - Backend (NestJS) deployment
  - Deployed in US-West (California) region
  - Built-in CI/CD and environment management
- **Supabase Pro**: $25/month 
  - Large instance: 8 gb memory, 2-core ARM CPU 
  - PostgreSQL database
  - File storage
  - Deployed in us-west-1 region
- **Cloudflare Pro**: $20/month
  - DNS management
  - Web Application Firewall (WAF)
  - CDN and DDoS protection

#### Development & Security Tools
- **GitHub Team**
- **Linear Business**
- **1Password Business**
  - development env secrets
- **Aikido Basic**: $350/month
  - Security scanning and vulnerability alerts
  - Integrated with GitHub Actions -> scan code changes
  - Integrated with Linear -> create tickets
  - Integrated with Slack -> alert messages
- **Sentry**: $27/month (Team plan)
  - Error tracking and alerting
  - Integrated with code base -> source maps
  - Integrated with Linear -> create tickets
  - Integrated with Slack -> alert messages

#### Third-Party APIs
- **Snag Solutions**: Variable cost (10,000 calls then pay-per-API-call)
  - Reward tracking API integration
  - Critical dependency for core functionality
  - Pricing based on API usage volume
- **Privy**: Scale plan ($499/mo - 10,000 MAUs)
  - Authentication via:
    - google
    - crypto wallet
  - Automatic crypto wallet generation

## User Base & Usage Patterns

### Current Scale
- **Active Users**: 0 (pre-launch phase)
- **Target Markets**:
  - **Primary**: Southeast Asia
  - **Secondary**: US East Coast (Miami, New York)
  - **Tertiary**: US West Coast
  - **Future**: European markets
- **Expected Growth**: Rapid scaling anticipated post-launch (Over 10,000 users first month)
- **No User Tiers**: Single product offering initially

## Technical Architecture

### Application Stack
- **Frontend**: Next.js 15 on Railway
- **API**: NestJS 10 on Railway (soon moving to 11)
- **Workflows**: LangGraph with LangSmith tracing
- **Database**: Supabase PostgreSQL
- **Storage**: Supabase file storage
- **No Cache**: Direct database queries
- **No Queue**: Synchronous processing only

### Deployment Pipeline
- **CI/CD**: GitHub Actions
  - Claude Code review integration
  - Aikido security scanning & Automated vulnerability checks
- **Environments**: Single production environment on Railway
- **Deployment**: Railway automatic deployments from main branch

### Security Posture
- **Authentication**: Privy (Web3/traditional auth)
- **Secrets**: Railway environment variables (manual quarterly rotation)
- **Opsec**: Require 2fa where possible, google oath sign in, minimal permissions, 1password for dev secrets
- **Network**: Default Railway private VPC with cloudflare access
- **Compliance**: None currently

## Pain Points & Technical Debt

### Performance Issues
- **Snag Solutions API Dependency**: Critical third-party integration
  - Multiple API calls required per workflow
  - Highly Variable latency
  - Cloudflare front with unknown server locations

### Scalability Concerns
- **Single Region Deployment**: All infrastructure in US-West
  - High latency for Southeast Asia users (primary market)
  - No regional redundancy
- **No Async Processing**: All operations synchronous

### Security Gaps
- **No Incident Response Plan**: Informal security procedures
- **Limited Crypto Security**: Web3 authentication without proper key management
- **No Secret Rotation**: Static environment variables
- **Basic Security Scanning**: Only Aikido alerts, no continuous monitoring
- **No Access Reviews**: Manual user management

### Operational Challenges
- **No Application Monitoring**: Only basic Railway dashboard
- **No Cost Tracking**: Limited visibility into variable API costs
- **Manual Processes**: No automation for operational tasks
- **Single Environment**: No staging/testing infrastructure
- **No Database Branches**: No Staging/testing/development database
  - Supabase sucks for this.

## Quality Assurance Current State

### Testing Strategy
- **No QA Testing**: Neither automated nor manual testing
- **No Test Coverage**: No unit, integration, or E2E tests
- **No LLM Testing**: No validation of AI output quality or accuracy
- **No Regression Testing**: No way to detect prompt drift or model changes

### Monitoring
- **Sentry Error Tracking**: Basic error alerting only
- **Railway Basic Dashboard**: Uptime and basic resource metrics
- **Aikido Security Alerts**: Vulnerability notifications
- **No Business Metrics**: No way to measure LLM response accuracy

### Critical Quality Gaps
- **No LLM Response Accuracy Measurement**: Cannot validate AI output quality
- **No Prompt Testing**: Changes to prompts deployed without validation
- **No Performance Monitoring**: No visibility into response times or user experience
- **No Reliability Metrics**: No SLA tracking or availability monitoring

## Team Structure & Responsibilities

### Current Team (3 engineers)
- **Founder/CTO**: Product vision, architecture decisions
- **Senior Full-Stack Engineer #1**: Frontend/API development, deployment
- **Senior Full-Stack Engineer #2**: API features, integrations, database

### Current DevSecOps Gap
- **No dedicated ops person**: Everyone wears multiple hats
- **Reactive approach**: Fix issues as they arise  
- **No operational expertise**: Limited security/ops knowledge across team
- **Manual processes**: Everything done ad-hoc, no automation
- **No monitoring culture**: Issues discovered by users, not proactive monitoring

## Additional Context for Analysis

### Critical Dependencies
- **Snag Solutions API**: Single point of failure, variable costs, multiple calls per workflow
- **Railway**: Simple but limited scaling options
- **Supabase**: Managed but single-region database
- **Anthropic Claude**: Core LLM dependency, rate limits unknown

### Geographic Challenges  
- **Primary users in Southeast Asia** but infrastructure in US-West
- **Secondary markets**: US East/West coasts, future European expansion
- **Latency concerns**: No CDN beyond Cloudflare for static assets

### Pre-Launch Status
- **Zero active users** currently but rapid growth expected
- **No baseline metrics** for performance, quality, or reliability
- **No established processes** for incidents, deployments, or monitoring