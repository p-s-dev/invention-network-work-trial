import { Inject, Injectable } from '@nestjs/common';
import {
  CreateThreadDto,
  ThreadRecord,
  ThreadStoreRepository,
  THREAD_STORE_REPOSITORY,
} from './thread-store.types';

@Injectable()
export class ThreadStoreService {
  constructor(
    @Inject(THREAD_STORE_REPOSITORY)
    private readonly repo: ThreadStoreRepository,
  ) {}

  async readThreadsByUser(userId: string): Promise<ThreadRecord[]> {
    return this.repo.findThreadsByUser(userId);
  }

  async updateLastUpdatedAtFor(userId: string, threadId: string, at?: Date) {
    return this.repo.updateLastUpdatedAt({ userId, threadId, lastUpdatedAt: at ?? new Date() });
  }

  // Aliases using repository-style names
  async findLastUpdatedThread(): Promise<ThreadRecord | null> {
    return this.repo.findLastUpdatedThread();
  }

  async createThread(input: CreateThreadDto): Promise<ThreadRecord> {
    const now = new Date();
    const createdAt = input.createdAt ?? now;
    const lastUpdatedAt = input.lastUpdatedAt ?? createdAt;
    return this.repo.createThread({ ...input, createdAt, lastUpdatedAt });
  }
}
