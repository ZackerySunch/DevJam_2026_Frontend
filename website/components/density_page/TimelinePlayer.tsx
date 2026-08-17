// components/density_page/TimelinePlayer.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  timeKeys: string[];
  currentIndex: number;
  setCurrentIndex: (idx: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
}

/** 每一格大約多少毫秒（速度基準） */
const MS_PER_STEP = 900;

export default function TimelinePlayer({
  timeKeys,
  currentIndex,
  setCurrentIndex,
  isPlaying,
  setIsPlaying,
}: Props) {
  // 獨立維護一個狀態來觸發進場動畫 (取代 framer-motion)
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const rafRef = useRef<number | null>(null);
  const floatIndexRef = useRef<number>(currentIndex);
  const directionRef = useRef<number>(1); // 1: 正序 (往右), -1: 倒序 (往左)

  const maxIndex = Math.max(timeKeys.length - 1, 0);

  // 獨立維護一個視覺進度，確保 UI 更新是極致絲滑的 60fps
  const [visualProgress, setVisualProgress] = useState(
    maxIndex > 0 ? (currentIndex / maxIndex) * 100 : 0
  );

  // 使用者手動拖曳進度條或暫停時，同步狀態
  useEffect(() => {
    if (!isPlaying) {
      floatIndexRef.current = currentIndex;
      setVisualProgress(maxIndex > 0 ? (currentIndex / maxIndex) * 100 : 0);
    }
  }, [currentIndex, isPlaying, maxIndex]);

  // 來回等速循環輪播邏輯 (Ping-Pong)
  useEffect(() => {
    if (!isPlaying || maxIndex <= 0) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    let lastTime = performance.now();

    const tick = (now: number) => {
      const delta = now - lastTime;
      lastTime = now;

      // 依照目前方向推進度
      floatIndexRef.current += (delta / MS_PER_STEP) * directionRef.current;

      // 碰壁反彈邏輯：撞到頂部就往回，撞到底部就往前
      if (floatIndexRef.current >= maxIndex) {
        floatIndexRef.current = maxIndex;
        directionRef.current = -1; // 反轉為倒序
      } else if (floatIndexRef.current <= 0) {
        floatIndexRef.current = 0;
        directionRef.current = 1; // 反轉為正序
      }

      // 更新上層 Map 所需的整數 Index
      const nextIndex = Math.round(floatIndexRef.current);
      setCurrentIndex(nextIndex);

      // 更新進度條的絲滑視覺進度
      setVisualProgress((floatIndexRef.current / maxIndex) * 100);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, maxIndex, setCurrentIndex]);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  return (
    <div
      className={`absolute bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-4xl z-20 flex items-center gap-6 bg-zinc-950/70 backdrop-blur-md border border-zinc-800/80 px-6 py-4 rounded-2xl transition-all duration-700 delay-200 ease-out ${
        isMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
      }`}
    >
      {/* 播放 / 暫停按鈕 */}
      <button
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className="
          w-12 h-12 flex items-center justify-center rounded-full
          bg-zinc-200 text-black
          shadow-[0_0_15px_rgba(255,255,255,0.25)]
          transition-all duration-200 ease-out
          hover:bg-white hover:scale-105 hover:shadow-[0_0_22px_rgba(255,255,255,0.4)]
          active:scale-95
          focus:outline-none
        "
      >
        {isPlaying ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* 絲滑進度條 */}
      <div className="flex-1 relative flex items-center h-8 group">
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-zinc-300 rounded-full"
            style={{ width: `${visualProgress}%` }}
          />
        </div>

        <input
          type="range"
          min={0}
          max={maxIndex}
          value={currentIndex}
          onChange={(e) => {
            setIsPlaying(false);
            setCurrentIndex(Number(e.target.value));
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none focus:outline-none"
        />

        <div
          className="
            absolute top-1/2 -translate-y-1/2
            w-4 h-4 rounded-full bg-white
            shadow-[0_0_12px_rgba(255,255,255,0.5)]
            pointer-events-none
            group-hover:scale-125
            group-active:scale-110
          "
          style={{ left: `calc(${visualProgress}% - 8px)` }}
        />
      </div>

      {/* 時間顯示 */}
      <div className="w-24 text-right">
        <span className="text-2xl font-black tracking-widest text-zinc-200">
          {timeKeys[currentIndex] ?? ''}
        </span>
      </div>
    </div>
  );
}