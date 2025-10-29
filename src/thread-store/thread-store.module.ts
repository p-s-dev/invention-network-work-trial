import { Module } from '@nestjs/common';
import { ThreadStoreService } from './thread-store.service';
import { InMemoryThreadStoreRepository } from './inmemory-thread-store.repository';
import { THREAD_STORE_REPOSITORY } from './thread-store.types';

@Module({
  providers: [
    ThreadStoreService,
    { provide: THREAD_STORE_REPOSITORY, useClass: InMemoryThreadStoreRepository },
  ],
  exports: [ThreadStoreService],
})
export class ThreadStoreModule {}

