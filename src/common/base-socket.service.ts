import { EventsGateway } from "../gateway/events.gateway";

export class BaseSocketService {
  constructor(protected readonly socketGateway: EventsGateway) { }

  protected emit(event: string, data: any) {
    this.socketGateway.emit(event, data);
  }

  protected emitToRoom(room: string, event: string, data: any) {
    this.socketGateway.emitToRoom(room, event, data);
  }

  protected emitToUser(userId: string, event: string, data: any) {
    this.socketGateway.emitToUser(userId, event, data);
  }
}
