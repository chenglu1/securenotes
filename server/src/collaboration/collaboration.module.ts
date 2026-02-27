import { Module } from '@nestjs/common';
import { CollaborationGateway } from './collaboration.gateway';

@Module({
  providers: [CollaborationGateway],
  exports: [CollaborationGateway],
})
export class CollaborationModule {}
