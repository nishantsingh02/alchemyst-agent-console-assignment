'use client';

import { useEffect, useState, useRef } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { UIMessage, AgentMessage, MessageBlock, ToolBlock } from '@/types/ui';

import TraceTimeline from '@/components/TraceTimeline';
import ContextInspector from '@/components/ContextInspector';

export default function Home() {
  const { 
    messages, 
    connect, 
    disconnect, 
    isConnected, 
    sendUserMessage, 
    activeCorrelationId, 
    setHighlightedCorrelation 
  } = useChatStore();
  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState<'trace' | 'context'>('trace');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !isConnected) return;
    sendUserMessage(input);
    setInput('');
  };

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      <main className="flex-1 flex flex-col min-w-0 border-r border-zinc-800">
        <header className="flex items-center justify-between p-4 md:px-8 border-b border-zinc-800 shrink-0">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Agent Console</h1>
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span className="text-xs text-zinc-400 uppercase tracking-widest font-medium">
                {isConnected ? 'Backend Online' : 'Backend Offline'}
              </span>
            </div>
          </div>
        </header>

        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-6 p-4 md:p-8 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent"
        >
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] ${msg.role === 'user' ? 'bg-zinc-800 p-4 rounded-2xl rounded-tr-none' : 'w-full'}`}>
                {msg.role === 'user' ? (
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                ) : (
                  <div className="space-y-4">
                    {(msg as AgentMessage).blocks.map((block, j) => (
                      <RenderBlock 
                        key={j} 
                        block={block} 
                        isHighlighted={
                          (block.type === 'tool' && activeCorrelationId === block.call_id) ||
                          (block.type === 'text' && activeCorrelationId === (msg as AgentMessage).stream_id)
                        }
                        onSelect={() => {
                          if (block.type === 'tool') {
                            setHighlightedCorrelation(block.call_id);
                          } else {
                            setHighlightedCorrelation((msg as AgentMessage).stream_id);
                          }
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 md:px-8 pb-8 shrink-0">
          <form onSubmit={handleSend} className="relative max-w-4xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isConnected ? "Message the agent..." : "Connecting to backend..."}
              disabled={!isConnected}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all placeholder:text-zinc-600"
            />
            <button
              type="submit"
              disabled={!isConnected || !input.trim()}
              className="absolute right-2 top-2 bottom-2 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-xs font-bold transition-colors uppercase tracking-wider"
            >
              Send
            </button>
          </form>
        </div>
      </main>

      <div className="w-96 flex flex-col bg-zinc-950">
        <div className="flex border-b border-zinc-800 shrink-0">
          <button 
            onClick={() => setActiveTab('trace')}
            className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors ${
              activeTab === 'trace' ? 'text-emerald-500 border-b-2 border-emerald-500 bg-zinc-900/50' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Trace
          </button>
          <button 
            onClick={() => setActiveTab('context')}
            className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors ${
              activeTab === 'context' ? 'text-emerald-500 border-b-2 border-emerald-500 bg-zinc-900/50' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Context
          </button>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === 'trace' ? <TraceTimeline /> : <ContextInspector />}
        </div>
      </div>
    </div>
  );
}

function RenderBlock({ block, isHighlighted, onSelect }: { 
  block: MessageBlock; 
  isHighlighted?: boolean;
  onSelect?: () => void;
}) {
  if (block.type === 'text') {
    return (
      <div 
        className={`transition-colors rounded p-1 -m-1 ${isHighlighted ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30' : ''}`}
      >
        <p className="text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap">{block.content}</p>
      </div>
    );
  }

  const tool = block as ToolBlock;
  return (
    <div 
      onClick={onSelect}
      className={`bg-zinc-900 border transition-all rounded-xl overflow-hidden my-2 shadow-sm cursor-pointer ${
        isHighlighted ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-zinc-800'
      }`}
    >
      <div className="bg-zinc-800/50 px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-emerald-500/10 rounded">
            <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <span className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-tight">{tool.tool_name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-widest ${
            tool.status === 'result_received' ? 'text-emerald-500' : 'text-amber-500 animate-pulse'
          }`}>
            {tool.status === 'result_received' ? 'Completed' : 'Running...'}
          </span>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Arguments</span>
          <pre className="text-xs font-mono bg-zinc-950 p-2 rounded border border-zinc-800 overflow-x-auto text-zinc-400">
            {JSON.stringify(tool.args, null, 2)}
          </pre>
        </div>
        {tool.result && (
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-widest text-emerald-500/70 font-bold">Result</span>
            <pre className="text-xs font-mono bg-zinc-950 p-2 rounded border border-emerald-500/20 overflow-x-auto text-emerald-400/90">
              {JSON.stringify(tool.result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
