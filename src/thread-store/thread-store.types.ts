export interface ThreadRecord {
  id: string; // surrogate ID (e.g., `${userId}:${threadId}` for in-memory)
  userId: string;
  rootThreadId: string;
  threadId: string;
  graphType: string;
  createdAt: Date;
  lastUpdatedAt: Date;
}

export interface CreateThreadDto {
  userId: string;
  rootThreadId: string;
  threadId: string;
  graphType: string;
  createdAt?: Date;
  lastUpdatedAt?: Date;
}

export interface UpdateLastUpdatedDto {
  userId: string;
  threadId: string;
  lastUpdatedAt?: Date;
}

export interface ThreadStoreRepository {
  createThread(data: CreateThreadDto): Promise<ThreadRecord>;
  findThreadsByUser(userId: string): Promise<ThreadRecord[]>;
  findLastUpdatedThread(): Promise<ThreadRecord | null>;
  findByUserAndThread(userId: string, threadId: string): Promise<ThreadRecord | null>;
  updateLastUpdatedAt(data: UpdateLastUpdatedDto): Promise<ThreadRecord>;
}

export const THREAD_STORE_REPOSITORY = 'THREAD_STORE_REPOSITORY';
