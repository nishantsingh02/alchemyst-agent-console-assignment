import { ServerMessage } from './protocol';

export type TraceEventType = ServerMessage['type'] | 'PONG' | 'USER_SENT';

export interface TraceEvent {
  id: string; // unique id for highlighting/linking
  type: TraceEventType;
  timestamp: number;
  seq?: number;
  data: any;
  correlationId?: string; // Linked call_id or stream_id
  // For grouped tokens
  tokenCount?: number;
  duration?: number;
  startTime?: number;
}

export interface TraceState {
  events: TraceEvent[];
  filter: string;
  search: string;
  highlightedEventId: string | null;
}
