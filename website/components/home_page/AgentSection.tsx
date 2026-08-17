// components/home_page/AgentSection.tsx
'use client';

import { useState } from 'react';
import AgentMap from './AgentMap';
import AgentChat from './AgentChat';

export default function AgentSection() {
  // 地圖選到的縣市，是地圖與 chatbox 唯一共用的狀態
  const [county, setCounty] = useState<string | null>(null);

  return (
    <section className="w-full bg-black px-6 sm:px-10 py-24">
      <div className="max-w-7xl mx-auto">
        {/* 標題 */}
        <div className="text-[11px] tracking-[0.4em] text-zinc-600">
          AI AGENT
        </div>
        <h2 className="mt-3 text-3xl sm:text-4xl font-medium tracking-wide text-zinc-100">
          用問的，比用找的快
        </h2>
        <p className="mt-3 text-sm text-zinc-500 leading-relaxed max-w-lg">
          在地圖上點一個縣市，直接問它現在的網路狀況。
        </p>

        {/* 主體：左 2/3 地圖，右 1/3 chatbox */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 relative h-[380px] lg:h-[620px] rounded-3xl overflow-hidden border border-zinc-800/80">
            <AgentMap selected={county} onSelect={setCounty} />
          </div>

          <div className="lg:col-span-1 h-[560px] lg:h-[620px] rounded-3xl overflow-hidden border border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md">
            <AgentChat county={county} />
          </div>
        </div>
      </div>
    </section>
  );
}