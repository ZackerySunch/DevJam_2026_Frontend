// components/home_page/AgentNavigateDialog.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import type { SitePage } from '@/services/agent';

interface Props {
  page: SitePage | null;
  onConfirm: () => void;
  onDismiss: () => void;
}

export default function AgentNavigateDialog({
  page,
  onConfirm,
  onDismiss,
}: Props) {
  const [visible, setVisible] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // 控制延遲顯示：收到 page 之後，等 2.5 秒才彈出
  useEffect(() => {
    if (!page) {
      setVisible(false);
      return;
    }
    
    // 延遲時間可依需求調整 (2500 = 2.5秒)
    const timer = setTimeout(() => {
      setVisible(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, [page]);

  // Esc 關閉支援
  useEffect(() => {
    if (!visible) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onDismiss]);

  // 如果沒有觸發導航，或還沒到顯示時間，就不渲染
  if (!page || !visible) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-full max-w-[280px]"
      role="dialog"
      aria-modal="false" // 改為 false，因為我們不阻擋使用者操作其他東西
      aria-label="前往頁面建議"
    >
      <style>{`
        @keyframes widgetSlideIn { 
          from { opacity: 0; transform: translateY(16px) scale(0.96); } 
          to { opacity: 1; transform: none; } 
        }
      `}</style>

      {/* 小尺寸 Widget 卡片 */}
      <div
        className="relative rounded-2xl border border-zinc-800 bg-zinc-900/95 p-5 shadow-2xl backdrop-blur-md"
        style={{ animation: 'widgetSlideIn 350ms cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* 右上角打叉關閉按鈕 */}
        <button
          onClick={onDismiss}
          className="absolute top-3.5 right-3.5 text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label="關閉建議"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">
            Agent 建議
          </span>
        </div>

        <h3 className="mt-3 text-sm font-medium text-zinc-100 leading-snug">
          前往「{page.label}」？
        </h3>

        <p className="mt-1.5 text-[11px] text-zinc-500 leading-relaxed">
          這頁有你剛剛問的完整資料與圖表。
        </p>

        <div className="mt-4 flex gap-2">
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="flex-1 px-3 py-2 rounded-xl text-xs text-emerald-200 bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
          >
            前往查看
          </button>
          <button
            onClick={onDismiss}
            className="px-3 py-2 rounded-xl text-xs text-zinc-400 border border-zinc-800 hover:text-zinc-200 hover:border-zinc-700 transition-colors"
          >
            先不要
          </button>
        </div>
      </div>
    </div>
  );
}