// components/density_page/TimelinePlayer.tsx
'use client';

import { motion } from 'framer-motion';

interface Props {
  timeKeys: string[];
  currentIndex: number;
  setCurrentIndex: (idx: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
}

export default function TimelinePlayer({
  timeKeys,
  currentIndex,
  setCurrentIndex,
  isPlaying,
  setIsPlaying,
}: Props) {
  const togglePlay = () => {
    if (currentIndex === timeKeys.length - 1) {
      setCurrentIndex(0);
    }
    setIsPlaying(!isPlaying);
  };

  const progress =
    timeKeys.length > 1 ? (currentIndex / (timeKeys.length - 1)) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.2 }}
      className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-4xl z-20 flex items-center gap-6 bg-zinc-950/70 backdrop-blur-md border border-zinc-800/80 px-6 py-4 rounded-2xl"
    >
      {/* 播放 / 暫停 */}
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
          focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950
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
        {/* 軌道背景 */}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-zinc-300 rounded-full transition-[width] duration-150 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* 隱形可拖曳 range */}
        <input
          type="range"
          min={0}
          max={Math.max(timeKeys.length - 1, 0)}
          value={currentIndex}
          onChange={(e) => {
            setIsPlaying(false);
            setCurrentIndex(Number(e.target.value));
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none focus:outline-none"
        />

        {/* 自訂 thumb */}
        <div
          className="
            absolute top-1/2 -translate-y-1/2
            w-4 h-4 rounded-full bg-white
            shadow-[0_0_12px_rgba(255,255,255,0.5)]
            pointer-events-none
            transition-transform duration-150 ease-out
            group-hover:scale-125
            group-active:scale-110
          "
          style={{ left: `calc(${progress}% - 8px)` }}
        />
      </div>

      {/* 時間顯示 */}
      <div className="w-24 text-right">
        <span className="text-2xl font-black tracking-widest text-zinc-200">
          {timeKeys[currentIndex]}
        </span>
      </div>
    </motion.div>
  );
}