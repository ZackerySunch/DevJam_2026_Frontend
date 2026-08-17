// components/signal_page/SignalContainer.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import SignalMap from './SignalMap';
import { fetchSignalSnapshot, SignalSnapshot } from '@/services/signal';

const POLL_MS = 1000;

export default function SignalContainer() {
  const [snapshot, setSnapshot] = useState<SignalSnapshot | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('--:--:--');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (!isLive || cancelled) return;
      try {
        const data = await fetchSignalSnapshot();
        if (cancelled) return;
        setSnapshot(data);
        setLastUpdate(
          new Date(data.timestamp).toLocaleTimeString('zh-TW', { hour12: false })
        );
      } catch {
        // 之後串 API 可在這裡顯示錯誤
      }
    };

    tick();
    timerRef.current = setInterval(tick, POLL_MS);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isLive]);

  const topBusy = snapshot?.byCounty.slice(0, 5) ?? [];
  const leastBusy = snapshot
    ? [...snapshot.byCounty].sort((a, b) => a.total - b.total).slice(0, 5)
    : [];

  return (
    <main className="relative w-full h-screen bg-black text-white font-mono overflow-hidden">
      <SignalMap snapshot={snapshot} />

      {/* Logo */}
      <Link
        href="/"
        className="absolute top-8 left-8 z-30 select-none outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/50 rounded-sm"
      >
        <span className="text-[22px] sm:text-2xl font-medium tracking-[0.38em] text-zinc-500 hover:text-zinc-300 transition-colors duration-300">
          HOLYPING
        </span>
      </Link>

      {/* 左上說明 */}
      <div className="absolute top-24 left-8 z-20 w-72 pointer-events-none">
        <div className="bg-zinc-950/80 backdrop-blur-md border border-zinc-800/80 rounded-2xl p-5 shadow-2xl">
          <h2 className="text-zinc-100 text-base font-bold tracking-widest uppercase mb-2">
            Signal Flow
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            即時基地台流量流動。
            <br />
            弧線粗細 = 流量強度。
            <br />
            每秒從後端拉取最新快照。
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isLive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
              }`}
            />
            <span>{isLive ? 'LIVE' : 'PAUSED'}</span>
            <span className="text-zinc-600">·</span>
            <span>{lastUpdate}</span>
          </div>
        </div>
      </div>

      {/* 右上：暫停 / 繼續 */}
      <div className="absolute top-8 right-8 z-30">
        <button
          onClick={() => setIsLive((v) => !v)}
          className="px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
          style={{
            background: isLive ? 'rgba(16,185,129,0.15)' : 'rgba(12,18,28,0.9)',
            border: isLive
              ? '1px solid rgba(16,185,129,0.5)'
              : '1px solid rgba(80,180,255,0.3)',
            color: isLive ? '#6ee7b7' : '#e0f2fe',
            backdropFilter: 'blur(12px)',
          }}
        >
          {isLive ? '● LIVE — 點擊暫停' : '○ 已暫停 — 點擊繼續'}
        </button>
      </div>

      {/* 右側統計 */}
      <div className="absolute top-24 right-8 z-20 w-64 flex flex-col gap-3">
        <div
          className="rounded-2xl p-4 border"
          style={{
            background: 'rgba(8,12,20,0.92)',
            borderColor: 'rgba(80,180,255,0.15)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
            流量最高
          </div>
          <div className="space-y-1.5">
            {topBusy.length === 0 ? (
              <div className="text-zinc-600 text-xs">等待資料...</div>
            ) : (
              topBusy.map((c, i) => (
                <div key={c.county} className="flex justify-between text-sm">
                  <span className="text-zinc-300">
                    <span className="text-zinc-600 mr-1.5">{i + 1}</span>
                    {c.county}
                  </span>
                  <span className="text-cyan-400 font-mono text-xs">{c.total}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div
          className="rounded-2xl p-4 border"
          style={{
            background: 'rgba(8,12,20,0.92)',
            borderColor: 'rgba(80,180,255,0.15)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
            流量最低
          </div>
          <div className="space-y-1.5">
            {leastBusy.length === 0 ? (
              <div className="text-zinc-600 text-xs">等待資料...</div>
            ) : (
              leastBusy.map((c, i) => (
                <div key={c.county} className="flex justify-between text-sm">
                  <span className="text-zinc-300">
                    <span className="text-zinc-600 mr-1.5">{i + 1}</span>
                    {c.county}
                  </span>
                  <span className="text-zinc-500 font-mono text-xs">{c.total}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {snapshot && (
          <div className="text-[10px] text-zinc-600 text-right px-1">
            本幀 {snapshot.flows.length} 條連線
          </div>
        )}
      </div>
    </main>
  );
}