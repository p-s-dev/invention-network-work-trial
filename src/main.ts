import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for development
  app.enableCors();

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Workflow Orchestrator Challenge running on: http://localhost:${port}`);
  console.log('📖 See README.md for challenge details');
}

bootstrap();
