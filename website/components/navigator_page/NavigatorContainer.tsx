// components/navigator_page/NavigatorContainer.tsx
'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import NavigatorMap from './NavigatorMap';

export default function NavigatorContainer() {
  const [userLocation, setUserLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const handleLocate = useCallback(() => {
    setLocateError(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocateError('這個瀏覽器不支援定位');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lng: position.coords.longitude,
          lat: position.coords.latitude,
        });
        setIsLocating(false);
      },
      (error) => {
        setIsLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          setLocateError('定位權限被拒絕，請到瀏覽器設定開啟');
        } else if (error.code === error.TIMEOUT) {
          setLocateError('定位逾時，請再試一次');
        } else {
          setLocateError('目前拿不到位置');
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }, []);

  const handleClearLocation = useCallback(() => {
    setUserLocation(null);
    setLocateError(null);
  }, []);

  return (
    <main className="relative w-full h-screen bg-black text-white font-mono overflow-hidden">
      <NavigatorMap
        userLocation={userLocation}
        onClearUserLocation={handleClearLocation}
        onRequestLocate={handleLocate}
        isLocating={isLocating}
        locateError={locateError}
      />

      {/* 左上角 Logo */}
      <Link
        href="/"
        className="absolute top-8 left-8 z-30 select-none outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded-sm"
      >
        <span className="text-[22px] sm:text-2xl font-medium tracking-[0.38em] text-zinc-500 hover:text-zinc-300 transition-colors duration-300 ease-out">
          HOLYPING
        </span>
      </Link>

      {/* 左側說明（簡化） */}
      <div className="absolute top-24 left-8 z-20 w-64 pointer-events-none">
        <div className="bg-zinc-950/75 backdrop-blur-md border border-zinc-800/70 rounded-2xl p-4 shadow-xl">
          <h2 className="text-zinc-100 text-sm font-bold tracking-widest uppercase mb-2">
            公共網路導航
          </h2>
          <p className="text-zinc-400 text-xs leading-relaxed">
            點擊縣市進入該區域。<br />
            雙擊地圖點 → 側欄定位<br />
            雙擊側欄項目 → 開 Google 地圖
          </p>
        </div>
      </div>
    </main>
  );
}