import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';

@WebSocketGateway({ cors: true })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  async handleConnection(socket: Socket) {
    const token = socket.handshake.auth.token;

    try {
      const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET) as any;
      const userId = payload._id;

      socket.join(`room-${userId}`);

    } catch (err: any) {
      console.error('Socket auth error:', err.message);
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {

  }

  emitToUser(userId: string, event: string, data: any) {


    this.server.to(`room-${userId}`).emit(event, data);
  }

  emit(event: string, data: any) {
    this.server.emit(event, data);
  }

  emitToRoom(room: string, event: string, data: any) {
    this.server.to(room).emit(event, data);
  }
}
