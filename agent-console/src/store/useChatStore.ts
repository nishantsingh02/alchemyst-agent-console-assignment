import { create } from 'zustand';
import { 
  ServerMessage, 
  ClientMessage, 
  TokenMessage, 
  ToolCallMessage, 
  ToolResultMessage, 
  PingMessage 
} from '@/types/protocol';
import { UIMessage, AgentMessage, MessageBlock, ToolBlock } from '@/types/ui';

import { TraceEvent, TraceEventType } from '@/types/trace';
import { ContextHistory, ContextSnapshot } from '@/types/context';

interface ChatState {
  messages: UIMessage[];
  isConnected: boolean;
  isAgentStreaming: boolean;
  lastSeq: number;
  socket: WebSocket | null;
  
  // Trace Task
  traceEvents: TraceEvent[];
  highlightedEventId: string | null;
  activeCorrelationId: string | null;
  filter: string;
  search: string;

  // Context Task
  contextHistories: Record<string, ContextHistory>;
  activeContextId: string | null;

  // Reconnection & Sequencing
  reconnectAttempt: number;
  reconnectTimeoutId: ReturnType<typeof setTimeout> | null;
  messageBuffer: Map<number, ServerMessage>;
  offlineQueue: ClientMessage[];
  
  // Actions
  connect: () => void;
  disconnect: () => void;
  sendUserMessage: (content: string) => void;
  handleRawMessage: (message: ServerMessage) => void;
  processMessage: (message: ServerMessage) => void;
  setHighlightedEvent: (id: string | null) => void;
  setHighlightedCorrelation: (id: string | null) => void;
  setFilter: (filter: string) => void;
  setSearch: (search: string) => void;
  
  // Context Actions
  setActiveContext: (id: string | null) => void;
  setContextIndex: (contextId: string, index: number) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isConnected: false,
  isAgentStreaming: false,
  lastSeq: 0,
  socket: null,
  traceEvents: [],
  highlightedEventId: null,
  activeCorrelationId: null,
  filter: 'ALL',
  search: '',
  contextHistories: {},
  activeContextId: null,
  reconnectAttempt: 0,
  reconnectTimeoutId: null,
  messageBuffer: new Map(),
  offlineQueue: [],

  // Actions
  connect: () => {
    if (get().socket) return;

    const ws = new WebSocket('ws://localhost:4747/ws');

    ws.onopen = () => {
      set({ isConnected: true, socket: ws });
      console.log('Connected to agent-server');
    };

    ws.onmessage = (event) => {
      try {
        const data: ServerMessage = JSON.parse(event.data);
        get().processMessage(data);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onclose = () => {
      if (get().socket === ws) {
        set({ isConnected: false, socket: null });
        console.log('Disconnected from agent-server');
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket Error:', error);
    };
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.close();
      set({ socket: null, isConnected: false });
    }
  },

  handleRawMessage: (message: ServerMessage) => {
    const state = get();
    
    // Safety check for corrupt messages missing sequence numbers
    if (message.seq === undefined || message.seq === null) {
      get().processMessage(message);
      return;
    }

    // Deduplicate
    if (message.seq <= state.lastSeq) {
      return; 
    }

    // Buffer out-of-order messages
    if (message.seq > state.lastSeq + 1) {
      const newBuffer = new Map(state.messageBuffer);
      newBuffer.set(message.seq, message);
      set({ messageBuffer: newBuffer });
      return;
    }

    // Process immediately
    get().processMessage(message);

    // Replay any buffered messages that are now next in sequence
    let nextSeq = message.seq + 1;
    let currentBuffer = get().messageBuffer;
    
    while (currentBuffer.has(nextSeq)) {
      const nextMsg = currentBuffer.get(nextSeq)!;
      currentBuffer.delete(nextSeq);
      set({ messageBuffer: new Map(currentBuffer) });
      get().processMessage(nextMsg);
      nextSeq++;
      currentBuffer = get().messageBuffer;
    }
  },

  setHighlightedEvent: (id) => {
    const event = get().traceEvents.find(e => e.id === id);
    set({ highlightedEventId: id, activeCorrelationId: event?.correlationId || null });
  },
  
  setHighlightedCorrelation: (id) => {
    const event = get().traceEvents.find(e => e.correlationId === id);
    set({ activeCorrelationId: id, highlightedEventId: event?.id || null });
  },

  setFilter: (filter) => set({ filter }),
  setSearch: (search) => set({ search }),

  setActiveContext: (id) => set({ activeContextId: id }),
  setContextIndex: (contextId, index) => set((state) => {
    const history = state.contextHistories[contextId];
    if (!history) return state;
    return {
      contextHistories: {
        ...state.contextHistories,
        [contextId]: { ...history, currentIndex: index }
      }
    };
  }),

  sendUserMessage: (content: string) => {
    const { socket, isConnected } = get();

    set((state) => ({
      messages: [...state.messages, { role: 'user', content }],
      traceEvents: [
        ...state.traceEvents,
        {
          id: `user-${Date.now()}`,
          type: 'USER_SENT',
          timestamp: Date.now(),
          data: { content }
        }
      ]
    }));

    const msg: ClientMessage = { type: 'USER_MESSAGE', content };
    
    if (socket && isConnected && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    } else {
      set((state) => ({ offlineQueue: [...state.offlineQueue, msg] }));
    }
  },

  processMessage: (message: ServerMessage) => {
    const now = Date.now();
    set({ lastSeq: message.seq });

    // Handle Tracing (with Grouping)
    set((state) => {
      const newTraceEvents = [...state.traceEvents];
      const lastEvent = newTraceEvents[newTraceEvents.length - 1];

      let correlationId: string | undefined;
      if ('stream_id' in message) correlationId = message.stream_id;
      if ('call_id' in message) correlationId = message.call_id;

      if (message.type === 'TOKEN' && lastEvent?.type === 'TOKEN' && lastEvent.data.stream_id === message.stream_id) {
        // Group Tokens
        lastEvent.tokenCount = (lastEvent.tokenCount || 1) + 1;
        lastEvent.data.text += message.text;
        lastEvent.duration = now - (lastEvent.startTime || lastEvent.timestamp);
      } else {
        newTraceEvents.push({
          id: `seq-${message.seq}-${now}`,
          type: message.type as TraceEventType,
          timestamp: now,
          seq: message.seq,
          data: { ...message },
          correlationId,
          ...(message.type === 'TOKEN' ? { tokenCount: 1, startTime: now, duration: 0 } : {})
        });
      }
      return { traceEvents: newTraceEvents };
    });

    // Handle Context Snapshots
    if (message.type === 'CONTEXT_SNAPSHOT') {
      set((state) => {
        const { context_id, data, seq } = message;
        
        const existingHistory = state.contextHistories[context_id] || {
          context_id,
          snapshots: [],
          currentIndex: 0
        };

        const snapshot: ContextSnapshot = {
          id: `snap-${seq}-${now}`,
          timestamp: now,
          data,
          seq
        };

        const newSnapshots = [...existingHistory.snapshots, snapshot];

        return { 
          contextHistories: {
            ...state.contextHistories,
            [context_id]: {
              ...existingHistory,
              snapshots: newSnapshots,
              currentIndex: newSnapshots.length - 1
            }
          },
          activeContextId: context_id 
        };
      });
    }

    // Handle Protocol/Chat State
    switch (message.type) {
      case 'PING':
        const pingMsg = message as any;
        const challenge = pingMsg.challenge || '';
        const pong = { type: 'PONG', echo: challenge };
        get().socket?.send(JSON.stringify(pong));
        // Also trace the PONG
        set(state => ({
          traceEvents: [...state.traceEvents, {
            id: `pong-${now}`,
            type: 'PONG',
            timestamp: now,
            data: pong
          }]
        }));
        break;

      case 'TOKEN': {
        const tokenMsg = message as TokenMessage;
        set((state) => {
          const newMessages = [...state.messages];
          const agentMsgIndex = newMessages.findIndex(
            (m) => m.role === 'agent' && m.stream_id === tokenMsg.stream_id
          );

          if (agentMsgIndex === -1) {
            newMessages.push({
              role: 'agent',
              stream_id: tokenMsg.stream_id,
              blocks: [{ type: 'text', content: tokenMsg.text }]
            });
          } else {
            const agentMsg = { ...newMessages[agentMsgIndex] } as AgentMessage;
            const newBlocks = [...agentMsg.blocks];
            const lastBlockIndex = newBlocks.length - 1;
            
            if (lastBlockIndex >= 0 && newBlocks[lastBlockIndex].type === 'text') {
              newBlocks[lastBlockIndex] = {
                ...newBlocks[lastBlockIndex],
                content: (newBlocks[lastBlockIndex] as any).content + tokenMsg.text
              };
            } else {
              newBlocks.push({ type: 'text', content: tokenMsg.text });
            }
            
            agentMsg.blocks = newBlocks;
            newMessages[agentMsgIndex] = agentMsg;
          }

          return { messages: newMessages, isAgentStreaming: true };
        });
        break;
      }

      case 'TOOL_CALL': {
        const toolCall = message as ToolCallMessage;
        get().socket?.send(JSON.stringify({ type: 'TOOL_ACK', call_id: toolCall.call_id }));

        set((state) => {
          const newMessages = [...state.messages];
          const agentMsgIndex = newMessages.findIndex(
            (m) => m.role === 'agent' && m.stream_id === toolCall.stream_id
          );

          const newToolBlock: ToolBlock = {
            type: 'tool',
            call_id: toolCall.call_id,
            tool_name: toolCall.tool_name,
            args: toolCall.args,
            status: 'acknowledged',
          };

          if (agentMsgIndex === -1) {
            newMessages.push({
              role: 'agent',
              stream_id: toolCall.stream_id,
              blocks: [newToolBlock]
            });
          } else {
            const agentMsg = { ...newMessages[agentMsgIndex] } as AgentMessage;
            agentMsg.blocks = [...agentMsg.blocks, newToolBlock];
            newMessages[agentMsgIndex] = agentMsg;
          }

          return { messages: newMessages, isAgentStreaming: true };
        });
        break;
      }

      case 'TOOL_RESULT': {
        const toolResult = message as ToolResultMessage;
        set((state) => {
          const newMessages = [...state.messages];
          const agentMsgIndex = newMessages.findIndex(
            (m) => m.role === 'agent' && m.stream_id === toolResult.stream_id
          );

          if (agentMsgIndex !== -1) {
            const agentMsg = { ...newMessages[agentMsgIndex] } as AgentMessage;
            const newBlocks = agentMsg.blocks.map(block => {
              if (block.type === 'tool' && block.call_id === toolResult.call_id) {
                return { ...block, result: toolResult.result, status: 'result_received' as const };
              }
              return block;
            });
            
            agentMsg.blocks = newBlocks;
            newMessages[agentMsgIndex] = agentMsg;
          }

          return { messages: newMessages };
        });
        break;
      }

      case 'STREAM_END':
        set({ isAgentStreaming: false });
        break;
    }
  },
}));
