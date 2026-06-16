'use client';

import { useChatStore } from '@/store/useChatStore';
import { ContextSnapshot } from '@/types/context';
import { useMemo, useState } from 'react';
import * as jsondiffpatch from 'jsondiffpatch';

// Initialize jsondiffpatch
const patcher = jsondiffpatch.create({
  objectHash: (obj: any) => obj.id || obj._id || JSON.stringify(obj),
});

export default function ContextInspector() {
  const { contextHistories, activeContextId, setActiveContext, setContextIndex } = useChatStore();

  const activeHistory = activeContextId ? contextHistories[activeContextId] : null;
  const currentSnapshot = activeHistory ? activeHistory.snapshots[activeHistory.currentIndex] : null;
  const previousSnapshot = activeHistory && activeHistory.currentIndex > 0 
    ? activeHistory.snapshots[activeHistory.currentIndex - 1] 
    : null;

  const diff = useMemo(() => {
    if (!currentSnapshot || !previousSnapshot) return null;
    return patcher.diff(previousSnapshot.data, currentSnapshot.data);
  }, [currentSnapshot, previousSnapshot]);

  if (Object.keys(contextHistories).length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <p className="text-xs text-zinc-600 uppercase font-bold tracking-widest">No context snapshots received yet</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-950">
      {/* Context Selector */}
      <div className="p-4 border-b border-zinc-800 space-y-3">
        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Active Context</label>
        <select 
          value={activeContextId || ''}
          onChange={(e) => setActiveContext(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 text-xs rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
        >
          {Object.keys(contextHistories).map(id => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
      </div>

      {activeHistory && (
        <>
          {/* History Scrubber */}
          <div className="p-4 border-b border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">History Scrubber</label>
              <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                Snapshot {activeHistory.currentIndex + 1} / {activeHistory.snapshots.length}
              </span>
            </div>
            <input 
              type="range"
              min="0"
              max={activeHistory.snapshots.length - 1}
              value={activeHistory.currentIndex}
              onChange={(e) => setContextIndex(activeHistory.context_id, parseInt(e.target.value))}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex justify-between text-[8px] font-mono text-zinc-600 uppercase tracking-tighter">
              <span>{new Date(activeHistory.snapshots[0].timestamp).toLocaleTimeString()}</span>
              <span>{new Date(activeHistory.snapshots[activeHistory.snapshots.length - 1].timestamp).toLocaleTimeString()}</span>
            </div>
          </div>

          {/* Data Tree */}
          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-zinc-800">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Data State</h3>
                {diff && (
                  <span className="text-[8px] font-bold uppercase tracking-widest text-amber-500 border border-amber-500/30 px-1.5 py-0.5 rounded">
                    Diff Active
                  </span>
                )}
              </div>
              <div className="font-mono text-xs">
                <JsonTree data={currentSnapshot?.data} diff={diff} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function JsonTree({ data, diff, depth = 0 }: { data: any, diff?: any, depth?: number }) {
  if (data === null) return <span className="text-zinc-500">null</span>;
  if (typeof data !== 'object') {
    return <span className={typeof data === 'string' ? 'text-emerald-400' : 'text-amber-400'}>{JSON.stringify(data)}</span>;
  }

  return (
    <div className={`${depth > 0 ? 'ml-4 border-l border-zinc-800/50 pl-2' : ''}`}>
      {Object.entries(data).map(([key, value]) => {
        const keyDiff = diff ? diff[key] : null;
        let bgClass = '';
        
        // Basic diff highlighting logic
        if (keyDiff) {
          if (Array.isArray(keyDiff)) {
            if (keyDiff.length === 1) bgClass = 'bg-emerald-500/10 ring-1 ring-emerald-500/20'; // Added
            else if (keyDiff.length === 3 && keyDiff[2] === 3) bgClass = 'bg-rose-500/10 ring-1 ring-rose-500/20'; // Deleted
            else bgClass = 'bg-amber-500/10 ring-1 ring-amber-500/20'; // Modified
          } else {
            bgClass = 'bg-amber-500/5'; // Nested change
          }
        }

        return (
          <div key={key} className={`py-0.5 rounded ${bgClass}`}>
            <span className="text-zinc-500">{key}: </span>
            <JsonTree data={value} diff={keyDiff} depth={depth + 1} />
          </div>
        );
      })}
    </div>
  );
}
