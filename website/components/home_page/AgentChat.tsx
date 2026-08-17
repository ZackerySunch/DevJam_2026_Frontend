// components/home_page/AgentChat.tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

/** 之後把這裡換成真的後端就好 */
const CHAT_ENDPOINT = '/api/agent/chat';

type Role = 'user' | 'agent';
type Message = { id: string; role: Role; text: string; time: string };

const SUGGESTIONS = [
  '現在全台流量最高的是哪裡？',
  '幫我看今天的異常鏈路',
  '這個縣市的上行狀況如何？',
];

const nowLabel = () =>
  new Date().toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

let seq = 0;
const mkId = () => `m${Date.now()}-${seq++}`;

async function ask(text: string, county: string | null): Promise<string> {
  try {
    const res = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, county }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return data.reply ?? data.message ?? '（後端沒有回內容）';
  } catch {
    // 後端還沒接上時的暫時回覆
    await new Promise((r) => setTimeout(r, 700));
    return county
      ? `收到。目前 Agent 還沒接上後端，等 ${CHAT_ENDPOINT} 上線後就會回答關於「${county}」的問題。`
      : `收到。目前 Agent 還沒接上後端，等 ${CHAT_ENDPOINT} 上線後就會正式回覆。`;
  }
}

interface Props {
  /** 從地圖選到的縣市，會變成提問的上下文 */
  county: string | null;
}

export default function AgentChat({ county }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // 有新訊息就捲到底
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  // 輸入框自動長高
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(120, ta.scrollHeight)}px`;
  }, [input]);

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || busy) return;

      setMessages((prev) => [
        ...prev,
        { id: mkId(), role: 'user', text, time: nowLabel() },
      ]);
      setInput('');
      setBusy(true);

      const reply = await ask(text, county);

      setMessages((prev) => [
        ...prev,
        { id: mkId(), role: 'agent', text: reply, time: nowLabel() },
      ]);
      setBusy(false);
    },
    [input, busy, county]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <style>{`
        @keyframes agentIn { from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:none;} }
        @keyframes agentDot { 0%,80%,100%{opacity:.25;} 40%{opacity:1;} }
        .agent-scroll{scrollbar-width:thin;scrollbar-color:#3f3f46 transparent;}
        .agent-scroll::-webkit-scrollbar{width:6px;}
        .agent-scroll::-webkit-scrollbar-thumb{background:#3f3f46;border-radius:3px;}
      `}</style>

      {/* 標頭 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm text-zinc-200 tracking-wide">HOLYPING Agent</span>
        </div>
        {county && (
          <span className="px-2 py-1 rounded-md text-[10px] text-emerald-300 border border-emerald-500/30 bg-emerald-500/10">
            {county}
          </span>
        )}
      </div>

      {/* 訊息列表 */}
      <div
        ref={listRef}
        className="agent-scroll flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3"
      >
        {messages.length === 0 && !busy && (
          <div className="h-full flex flex-col justify-end gap-3">
            <p className="text-sm text-zinc-500 leading-relaxed">
              問我關於網路流量的事。
              <br />
              也可以先在左邊地圖點一個縣市。
            </p>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-xs text-zinc-400 px-3 py-2 rounded-xl border border-zinc-800 hover:border-zinc-600 hover:text-zinc-200 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            style={{ animation: 'agentIn 220ms ease-out' }}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                m.role === 'user'
                  ? 'bg-zinc-200 text-zinc-900 rounded-br-md'
                  : 'bg-zinc-900/80 text-zinc-200 border border-zinc-800 rounded-bl-md'
              }`}
            >
              {m.text}
              <div
                className={`mt-1 text-[10px] tabular-nums ${
                  m.role === 'user' ? 'text-zinc-500' : 'text-zinc-600'
                }`}
              >
                {m.time}
              </div>
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-zinc-900/80 border border-zinc-800 flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-zinc-400"
                  style={{ animation: `agentDot 1.2s ${i * 0.16}s infinite` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 輸入區 */}
      <div className="p-3 border-t border-zinc-800/80 shrink-0">
        <div className="flex items-end gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 focus-within:border-zinc-600 transition-colors">
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={county ? `詢問關於 ${county}...` : '輸入訊息...'}
            className="flex-1 resize-none bg-transparent text-[13px] text-zinc-200 placeholder:text-zinc-600 outline-none leading-relaxed py-1 max-h-[120px]"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || busy}
            aria-label="送出"
            className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        <div className="mt-2 px-1 text-[10px] text-zinc-600">
          Enter 送出 · Shift + Enter 換行
        </div>
      </div>
    </div>
  );
}