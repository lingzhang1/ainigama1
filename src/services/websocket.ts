import { io, Socket } from 'socket.io-client';
import { Message, Answer, Comment, Thread } from '../types';

// Check if we're connecting to AWS API Gateway WebSocket
const isAWSWebSocket = (url: string) => {
  return url.includes('execute-api') && url.includes('amazonaws.com');
};

class WebSocketService {
  public socket: Socket | null = null;
  private nativeWs: WebSocket | null = null;
  private isAWS: boolean = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private eventHandlers: Map<string, Function[]> = new Map();

  connect(userId: string) {
    // Get WebSocket URL from environment variable
    const wsUrl = import.meta.env.VITE_WEBSOCKET_URL;
    
    // Don't attempt to connect if no WebSocket URL is configured
    if (!wsUrl) {
      console.log('WebSocket URL not configured, skipping connection');
      return;
    }

    this.isAWS = isAWSWebSocket(wsUrl);

    if (this.isAWS) {
      this.connectToAWS(wsUrl, userId);
    } else {
      this.connectToSocketIO(wsUrl, userId);
    }
  }

  private connectToSocketIO(wsUrl: string, userId: string) {
    if (this.socket?.connected) return;

    this.socket = io(wsUrl, {
      auth: { userId },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('Connected to Socket.IO server');
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from Socket.IO server');
    });

    this.socket.on('reconnect_failed', () => {
      console.log('Failed to reconnect to Socket.IO server');
    });
  }

  private connectToAWS(wsUrl: string, userId: string) {
    if (this.nativeWs?.readyState === WebSocket.OPEN) return;

    // Add userId as query parameter for AWS WebSocket
    const url = `${wsUrl}?userId=${userId}`;
    
    this.nativeWs = new WebSocket(url);

    this.nativeWs.onopen = () => {
      console.log('Connected to AWS WebSocket');
      this.reconnectAttempts = 0;
    };

    this.nativeWs.onclose = () => {
      console.log('Disconnected from AWS WebSocket');
      // Attempt reconnection
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        setTimeout(() => this.connectToAWS(wsUrl, userId), 1000 * this.reconnectAttempts);
      }
    };

    this.nativeWs.onerror = (error) => {
      console.error('AWS WebSocket error:', error);
    };

    this.nativeWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleAWSMessage(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
  }

  private handleAWSMessage(data: any) {
    // Handle different message types from AWS
    const handlers = this.eventHandlers.get(data.type) || [];
    handlers.forEach(handler => handler(data));
  }

  private emit(event: string, data: any) {
    if (this.isAWS && this.nativeWs?.readyState === WebSocket.OPEN) {
      this.nativeWs.send(JSON.stringify({ action: event, ...data }));
    } else if (this.socket?.connected) {
      this.socket.emit(event, data);
    }
  }

  private on(event: string, callback: Function) {
    if (this.isAWS) {
      if (!this.eventHandlers.has(event)) {
        this.eventHandlers.set(event, []);
      }
      this.eventHandlers.get(event)!.push(callback);
    } else if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (this.nativeWs) {
      this.nativeWs.close();
      this.nativeWs = null;
    }
    this.eventHandlers.clear();
  }
}

export const wsService = new WebSocketService();