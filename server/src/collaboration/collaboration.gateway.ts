import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface ConnectedUser {
  userId: string;
  noteId: string;
  username: string;
  color: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/collaboration',
})
export class CollaborationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private connectedUsers = new Map<string, ConnectedUser>();

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const user = this.connectedUsers.get(client.id);
    if (user) {
      // Notify others in the same note room
      client.to(`note:${user.noteId}`).emit('user-left', {
        clientId: client.id,
        userId: user.userId,
      });
      this.connectedUsers.delete(client.id);
    }
    console.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Join a collaborative editing session for a note
   */
  @SubscribeMessage('join-note')
  handleJoinNote(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { noteId: string; userId: string; username: string; color: string },
  ) {
    const { noteId, userId, username, color } = data;

    // Leave previous room
    const prev = this.connectedUsers.get(client.id);
    if (prev) {
      client.leave(`note:${prev.noteId}`);
      client.to(`note:${prev.noteId}`).emit('user-left', { clientId: client.id, userId: prev.userId });
    }

    // Join new room
    client.join(`note:${noteId}`);
    this.connectedUsers.set(client.id, { userId, noteId, username, color });

    // Notify others
    client.to(`note:${noteId}`).emit('user-joined', {
      clientId: client.id,
      userId,
      username,
      color,
    });

    // Send list of current users in this note
    const currentUsers = Array.from(this.connectedUsers.entries())
      .filter(([_, u]) => u.noteId === noteId)
      .map(([cid, u]) => ({ clientId: cid, ...u }));

    return { users: currentUsers };
  }

  /**
   * Relay a Yjs update to other collaborators
   */
  @SubscribeMessage('yjs-update')
  handleYjsUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { noteId: string; update: number[] },
  ) {
    // Broadcast to all other clients in the same note room
    client.to(`note:${data.noteId}`).emit('yjs-update', {
      clientId: client.id,
      update: data.update,
    });
  }

  /**
   * Relay awareness (cursor positions) to other collaborators
   */
  @SubscribeMessage('awareness-update')
  handleAwarenessUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { noteId: string; awareness: unknown },
  ) {
    client.to(`note:${data.noteId}`).emit('awareness-update', {
      clientId: client.id,
      awareness: data.awareness,
    });
  }
}
