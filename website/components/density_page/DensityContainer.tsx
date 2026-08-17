// components/density_page/DensityContainer.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  fetchDensityData,
  DensityResponse,
  ProviderType,
  NetGeneration,
} from '@/services/density';
import DensityMap from './DensityMap';
import ControlPanel from './ControlPanel';
import TimelinePlayer from './TimelinePlayer';

/**
 * 進場後多久自動開始播放（毫秒）。
 * 要比地圖的開場動畫久一點，讓「白光台灣 → 長出資料」先演完，
 * 時間軸才接手，不然兩個動畫會打在一起。
 *
 * 地圖那邊：INTRO_DELAY 400 + INTRO_DURATION 2800 + REVEAL_DELAY 260
 *          + 顏色/高度過場 900 ≈ 4360ms
 */
const AUTOPLAY_DELAY = 4200;

export default function DensityContainer() {
  const [data, setData] = useState<DensityResponse | null>(null);
  const [provider, setProvider] = useState<ProviderType>('CHT');
  const [generation, setGeneration] = useState<NetGeneration>('5G');

  const [timeKeys, setTimeKeys] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  /** 自動播放只做一次；之後播放與暫停完全由使用者決定 */
  const [autoStarted, setAutoStarted] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      const result = await fetchDensityData(provider);
      if (isMounted) {
        setData(result);
        const keys = Object.keys(result).sort();
        setTimeKeys(keys);
        setCurrentIndex(0);
        // 🌟 這裡不再強制暫停：切換業者時如果本來在播，就從頭繼續播
      }
    };
    loadData();
    return () => {
      isMounted = false;
    };
  }, [provider]);

  // 🌟 使用者一進來就自動播放
  useEffect(() => {
    if (autoStarted) return;
    if (timeKeys.length < 2) return; // 資料還沒到、或只有一格就不用播

    // 使用者若在系統設定關掉動畫，就尊重他，不自動播
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setAutoStarted(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setIsPlaying(true);
      setAutoStarted(true);
    }, AUTOPLAY_DELAY);

    return () => window.clearTimeout(timer);
  }, [autoStarted, timeKeys.length]);

  const currentTimeKey = timeKeys[currentIndex] || '';
  const currentMapData = data && currentTimeKey ? data[currentTimeKey] : {};

  return (
    <main className="relative w-full h-screen bg-black text-white font-mono overflow-hidden">
      <DensityMap data={currentMapData} generation={generation} />

      {/* 左上角 HOLYPING logo */}
      <Link
        href="/"
        className="absolute top-8 left-8 z-30 select-none outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded-sm"
      >
        <span className="text-[22px] sm:text-2xl font-medium tracking-[0.38em] text-zinc-500 hover:text-zinc-300 transition-colors duration-300 ease-out">
          HOLYPING
        </span>
      </Link>

      {/* 左側說明區塊（logo 下方，寬度與右側對齊） */}
      <div className="absolute top-24 left-8 z-20 w-72">
        <div className="bg-zinc-950/80 backdrop-blur-md border border-zinc-800/80 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
          <div>
            <h2 className="text-zinc-100 text-base font-bold tracking-widest uppercase mb-2.5">
              基地台密度視覺化
            </h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              以 3D 柱狀圖呈現台灣各縣市
              <br />
              4G / 5G 基地台數量。
              <br />
              高度與亮度代表密度，可切換
              <br />
              電信業者與通訊世代，並透過
              <br />
              時間軸回顧演進。
            </p>
          </div>

          <div className="pt-3 border-t border-zinc-800/80 space-y-2">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <kbd className="px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-900 text-[10px] font-mono text-zinc-300">
                Left-Click
              </kbd>
              <span>拖曳旋轉視角</span>
            </div>
            <div className="text-[11px] text-zinc-600 tracking-wider">
              Hover 縣市可查看詳細數值
            </div>
          </div>
        </div>
      </div>

      <ControlPanel
        provider={provider}
        setProvider={setProvider}
        generation={generation}
        setGeneration={setGeneration}
      />

      {timeKeys.length > 0 && (
        <TimelinePlayer
          timeKeys={timeKeys}
          currentIndex={currentIndex}
          setCurrentIndex={setCurrentIndex}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
        />
      )}
    </main>
  );
}