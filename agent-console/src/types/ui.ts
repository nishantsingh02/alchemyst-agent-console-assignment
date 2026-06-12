export type ToolStatus = 'pending' | 'acknowledged' | 'result_received';

export interface ToolBlock {
  type: 'tool';
  call_id: string;
  tool_name: string;
  args: Record<string, any>;
  result?: Record<string, any>;
  status: ToolStatus;
}

export interface TextBlock {
  type: 'text';
  content: string;
}

export type MessageBlock = TextBlock | ToolBlock;

export interface AgentMessage {
  role: 'agent';
  stream_id: string;
  blocks: MessageBlock[];
}

export interface UserMessageUI {
  role: 'user';
  content: string;
}

export type UIMessage = UserMessageUI | AgentMessage;
