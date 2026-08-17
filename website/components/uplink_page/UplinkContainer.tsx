// components/uplink_page/UplinkContainer.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

/* 開機自檢訊息：一行一行吐出來 */
const BOOT_LINES: { text: string; tag: 'ok' | 'wait' | 'skip' }[] = [
  { text: '掛載 /dev/uplink0', tag: 'ok' },
  { text: '同步 NTP 時基', tag: 'ok' },
  { text: '讀取上行鏈路遙測通道', tag: 'ok' },
  { text: '協商調變參數 (QPSK → 16QAM)', tag: 'ok' },
  { text: '訂閱 signal.uplink.events', tag: 'skip' },
  { text: '建立上行鏈路', tag: 'wait' },
];

const MODULES: { name: string; state: 'done' | 'wip' | 'queued' }[] = [
  { name: '鏈路遙測擷取', state: 'done' },
  { name: '上行頻寬視覺化', state: 'wip' },
  { name: '重傳與遺失分析', state: 'queued' },
  { name: '告警規則引擎', state: 'queued' },
];

const TAG_STYLE = {
  ok: { label: '  OK  ', color: '#4ADE80' },
  wait: { label: ' WAIT ', color: '#FACC15' },
  skip: { label: ' SKIP ', color: '#71717a' },
} as const;

const STATE_STYLE = {
  done: { label: '已完成', color: '#4ADE80', fill: 1 },
  wip: { label: '進行中', color: '#FB923C', fill: 0.45 },
  queued: { label: '排隊中', color: '#52525b', fill: 0.08 },
} as const;

export default function UplinkContainer() {
  const [shown, setShown] = useState(0);
  const [bars, setBars] = useState<number[]>(() => Array(28).fill(0.2));
  const [elapsed, setElapsed] = useState(0);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced.current) {
      setShown(BOOT_LINES.length);
      return;
    }
    const timer = setInterval(() => {
      setShown((n) => (n >= BOOT_LINES.length ? n : n + 1));
    }, 420);
    return () => clearInterval(timer);
  }, []);

  // 假的頻譜條，純氛圍
  useEffect(() => {
    if (reduced.current) return;
    let raf = 0;
    const loop = () => {
      const t = performance.now() / 1000;
      setBars((prev) =>
        prev.map((_, i) => {
          const a = Math.sin(t * 1.6 + i * 0.55);
          const b = Math.sin(t * 0.7 + i * 1.3);
          return 0.18 + Math.abs(a * 0.35 + b * 0.3);
        })
      );
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const hh = String(Math.floor(elapsed / 3600)).padStart(2, '0');
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <main className="relative w-full h-screen bg-black text-white font-mono overflow-hidden">
      <style>{`
        @keyframes upFadeIn { from { opacity:0; transform: translateY(5px);} to {opacity:1; transform:none;} }
        @keyframes upBlink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        @keyframes upSweep { 0%{transform:translateY(-100%)} 100%{transform:translateY(2200%)} }
        .up-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .up-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* 背景網格 */}
      <div
        className="absolute inset-0 opacity-[0.18] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(80,180,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(80,180,255,0.35) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage: 'radial-gradient(ellipse at 50% 40%, black 30%, transparent 78%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at 50% 40%, black 30%, transparent 78%)',
        }}
      />
      {/* 掃描線 */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(80,180,255,0.55), transparent)',
          animation: 'upSweep 7s linear infinite',
        }}
      />
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_200px_rgba(0,0,0,0.9)]" />

      {/* Logo */}
      <Link
        href="/"
        className="absolute top-8 left-8 z-30 select-none outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/50 rounded-sm"
      >
        <span className="text-[22px] sm:text-2xl font-medium tracking-[0.38em] text-zinc-500 hover:text-zinc-300 transition-colors duration-300">
          HOLYPING
        </span>
      </Link>

      {/* 右上狀態 */}
      <div className="absolute top-8 right-8 z-30 flex items-center gap-2 text-xs text-zinc-500">
        <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="tracking-widest">BUILDING</span>
        <span className="text-zinc-700">·</span>
        <span className="tabular-nums text-zinc-600">
          {hh}:{mm}:{ss}
        </span>
      </div>

      {/* 內容：固定一屏，放不下時可捲但不顯示捲軸 */}
      <div className="up-scroll relative z-20 h-full overflow-y-auto flex items-center">
        <div className="w-full max-w-5xl mx-auto px-8 py-20 grid lg:grid-cols-[1fr_1.05fr] gap-x-12 gap-y-8 items-center">
        <div>
        {/* 標題 */}
        <div className="text-[11px] tracking-[0.4em] text-zinc-600 mb-4">
          MODULE 02
        </div>
        <h1 className="text-4xl sm:text-5xl font-medium tracking-[0.22em] text-zinc-100">
          UPLINK
        </h1>
        <p className="mt-4 text-sm text-zinc-500 leading-relaxed max-w-md">
          上行鏈路即時遙測。這個頁面還在施工中，
          <br />
          先讓你看看它現在跑到哪裡。
        </p>

        {/* 頻譜條 */}
        <div className="mt-8 flex items-end gap-[3px] h-12">
          {bars.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height: `${Math.min(100, v * 100)}%`,
                background: `rgba(80,180,255,${0.18 + v * 0.5})`,
                transition: 'height 90ms linear',
              }}
            />
          ))}
        </div>

        {/* 出口 */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/signal"
            className="px-4 py-2.5 rounded-lg text-sm transition-all"
            style={{
              background: 'rgba(16,185,129,0.12)',
              border: '1px solid rgba(16,185,129,0.45)',
              color: '#6ee7b7',
            }}
          >
            ← 先去看 Signal Flow
          </Link>
          <Link
            href="/"
            className="px-4 py-2.5 rounded-lg text-sm text-zinc-400 border border-zinc-800 hover:text-zinc-200 hover:border-zinc-700 transition-all"
          >
            回首頁
          </Link>
        </div>
        </div>

        {/* 右欄 */}
        <div>
        {/* 自檢 log */}
        <div
          className="rounded-2xl border p-4"
          style={{
            background: 'rgba(8,12,20,0.9)',
            borderColor: 'rgba(80,180,255,0.15)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3">
            System check
          </div>
          {/* 固定高度的終端機視窗：訊息從下面長出來，舊的往上淡掉 */}
          <div
            className="h-[86px] overflow-hidden flex flex-col justify-end gap-1 text-[11px]"
            style={{
              maskImage:
                'linear-gradient(to bottom, transparent 0%, black 32%, black 100%)',
              WebkitMaskImage:
                'linear-gradient(to bottom, transparent 0%, black 32%, black 100%)',
            }}
          >
            {BOOT_LINES.slice(0, shown).map((l, i) => {
              const s = TAG_STYLE[l.tag];
              return (
                <div
                  key={l.text}
                  className="flex items-center gap-2.5 shrink-0 leading-[15px]"
                  style={{ animation: 'upFadeIn 240ms ease-out' }}
                >
                  <span style={{ color: s.color }} className="whitespace-pre">
                    [{s.label}]
                  </span>
                  <span className="text-zinc-400">{l.text}</span>
                  {l.tag === 'wait' && (
                    <span
                      className="w-[6px] h-[11px] bg-zinc-400 inline-block"
                      style={{ animation: 'upBlink 1s step-end infinite' }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 進度 */}
        <div
          className="mt-3 rounded-2xl border p-4"
          style={{
            background: 'rgba(8,12,20,0.9)',
            borderColor: 'rgba(80,180,255,0.15)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3">
            Roadmap
          </div>
          <div className="space-y-3">
            {MODULES.map((m) => {
              const s = STATE_STYLE[m.state];
              return (
                <div key={m.name}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-[12px] text-zinc-300">{m.name}</span>
                    <span className="text-[10px]" style={{ color: s.color }}>
                      {s.label}
                    </span>
                  </div>
                  <div className="h-[3px] rounded-full bg-zinc-800/80 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${s.fill * 100}%`,
                        background: s.color,
                        opacity: m.state === 'queued' ? 0.4 : 0.9,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        </div>
        </div>
      </div>
    </main>
  );
}