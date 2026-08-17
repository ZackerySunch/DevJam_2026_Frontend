// components/signal_page/SignalLog.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import type { SignalSnapshot, SignalFlow } from '@/services/signal';

/** 畫面上最多保留幾行，超過就從底下掉出去 */
const MAX_LINES = 60;
/** 每隔多久吐一行。5 秒 × 30 條 ≈ 每 160ms 一行，剛好填滿一輪 */
const DRIP_MS = 160;

/** 與地圖同一套：綠 → 黃 → 橘 */
const LEVEL_HEX = ['#4ADE80', '#A3E635', '#FACC15', '#FB923C', '#F97316'];

function levelIndex(load: number) {
  if (!Number.isFinite(load)) return 0;
  const v = load > 5 ? load : load * 20; // 後端給 1~5 或 0~100 都吃
  if (v < 20) return 0;
  if (v < 40) return 1;
  if (v < 60) return 2;
  if (v < 80) return 3;
  return 4;
}

type LogLine = {
  key: string;
  time: string;
  from: string;
  to: string;
  detail: string;
  color: string;
  bad: boolean;
};

function fmtMbps(v?: number) {
  if (!Number.isFinite(v as number)) return null;
  const n = v as number;
  return n >= 1000 ? `${(n / 1000).toFixed(2)} Gbps` : `${n.toFixed(1)} Mbps`;
}

function toLine(f: SignalFlow, seq: number): LogLine {
  const load = f.intensity;
  const i = levelIndex(load);

  const detail = [
    fmtMbps(f.trafficMbps),
    Number.isFinite(load) ? `${Math.round(load)}%` : null,
    Number.isFinite(f.latencyMs as number) ? `${f.latencyMs}ms` : null,
    f.status && f.status !== 'normal' ? f.status.toUpperCase() : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    key: `${f.id}-${seq}`,
    time: new Date().toLocaleTimeString('zh-TW', { hour12: false }),
    from: f.fromName || f.sourceCounty,
    to: f.toName || f.targetCounty,
    detail,
    color: LEVEL_HEX[i],
    bad: !!f.status && f.status !== 'normal',
  };
}

interface Props {
  snapshot: SignalSnapshot | null;
  paused?: boolean;
}

export default function SignalLog({ snapshot, paused = false }: Props) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const queue = useRef<SignalFlow[]>([]);
  const seq = useRef(0);

  // 新快照進來：整批排進待播佇列（每一筆都算一次新事件）
  useEffect(() => {
    const flows = snapshot?.flows;
    if (!flows?.length) return;
    // 佇列積太多代表後端比播放快，直接丟掉舊的，永遠播最新的
    queue.current = queue.current.length > MAX_LINES ? [...flows] : [...queue.current, ...flows];
  }, [snapshot]);

  // 一行一行吐出來，才有跑馬燈的感覺
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      const f = queue.current.shift();
      if (!f) return;
      const line = toLine(f, seq.current++);
      setLines((prev) => [line, ...prev].slice(0, MAX_LINES));
    }, DRIP_MS);
    return () => clearInterval(timer);
  }, [paused]);

  return (
    <>
      <style>{`
        @keyframes sigLogIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        className="flex-1 min-h-0 overflow-hidden"
        style={{
          maskImage:
            'linear-gradient(to bottom, black 0%, black 78%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, black 0%, black 78%, transparent 100%)',
        }}
      >
        {lines.length === 0 ? (
          <div className="text-zinc-600 text-xs px-1 py-2">等待資料...</div>
        ) : (
          <div className="flex flex-col gap-[7px]">
            {lines.map((l, i) => (
              <div
                key={l.key}
                className="px-1"
                style={{
                  animation: i === 0 ? 'sigLogIn 260ms ease-out' : undefined,
                  opacity: 1 - Math.min(0.55, i * 0.012),
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-600 tabular-nums shrink-0">
                    {l.time}
                  </span>
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: l.color }}
                  />
                  <span
                    className="text-[11px] text-zinc-300 truncate"
                    title={`${l.from} → ${l.to}`}
                  >
                    {l.from}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 pl-[62px]">
                  <span className="text-zinc-600 text-[10px] shrink-0">→</span>
                  <span
                    className="text-[11px] text-zinc-400 truncate"
                    title={l.to}
                  >
                    {l.to}
                  </span>
                </div>
                {l.detail && (
                  <div
                    className="pl-[62px] text-[10px] tabular-nums"
                    style={{ color: l.bad ? '#f87171' : l.color, opacity: 0.85 }}
                  >
                    {l.detail}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}