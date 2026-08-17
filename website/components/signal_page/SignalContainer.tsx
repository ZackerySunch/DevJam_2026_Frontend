// components/signal_page/SignalContainer.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import SignalMap from './SignalMap';
import SignalLog from './Signallog';
import {
  fetchSignalSnapshot,
  ALL_COUNTIES,
  SignalSnapshot,
} from '@/services/signal';

/** 後端每次回來的是「當下狀態」，打太密只會讓動畫來不及演完 */
const POLL_MS = 5000;

export default function SignalContainer() {
  const [snapshot, setSnapshot] = useState<SignalSnapshot | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [lastUpdate, setLastUpdate] = useState('--:--:--');
  const [error, setError] = useState<string | null>(null);

  const inFlight = useRef(false);

  useEffect(() => {
    if (!isLive) return;

    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const tick = async () => {
      // 上一發還沒回來就跳過，避免慢速網路把請求疊起來
      if (inFlight.current) return schedule();
      inFlight.current = true;

      try {
        const data = await fetchSignalSnapshot(ALL_COUNTIES, ctrl.signal);
        if (stopped) return;
        setSnapshot(data);
        setError(null);
        setLastUpdate(
          new Date(data.timestamp).toLocaleTimeString('zh-TW', { hour12: false })
        );
      } catch (e: any) {
        if (stopped || e?.name === 'AbortError') return;
        setError(e?.message ?? '無法連線到後端');
      } finally {
        inFlight.current = false;
        schedule();
      }
    };

    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(tick, POLL_MS);
    };

    tick();

    return () => {
      stopped = true;
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [isLive]);

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
            全台骨幹即時流向。
            <br />
            線條粗細與顏色 = 鏈路負載。
            <br />
            每 {POLL_MS / 1000} 秒更新一次。
          </p>

          {/* 顏色圖例 */}
          <div className="mt-3 flex items-center gap-1.5">
            {[
              ['#4ADE80', '低'],
              ['#A3E635', ''],
              ['#FACC15', ''],
              ['#FB923C', ''],
              ['#F97316', '高'],
            ].map(([c, label], i) => (
              <div key={i} className="flex items-center gap-1">
                <span
                  className="inline-block rounded-full"
                  style={{
                    background: c,
                    width: 6 + i * 2,
                    height: 6 + i * 2,
                  }}
                />
                {label && (
                  <span className="text-[10px] text-zinc-500">{label}</span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                error
                  ? 'bg-red-500'
                  : isLive
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-zinc-600'
              }`}
            />
            <span>{error ? 'ERROR' : isLive ? 'LIVE' : 'PAUSED'}</span>
            <span className="text-zinc-600">·</span>
            <span>{lastUpdate}</span>
          </div>

          {error && (
            <p className="mt-2 text-[11px] text-red-400/90 leading-relaxed break-words">
              {error}
            </p>
          )}
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

      {/* 右側：即時事件流 */}
      <div className="absolute top-24 right-8 bottom-8 z-20 w-[22rem] flex flex-col">
        <div
          className="flex-1 min-h-0 rounded-2xl p-4 border flex flex-col"
          style={{
            background: 'rgba(8,12,20,0.92)',
            borderColor: 'rgba(80,180,255,0.15)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div className="flex items-baseline justify-between mb-3 shrink-0">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">
              Live feed
            </div>
            <div className="text-[10px] text-zinc-600 tabular-nums">
              {snapshot ? `${snapshot.flows.length} 條 / ${POLL_MS / 1000}s` : '--'}
            </div>
          </div>

          <SignalLog snapshot={snapshot} paused={!isLive} />
        </div>
      </div>

    </main>
  );
}