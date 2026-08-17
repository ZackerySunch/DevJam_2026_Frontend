// components/home_page/AgentSection.tsx
'use client';

import AgentMap from './AgentMap';
import AgentChat from './AgentChat';
import AgentNavigateDialog from './AgentNavigateDialog';
import { useAgentChat } from '@/services/useAgentChat';

export default function AgentSection() {
  // 對話與地圖狀態都在 service 裡，這裡只負責接線
  const {
    messages,
    map,
    busy,
    send,
    focusCounty,
    reset,
    navPrompt,
    confirmNavigate,
    dismissNavigate,
  } = useAgentChat();

  return (
    <section className="w-full bg-black px-6 sm:px-10 py-24">
      <div className="max-w-7xl mx-auto">
        <div className="text-[11px] tracking-[0.4em] text-zinc-600">AI AGENT</div>
        <h2 className="mt-3 text-3xl sm:text-4xl font-medium tracking-wide text-zinc-100">
          用問的，比用找的快
        </h2>
        <p className="mt-3 text-sm text-zinc-500 leading-relaxed max-w-lg">
          地圖是給你看的，Agent 會一邊回答一邊幫你把重點標出來。
        </p>

        {/* 左 2/3 地圖 · 右 1/3 chatbox */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 relative h-[380px] lg:h-[620px] rounded-3xl overflow-hidden border border-zinc-800/80">
            <AgentMap map={map} onSelectCounty={focusCounty} />
          </div>

          <div className="lg:col-span-1 h-[560px] lg:h-[620px] rounded-3xl overflow-hidden border border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md">
            <AgentChat
              messages={messages}
              busy={busy}
              county={map.focus}
              onSend={send}
              onReset={reset}
            />
          </div>
        </div>
      </div>

      {/* Agent 建議跳頁時的確認彈窗 */}
      <AgentNavigateDialog
        page={navPrompt}
        onConfirm={confirmNavigate}
        onDismiss={dismissNavigate}
      />
    </section>
  );
}