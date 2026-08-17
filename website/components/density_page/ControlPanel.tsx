// components/density_page/ControlPanel.tsx
'use client';

import { ProviderType, NetGeneration } from '@/services/density';

interface Props {
  provider: ProviderType;
  setProvider: (p: ProviderType) => void;
  generation: NetGeneration;
  setGeneration: (g: NetGeneration) => void;
}

export default function ControlPanel({ provider, setProvider, generation, setGeneration }: Props) {
  const providers: { id: ProviderType; label: string }[] = [
    { id: 'CHT', label: '中華電信' },
    { id: 'FET', label: '遠傳電信' },
    { id: 'TWM', label: '台灣大哥大' },
  ];
  
  const generations: NetGeneration[] = ['5G', '4G'];

  return (
    <div className="absolute top-8 right-8 z-20 bg-zinc-950/80 backdrop-blur-md border border-zinc-800/80 p-5 rounded-2xl shadow-2xl flex flex-col gap-6 w-72">
      {/* 供應商選擇 */}
      <div>
        <h3 className="text-zinc-400 text-xs font-bold mb-3 tracking-widest uppercase">Provider 電信業者</h3>
        <div className="flex flex-col gap-2">
          {providers.map(p => (
            <button
              key={p.id}
              onClick={() => setProvider(p.id)}
              className={`px-4 py-2.5 rounded-lg text-sm font-bold transition-all flex justify-between items-center ${
                provider === p.id 
                  ? 'bg-zinc-200 text-black shadow-[0_0_15px_rgba(255,255,255,0.2)]' 
                  : 'bg-zinc-900/50 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <span>{p.id}</span>
              <span className="text-xs opacity-70 font-normal">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 世代選擇 (4G/5G) */}
      <div>
        <h3 className="text-zinc-400 text-xs font-bold mb-3 tracking-widest uppercase">Generation 通訊世代</h3>
        <div className="flex bg-zinc-900/80 rounded-lg p-1 border border-zinc-800">
          {generations.map(g => (
            <button
              key={g}
              onClick={() => setGeneration(g)}
              className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${
                generation === g 
                  ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.4)]' 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}