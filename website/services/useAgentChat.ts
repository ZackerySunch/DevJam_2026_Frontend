// services/useAgentChat.ts
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  sendMessage,
  applyActions,
  normalizeCounty,
  INITIAL_MAP_STATE,
  type ChatMessage,
  type MapState,
  type AgentAction,
  type SitePage,
} from './agent';

let seq = 0;
const mkId = () => `m${Date.now()}-${seq++}`;

/**
 * 對話狀態 + 地圖狀態的唯一入口。
 * component 只要 useAgentChat()，不需要知道 fetch 長什麼樣子。
 */
export function useAgentChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [map, setMap] = useState<MapState>(INITIAL_MAP_STATE);
  const [busy, setBusy] = useState(false);
  /** Agent 建議前往的頁面，有值時 UI 會跳確認彈窗 */
  const [navPrompt, setNavPrompt] = useState<SitePage | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  // send 要拿到最新的 focus，但不想把 map 塞進 deps
  const mapFocusRef = useRef<string | null>(null);
  mapFocusRef.current = map.focus;

  useEffect(() => () => abortRef.current?.abort(), []);

  /** 送一句話給 Agent */
  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const history = messagesRef.current;
    setMessages((prev) => [
      ...prev,
      { id: mkId(), role: 'user', text, at: Date.now() },
    ]);
    setBusy(true);

    try {
      const reply = await sendMessage(text, {
        county: mapFocusRef.current,
        history,
        signal: ctrl.signal,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: mkId(),
          role: 'agent',
          text: reply.text,
          at: Date.now(),
          actions: reply.actions,
        },
      ]);

      if (reply.actions.length) {
        setMap((prev) => applyActions(prev, reply.actions));

        // 導頁建議不改地圖狀態，改成彈窗問使用者
        const nav = reply.actions.find((a) => a.type === 'ui.navigate');
        if (nav && nav.type === 'ui.navigate') {
          setNavPrompt({ href: nav.href, label: nav.label });
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setMessages((prev) => [
        ...prev,
        {
          id: mkId(),
          role: 'agent',
          text: e?.message ?? '連線失敗',
          at: Date.now(),
          error: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, []);

  /** 使用者自己在地圖上點的，走同一條路，Agent 之後才看得到一樣的狀態 */
  const focusCounty = useCallback((county: string | null) => {
    setMap((prev) =>
      county
        ? applyActions(prev, [{ type: 'map.focus', county: normalizeCounty(county) }])
        : applyActions(prev, [{ type: 'map.clear' }])
    );
  }, []);

  /** 之後 AI 之外的地方也可以直接下指令（例如某個按鈕） */
  const dispatchActions = useCallback((actions: AgentAction[]) => {
    setMap((prev) => applyActions(prev, actions));
  }, []);

  /** 使用者按「前往」 */
  const confirmNavigate = useCallback(() => {
    const target = navPrompt;
    setNavPrompt(null);
    if (target) router.push(target.href);
  }, [navPrompt, router]);

  /** 使用者按「留在這裡」 */
  const dismissNavigate = useCallback(() => setNavPrompt(null), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setMap(INITIAL_MAP_STATE);
    setNavPrompt(null);
    setBusy(false);
  }, []);

  return {
    messages,
    map,
    busy,
    send,
    focusCounty,
    dispatchActions,
    reset,
    navPrompt,
    confirmNavigate,
    dismissNavigate,
  };
}