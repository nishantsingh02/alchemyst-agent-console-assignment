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

interface ChatState {
  messages: UIMessage[];
  isConnected: boolean;
  lastSeq: number;
  socket: WebSocket | null;
  
  // Actions
  connect: () => void;
  disconnect: () => void;
  sendUserMessage: (content: string) => void;
  processMessage: (message: ServerMessage) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isConnected: false,
  lastSeq: 0,
  socket: null,

  connect: () => {
    if (get().socket) return;

    // connection with websocket server
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
      // Only clear state if this is the active socket
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

  sendUserMessage: (content: string) => {
    const { socket } = get();
    if (!socket) return;

    // Add to UI
    set((state) => ({
      messages: [...state.messages, { role: 'user', content }]
    }));

    // Send to server
    const msg: ClientMessage = { type: 'USER_MESSAGE', content };
    socket.send(JSON.stringify(msg));
  },

  processMessage: (message: ServerMessage) => {
    set({ lastSeq: message.seq });

    switch (message.type) {
      case 'PING':
        get().socket?.send(JSON.stringify({ type: 'PONG', echo: (message as PingMessage).challenge }));
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
        // Acknowledge immediately (Task 1 requirement: within 2 seconds)
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
            status: 'acknowledged', // We just sent the ACK
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
        
      // Handle other message types (CONTEXT_SNAPSHOT, STREAM_END, etc.) in later tasks
    }
  },
}));
