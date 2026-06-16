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
  
  // Actions
  connect: () => void;
  disconnect: () => void;
  sendUserMessage: (content: string) => void;
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
  lastSeq: 0,
  socket: null,
  traceEvents: [],
  highlightedEventId: null,
  activeCorrelationId: null,
  filter: 'ALL',
  search: '',
  contextHistories: {},
  activeContextId: null,

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
    const { socket } = get();
    if (!socket) return;

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
    socket.send(JSON.stringify(msg));
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
        const histories = { ...state.contextHistories };
        const { context_id, data, seq } = message;
        
        if (!histories[context_id]) {
          histories[context_id] = {
            context_id,
            snapshots: [],
            currentIndex: 0
          };
        }

        const snapshot: ContextSnapshot = {
          id: `snap-${seq}-${now}`,
          timestamp: now,
          data,
          seq
        };

        histories[context_id].snapshots.push(snapshot);
        histories[context_id].currentIndex = histories[context_id].snapshots.length - 1;

        return { 
          contextHistories: histories,
          activeContextId: context_id 
        };
      });
    }

    // Handle Protocol/Chat State
    switch (message.type) {
      case 'PING':
        const pong = { type: 'PONG', echo: (message as PingMessage).challenge };
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

      case 'TOKEN':
        const tokenMsg = message as TokenMessage;
        set((state) => {
          const newMessages = [...state.messages];
          let agentMsg = newMessages.find(
            (m) => m.role === 'agent' && m.stream_id === tokenMsg.stream_id
          ) as AgentMessage;

          if (!agentMsg) {
            agentMsg = { role: 'agent', stream_id: tokenMsg.stream_id, blocks: [] };
            newMessages.push(agentMsg);
          }

          const lastBlock = agentMsg.blocks[agentMsg.blocks.length - 1];
          if (lastBlock?.type === 'text') {
            lastBlock.content += tokenMsg.text;
          } else {
            agentMsg.blocks.push({ type: 'text', content: tokenMsg.text });
          }

          return { messages: newMessages };
        });
        break;

      case 'TOOL_CALL':
        const toolCall = message as ToolCallMessage;
        get().socket?.send(JSON.stringify({ type: 'TOOL_ACK', call_id: toolCall.call_id }));

        set((state) => {
          const newMessages = [...state.messages];
          let agentMsg = newMessages.find(
            (m) => m.role === 'agent' && m.stream_id === toolCall.stream_id
          ) as AgentMessage;

          if (!agentMsg) {
            agentMsg = { role: 'agent', stream_id: toolCall.stream_id, blocks: [] };
            newMessages.push(agentMsg);
          }

          agentMsg.blocks.push({
            type: 'tool',
            call_id: toolCall.call_id,
            tool_name: toolCall.tool_name,
            args: toolCall.args,
            status: 'acknowledged',
          });

          return { messages: newMessages };
        });
        break;

      case 'TOOL_RESULT':
        const toolResult = message as ToolResultMessage;
        set((state) => {
          const newMessages = [...state.messages];
          const agentMsg = newMessages.find(
            (m) => m.role === 'agent' && m.stream_id === toolResult.stream_id
          ) as AgentMessage;

          if (agentMsg) {
            const toolBlock = agentMsg.blocks.find(
              (b) => b.type === 'tool' && b.call_id === toolResult.call_id
            ) as ToolBlock;
            if (toolBlock) {
              toolBlock.result = toolResult.result;
              toolBlock.status = 'result_received';
            }
          }

          return { messages: newMessages };
        });
        break;
    }
  },
}));
