'use client';

import { useChatStore } from '@/store/useChatStore';
import { useEffect, useMemo, memo, useRef, useState } from 'react';

export default function TraceTimeline() {
  const { 
    traceEvents, 
    filter, 
    search, 
    setFilter, 
    setSearch, 
    highlightedEventId, 
    activeCorrelationId,
    setHighlightedEvent 
  } = useChatStore();
  const [isOpen, setIsOpen] = useState(true);

  const filteredEvents = useMemo(() => {
    return traceEvents.filter(event => {
      const matchesFilter = filter === 'ALL' || event.type === filter;
      const matchesSearch = !search || JSON.stringify(event.data).toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [traceEvents, filter, search]);

  // Auto-scroll logic
  useEffect(() => {
    if (highlightedEventId) {
      const element = document.getElementById(highlightedEventId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightedEventId]);

  return (
    <div className={`flex flex-col border-l border-zinc-800 transition-all duration-300 ${isOpen ? 'w-96' : 'w-12'}`}>
      {/* ... (header button same) */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="h-12 flex items-center justify-center hover:bg-zinc-900 border-b border-zinc-800 transition-colors"
      >
        <span className={`text-xs font-bold uppercase tracking-widest text-zinc-500 transition-all ${isOpen ? 'rotate-0' : 'rotate-90'}`}>
          {isOpen ? 'Close Trace' : 'Trace'}
        </span>
      </button>

      {isOpen && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* ... (filter bar same) */}
          <div className="p-4 space-y-3 border-b border-zinc-800">
            <div className="flex gap-2">
              <select 
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 text-[10px] font-bold uppercase rounded px-2 py-1 flex-1 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              >
                <option value="ALL">All Events</option>
                <option value="TOKEN">Tokens</option>
                <option value="TOOL_CALL">Tools</option>
                <option value="CONTEXT_SNAPSHOT">Context</option>
                <option value="PING">Heartbeats</option>
              </select>
            </div>
            <input 
              type="text"
              placeholder="Search data..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-[10px] rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 placeholder:text-zinc-600"
            />
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 p-2 space-y-1">
            {filteredEvents.map((event) => (
              <TraceRow 
                key={event.id} 
                event={event} 
                isHighlighted={highlightedEventId === event.id || (!!activeCorrelationId && event.correlationId === activeCorrelationId)}
                onSelect={() => setHighlightedEvent(event.id)}
              />
            ))}
            {/* ... */}
            {filteredEvents.length === 0 && (
              <div className="text-center py-10">
                <p className="text-[10px] text-zinc-600 uppercase font-bold tracking-widest">No events found</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const TraceRow = memo(({ event, isHighlighted, onSelect }: { 
  event: TraceEvent; 
  isHighlighted: boolean;
  onSelect: () => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div 
      id={event.id}
      className={`group border rounded-lg transition-all ${
        isHighlighted ? 'bg-emerald-500/5 border-emerald-500/50 ring-1 ring-emerald-500/20' : 'border-transparent hover:bg-zinc-900/50'
      }`}
      onClick={onSelect}
    >
      {/* ... (content same) */}
      <div className="flex items-center gap-2 p-2 cursor-pointer select-none">
        <div className={`w-1.5 h-1.5 rounded-full ${
          event.type === 'TOKEN' ? 'bg-zinc-400' :
          event.type === 'TOOL_CALL' ? 'bg-amber-500' :
          event.type === 'TOOL_RESULT' ? 'bg-emerald-500' :
          event.type === 'PING' || event.type === 'PONG' ? 'bg-zinc-600' :
          event.type === 'CONTEXT_SNAPSHOT' ? 'bg-blue-500' :
          event.type === 'USER_SENT' ? 'bg-zinc-300' :
          'bg-rose-500'
        } shrink-0`} />
        <div className="flex-1 flex items-center justify-between min-w-0">
          <span className={`text-[10px] font-mono truncate ${
            event.type === 'TOKEN' ? 'text-zinc-400' :
            event.type === 'TOOL_CALL' ? 'text-amber-500' :
            event.type === 'TOOL_RESULT' ? 'text-emerald-500' :
            event.type === 'PING' || event.type === 'PONG' ? 'text-zinc-600' :
            event.type === 'CONTEXT_SNAPSHOT' ? 'text-blue-500' :
            event.type === 'USER_SENT' ? 'text-zinc-300' :
            'text-rose-500'
          }`}>
            {event.type === 'TOKEN' ? `Streamed ${event.tokenCount} tokens (${(event.duration || 0 / 1000).toFixed(2)}s)` :
             event.type === 'TOOL_CALL' ? `Call ${event.data.tool_name}` :
             event.type === 'TOOL_RESULT' ? `Result ${event.data.call_id.substring(0, 8)}...` :
             event.type}
          </span>
          <span className="text-[8px] font-mono text-zinc-600 shrink-0 tabular-nums ml-2">
            {new Date(event.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
          className="p-1 hover:bg-zinc-800 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <svg className={`w-3 h-3 text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {isExpanded && (
        <div className="px-2 pb-2">
          <pre className="text-[9px] font-mono bg-zinc-950 p-2 rounded border border-zinc-800 overflow-x-auto text-zinc-500 leading-tight">
            {JSON.stringify(event.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
});

TraceRow.displayName = 'TraceRow';
