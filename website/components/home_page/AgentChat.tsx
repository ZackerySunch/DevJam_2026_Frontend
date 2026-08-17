// components/home_page/AgentChat.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '@/services/agent';

const SUGGESTIONS = [
  '你有什麼功能',
  '台北市有多少 5G 基地台',
  '目前海纜狀況正常嗎',
];

/** 後端回的是輕量 Markdown（**粗體** + 條列），這裡做最小程度的還原 */
function renderInline(line: string, keyBase: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={`${keyBase}-${i}`} className="font-medium text-zinc-50">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={`${keyBase}-${i}`}>{part}</span>
    )
  );
}

function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) =>
        line.trim() === '' ? (
          <span key={i} className="block h-2" />
        ) : (
          <span key={i} className="block">
            {renderInline(line, `l${i}`)}
          </span>
        )
      )}
    </>
  );
}

const timeOf = (at: number) =>
  new Date(at).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

interface Props {
  messages: ChatMessage[];
  busy: boolean;
  /** 目前地圖聚焦的縣市，只拿來顯示 */
  county: string | null;
  onSend: (text: string) => void;
  onReset?: () => void;
}

export default function AgentChat({
  messages,
  busy,
  county,
  onSend,
  onReset,
}: Props) {
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(120, ta.scrollHeight)}px`;
  }, [input]);

  const submit = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    onSend(text);
    setInput('');
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
        <div className="flex items-center gap-2">
          {county && (
            <span className="px-2 py-1 rounded-md text-[10px] text-emerald-300 border border-emerald-500/30 bg-emerald-500/10">
              {county}
            </span>
          )}
          {onReset && messages.length > 0 && (
            <button
              onClick={onReset}
              className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              清空
            </button>
          )}
        </div>
      </div>

      {/* 訊息 */}
      <div
        ref={listRef}
        className="agent-scroll flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3"
      >
        {messages.length === 0 && !busy && (
          <div className="h-full flex flex-col justify-end gap-3">
            <p className="text-sm text-zinc-500 leading-relaxed">
              問我關於網路流量的事。
              <br />
              我會直接操作左邊的地圖給你看。
            </p>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
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
                  : m.error
                  ? 'bg-red-950/40 text-red-200 border border-red-900/60 rounded-bl-md'
                  : 'bg-zinc-900/80 text-zinc-200 border border-zinc-800 rounded-bl-md'
              }`}
            >
              {m.role === 'agent' && !m.error ? (
                <RichText text={m.text} />
              ) : (
                m.text
              )}

              {/* Agent 這回合對 UI 做了什麼 */}
              {!!m.actions?.length && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.actions.map((a, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 rounded text-[9px] text-emerald-300/80 bg-emerald-500/10 border border-emerald-500/20"
                    >
                      {a.type}
                    </span>
                  ))}
                </div>
              )}

              <div
                className={`mt-1 text-[10px] tabular-nums ${
                  m.role === 'user' ? 'text-zinc-500' : 'text-zinc-600'
                }`}
              >
                {timeOf(m.at)}
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

      {/* 輸入 */}
      <div className="p-3 border-t border-zinc-800/80 shrink-0">
        <div className="flex items-end gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 focus-within:border-zinc-600 transition-colors">
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={county ? `詢問關於 ${county}...` : '輸入訊息...'}
            className="flex-1 resize-none bg-transparent text-[13px] text-zinc-200 placeholder:text-zinc-600 outline-none leading-relaxed py-1 max-h-[120px]"
          />
          <button
            onClick={() => submit()}
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