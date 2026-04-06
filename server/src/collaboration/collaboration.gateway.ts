import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { Note } from '../entities/note.entity';

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
  constructor(
    private readonly authService: AuthService,
    @InjectRepository(Note)
    private readonly noteRepository: Repository<Note>,
  ) {}

  @WebSocketServer()
  server!: Server;

  private connectedUsers = new Map<string, ConnectedUser>();

  private getToken(client: Socket, explicitToken?: string): string | null {
    const authToken = explicitToken?.trim();
    if (authToken) {
      return authToken.startsWith('Bearer ') ? authToken.slice(7) : authToken;
    }

    const handshakeToken = client.handshake.auth?.token;
    if (typeof handshakeToken === 'string' && handshakeToken.trim()) {
      return handshakeToken.startsWith('Bearer ') ? handshakeToken.slice(7) : handshakeToken;
    }

    const headerValue = client.handshake.headers.authorization;
    if (typeof headerValue === 'string' && headerValue.startsWith('Bearer ')) {
      return headerValue.slice(7);
    }

    return null;
  }

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
    @MessageBody() data: { noteId: string; username?: string; color?: string; token?: string },
  ) {
    return this.joinNote(client, data);
  }

  private async joinNote(
    client: Socket,
    data: { noteId: string; username?: string; color?: string; token?: string },
  ) {
    const token = this.getToken(client, data.token);
    if (!token) {
      throw new WsException('Missing authorization');
    }

    const { userId } = await this.authService.validateToken(token);
    const note = await this.noteRepository.findOne({ where: { id: data.noteId, userId } });

    if (!note) {
      throw new WsException('Forbidden note access');
    }

    const noteId = data.noteId;
    const username = data.username?.trim() || 'Anonymous';
    const color = data.color?.trim() || '#6366f1';

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
    const currentUser = this.connectedUsers.get(client.id);
    if (!currentUser || currentUser.noteId !== data.noteId) {
      throw new WsException('Forbidden note access');
    }

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
    const currentUser = this.connectedUsers.get(client.id);
    if (!currentUser || currentUser.noteId !== data.noteId) {
      throw new WsException('Forbidden note access');
    }

    client.to(`note:${data.noteId}`).emit('awareness-update', {
      clientId: client.id,
      awareness: data.awareness,
    });
  }
}
