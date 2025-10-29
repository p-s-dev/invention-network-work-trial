import { Injectable } from '@nestjs/common';

/**
 * Mock Logger Service - simplified from your actual logger
 */
@Injectable()
export class LoggerService {
  info(message: string, context?: any) {
    console.log(`[INFO] ${message}`, context ? JSON.stringify(context) : '');
  }

  error(message: string, error?: any) {
    console.error(`[ERROR] ${message}`, error);
  }

  warn(message: string, context?: any) {
    console.warn(`[WARN] ${message}`, context ? JSON.stringify(context) : '');
  }

  debug(message: string, context?: any) {
    console.debug(`[DEBUG] ${message}`, context ? JSON.stringify(context) : '');
  }
}
