import type { Connection } from './types.js';
import { sendMessage } from './connection.js';

export class ConnectionManager {
  private connections: Map<string, Connection> = new Map();
  private userConnections: Map<string, Set<string>> = new Map();
  private channelSubscriptions: Map<string, Set<string>> = new Map();

  addConnection(connectionId: string, connection: Connection): void {
    this.connections.set(connectionId, connection);

    // Track user connections
    if (!this.userConnections.has(connection.userId)) {
      this.userConnections.set(connection.userId, new Set());
    }
    this.userConnections.get(connection.userId)!.add(connectionId);
  }

  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    // Remove from user connections
    const userConnections = this.userConnections.get(connection.userId);
    if (userConnections) {
      userConnections.delete(connectionId);
      if (userConnections.size === 0) {
        this.userConnections.delete(connection.userId);
      }
    }

    // Remove from channel subscriptions
    for (const channelId of connection.subscribedChannels) {
      const subscribers = this.channelSubscriptions.get(channelId);
      if (subscribers) {
        subscribers.delete(connectionId);
        if (subscribers.size === 0) {
          this.channelSubscriptions.delete(channelId);
        }
      }
    }

    this.connections.delete(connectionId);
  }

  getConnection(connectionId: string): Connection | undefined {
    return this.connections.get(connectionId);
  }

  getUserConnections(userId: string): Connection[] {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds) {
      return [];
    }

    return Array.from(connectionIds)
      .map((id) => this.connections.get(id))
      .filter((conn): conn is Connection => conn !== undefined);
  }

  subscribeToChannel(connectionId: string, channelId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    connection.subscribedChannels.add(channelId);

    if (!this.channelSubscriptions.has(channelId)) {
      this.channelSubscriptions.set(channelId, new Set());
    }
    this.channelSubscriptions.get(channelId)!.add(connectionId);
  }

  unsubscribeFromChannel(connectionId: string, channelId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    connection.subscribedChannels.delete(channelId);

    const subscribers = this.channelSubscriptions.get(channelId);
    if (subscribers) {
      subscribers.delete(connectionId);
      if (subscribers.size === 0) {
        this.channelSubscriptions.delete(channelId);
      }
    }
  }

  getChannelSubscribers(channelId: string): Connection[] {
    const connectionIds = this.channelSubscriptions.get(channelId);
    if (!connectionIds) {
      return [];
    }

    return Array.from(connectionIds)
      .map((id) => this.connections.get(id))
      .filter((conn): conn is Connection => conn !== undefined);
  }

  broadcastToChannel(channelId: string, type: string, payload: unknown, excludeWs?: Connection['ws']): void {
    const subscribers = this.getChannelSubscribers(channelId);

    for (const connection of subscribers) {
      if (connection.ws && connection.ws !== excludeWs) {
        sendMessage(connection.ws, type, payload);
      }
    }
  }

  broadcastToUser(userId: string, type: string, payload: unknown): void {
    const connections = this.getUserConnections(userId);

    for (const connection of connections) {
      if (connection.ws) {
        sendMessage(connection.ws, type, payload);
      }
    }
  }

  /** Broadcast to all connected clients (e.g. USER_PRESENCE_UPDATE). */
  broadcastToAll(type: string, payload: unknown): void {
    for (const connection of this.connections.values()) {
      if (connection.ws) {
        sendMessage(connection.ws, type, payload);
      }
    }
  }

  getConnectionCountForUser(userId: string): number {
    return this.userConnections.get(userId)?.size ?? 0;
  }

  /** All userId that have at least one active connection (for GET_ONLINE_USERS). */
  getOnlineUserIds(): string[] {
    return Array.from(this.userConnections.keys());
  }

  updateHeartbeat(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastHeartbeat = new Date();
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getUserCount(): number {
    return this.userConnections.size;
  }
}
