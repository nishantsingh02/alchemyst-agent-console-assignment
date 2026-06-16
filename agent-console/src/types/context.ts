export interface ContextSnapshot {
  id: string;
  timestamp: number;
  data: Record<string, any>;
  seq: number;
}

export interface ContextHistory {
  context_id: string;
  snapshots: ContextSnapshot[];
  currentIndex: number; // For the history scrubber
}

export interface ContextInspectorState {
  histories: Record<string, ContextHistory>;
  activeContextId: string | null;
}
