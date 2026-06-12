export type MessageType =
  | 'USER_MESSAGE'
  | 'TOKEN'
  | 'TOOL_CALL'
  | 'TOOL_RESULT'
  | 'CONTEXT_SNAPSHOT'
  | 'PING'
  | 'PONG'
  | 'RESUME'
  | 'TOOL_ACK'
  | 'STREAM_END'
  | 'ERROR';

export interface BaseMessage {
  type: MessageType;
  seq: number;
}

// Client -> Server
export interface UserMessage {
  type: 'USER_MESSAGE';
  content: string;
}

export interface PongMessage {
  type: 'PONG';
  echo: string;
}

export interface ResumeMessage {
  type: 'RESUME';
  last_seq: number;
}

export interface ToolAckMessage {
  type: 'TOOL_ACK';
  call_id: string;
}

// Server -> Client
export interface TokenMessage extends BaseMessage {
  type: 'TOKEN';
  text: string;
  stream_id: string;
}

export interface ToolCallMessage extends BaseMessage {
  type: 'TOOL_CALL';
  call_id: string;
  tool_name: string;
  args: Record<string, any>;
  stream_id: string;
}

export interface ToolResultMessage extends BaseMessage {
  type: 'TOOL_RESULT';
  call_id: string;
  result: Record<string, any>;
  stream_id: string;
}

export interface ContextSnapshotMessage extends BaseMessage {
  type: 'CONTEXT_SNAPSHOT';
  context_id: string;
  data: Record<string, any>;
}

export interface PingMessage extends BaseMessage {
  type: 'PING';
  challenge: string;
}

export interface StreamEndMessage extends BaseMessage {
  type: 'STREAM_END';
  stream_id: string;
}

export interface ErrorMessage extends BaseMessage {
  type: 'ERROR';
  code: string;
  message: string;
}

export type ServerMessage =
  | TokenMessage
  | ToolCallMessage
  | ToolResultMessage
  | ContextSnapshotMessage
  | PingMessage
  | StreamEndMessage
  | ErrorMessage;

export type ClientMessage =
  | UserMessage
  | PongMessage
  | ResumeMessage
  | ToolAckMessage;
