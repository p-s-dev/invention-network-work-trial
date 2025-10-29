import { Injectable } from '@nestjs/common';
import {
  CreateThreadDto,
  ThreadRecord,
  ThreadStoreRepository,
  UpdateLastUpdatedDto,
} from './thread-store.types';

function makeKey(userId: string, threadId: string): string {
  return `${userId}::${threadId}`;
}

@Injectable()
export class InMemoryThreadStoreRepository implements ThreadStoreRepository {
  private store = new Map<string, ThreadRecord>();

  async createThread(data: CreateThreadDto): Promise<ThreadRecord> {
    const key = makeKey(data.userId, data.threadId);
    if (this.store.has(key)) {
      // Conflict: thread already exists for this user
      return this.store.get(key)!;
    }
    const createdAt = data.createdAt ?? new Date();
    const lastUpdatedAt = data.lastUpdatedAt ?? createdAt;
    const record: ThreadRecord = {
      id: key,
      userId: data.userId,
      rootThreadId: data.rootThreadId,
      threadId: data.threadId,
      graphType: data.graphType,
      createdAt,
      lastUpdatedAt,
    };
    this.store.set(key, record);
    return record;
  }

  async findThreadsByUser(userId: string): Promise<ThreadRecord[]> {
    return Array.from(this.store.values()).filter((r) => r.userId === userId);
  }

  async findAllThreads(): Promise<ThreadRecord[]> {
    return Array.from(this.store.values());
  }

  async findLastUpdatedThread(): Promise<ThreadRecord | null> {
    let mostRecent: ThreadRecord | null = null;
    for (const rec of this.store.values()) {
      if (!mostRecent || rec.lastUpdatedAt.getTime() > mostRecent.lastUpdatedAt.getTime()) {
        mostRecent = rec;
      }
    }
    return mostRecent;
  }

  async findByUserAndThread(userId: string, threadId: string): Promise<ThreadRecord | null> {
    const key = makeKey(userId, threadId);
    return this.store.get(key) ?? null;
  }

  async updateLastUpdatedAt(data: UpdateLastUpdatedDto): Promise<ThreadRecord> {
    const key = makeKey(data.userId, data.threadId);
    const current = this.store.get(key);
    if (!current) {
      // If not exists, create it with current timestamps
      const now = data.lastUpdatedAt ?? new Date();
      const record: ThreadRecord = {
        id: key,
        userId: current.userId,
        rootThreadId: current.rootThreadId,
        threadId: current.threadId,
        graphType: current.graphType,
        createdAt: current.createdAt,
        lastUpdatedAt: now,
      };
      this.store.set(key, record);
      return record;
    }
    const updated: ThreadRecord = {
      ...current,
      lastUpdatedAt: data.lastUpdatedAt ?? new Date(),
    };
    this.store.set(key, updated);
    return updated;
  }
}
