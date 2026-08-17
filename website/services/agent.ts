// services/agent.ts
//
// Agent 的大腦與嘴巴都放這裡，component 只負責畫。
// 重點：Agent 回來的東西有兩部分 —— 給人看的 text，跟給 UI 執行的 actions。

import { COUNTY_COORDS } from './signal';

/* ------------------------------------------------------------------ */
/* 設定                                                                */
/* ------------------------------------------------------------------ */

const API_BASE =
  process.env.NEXT_PUBLIC_AGENT_API ?? 'http://localhost:8001';
const CHAT_PATH = '/api/agent/chat';
const REQUEST_TIMEOUT_MS = 60000; // LLM 回得慢，給它久一點

/* ------------------------------------------------------------------ */
/* 對話                                                                */
/* ------------------------------------------------------------------ */

export type ChatRole = 'user' | 'agent';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** epoch ms */
  at: number;
  /** 這則回覆順便做了哪些 UI 動作，之後可以在氣泡下方顯示 */
  actions?: AgentAction[];
  error?: boolean;
}

/* ------------------------------------------------------------------ */
/* UI 指令協定：AI 能對地圖做的事                                       */
/* ------------------------------------------------------------------ */

export type HighlightTone = 'accent' | 'info' | 'warn' | 'danger';

export type AgentAction =
  /** 選定某個縣市（等同使用者點擊） */
  | { type: 'map.focus'; county: string }
  /** 幫一批縣市上色 */
  | { type: 'map.highlight'; counties: string[]; tone?: HighlightTone; note?: string }
  /** 丟一組點上去 */
  | { type: 'map.markers'; points: MapMarker[] }
  /** 鏡頭移動 */
  | { type: 'map.flyTo'; longitude: number; latitude: number; zoom?: number }
  /** 清空所有標記與高亮 */
  | { type: 'map.clear' }
  /** 建議使用者前往某個頁面，UI 會跳確認彈窗 */
  | { type: 'ui.navigate'; href: string; label: string };

export interface MapMarker {
  id?: string;
  name: string;
  longitude: number;
  latitude: number;
  /** 1~5，決定大小與顏色 */
  level?: number;
  tone?: HighlightTone;
}

export interface AgentReply {
  text: string;
  actions: AgentAction[];
}

/* ------------------------------------------------------------------ */
/* 地圖狀態：唯一真相                                                   */
/* ------------------------------------------------------------------ */

export interface MapView {
  longitude: number;
  latitude: number;
  zoom: number;
  /** 每次要求移動就 +1，讓地圖知道這是一次新的鏡頭指令 */
  nonce: number;
}

export interface MapState {
  focus: string | null;
  highlights: Record<string, HighlightTone>;
  markers: MapMarker[];
  view: MapView;
  note: string | null;
}

export const INITIAL_MAP_STATE: MapState = {
  focus: null,
  highlights: {},
  markers: [],
  view: { longitude: 120.982, latitude: 23.75, zoom: 6.6, nonce: 0 },
  note: null,
};

/** 後端可能寫「臺北市」，我們的表是「台北市」 */
export const normalizeCounty = (s: string) => (s ?? '').replace(/臺/g, '台').trim();

/** 把一串 action 套用到地圖狀態上。純函式，好測試也好重播。 */
export function applyActions(state: MapState, actions: AgentAction[]): MapState {
  let next = state;

  for (const a of actions) {
    switch (a.type) {
      case 'map.focus': {
        const county = normalizeCounty(a.county);
        const coord = COUNTY_COORDS[county];
        next = {
          ...next,
          focus: county,
          view: coord
            ? {
                longitude: coord[0],
                latitude: coord[1],
                zoom: 8.2,
                nonce: next.view.nonce + 1,
              }
            : next.view,
        };
        break;
      }

      case 'map.highlight': {
        const tone = a.tone ?? 'accent';
        const add: Record<string, HighlightTone> = {};
        for (const c of a.counties ?? []) add[normalizeCounty(c)] = tone;
        next = {
          ...next,
          highlights: { ...next.highlights, ...add },
          note: a.note ?? next.note,
        };
        break;
      }

      case 'map.markers': {
        const points = (a.points ?? []).filter(
          (p) => Number.isFinite(p.longitude) && Number.isFinite(p.latitude)
        );
        next = { ...next, markers: points };
        break;
      }

      case 'map.flyTo': {
        if (!Number.isFinite(a.longitude) || !Number.isFinite(a.latitude)) break;
        next = {
          ...next,
          view: {
            longitude: a.longitude,
            latitude: a.latitude,
            zoom: a.zoom ?? 8,
            nonce: next.view.nonce + 1,
          },
        };
        break;
      }

      case 'map.clear': {
        next = {
          ...next,
          focus: null,
          highlights: {},
          markers: [],
          note: null,
          view: { ...INITIAL_MAP_STATE.view, nonce: next.view.nonce + 1 },
        };
        break;
      }
    }
  }

  return next;
}

/** 擋掉後端亂回的東西，只留看得懂的指令 */
function sanitizeActions(raw: any): AgentAction[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set([
    'map.focus',
    'map.highlight',
    'map.markers',
    'map.flyTo',
    'map.clear',
    'ui.navigate',
  ]);
  return raw.filter((a) => a && typeof a.type === 'string' && known.has(a.type));
}

/* ------------------------------------------------------------------ */
/* 傳輸                                                                */
/* ------------------------------------------------------------------ */

export interface SendOptions {
  /** 目前地圖聚焦的縣市，之後後端支援上下文時可以帶上 */
  county?: string | null;
  /** 前幾輪對話，同上 */
  history?: ChatMessage[];
  signal?: AbortSignal;
}

/**
 * 後端合約（目前）：
 *   POST /api/agent/chat   { "query": "你有什麼功能" }
 *   →                      { "answer": "..." }
 *
 * 後端只回文字、不回 UI 指令，所以 actions 由前端從問答內容推導。
 * 等後端開始回 actions 時，下面那行 sanitizeActions 就會自動接手。
 */
export async function sendMessage(
  text: string,
  opts: SendOptions = {}
): Promise<AgentReply> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetch(`${API_BASE}${CHAT_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({ query: text }),
    });

    if (!res.ok) {
      throw new Error(`Agent API ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    // answer 可能是字串（舊版），也可能是 { message, data:{ push } }（新版）
    const answer = data.answer ?? data;
    const message: string =
      typeof answer === 'string'
        ? answer
        : answer?.message ?? answer?.reply ?? answer?.text ?? '';

    if (!message) throw new Error('後端沒有回 answer.message');

    const actions: AgentAction[] = Array.isArray(data.actions)
      ? sanitizeActions(data.actions)
      : deriveActions(text, message);

    // data.push 有指到單一頁面時，追加一個導頁建議
    const page = extractPushPage(answer?.data?.push);
    if (page) {
      actions.push({ type: 'ui.navigate', href: page.href, label: page.label });
    }

    return { text: message, actions };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

/* ------------------------------------------------------------------ */
/* 站內頁面：後端 push 進來的路徑對照表                                */
/* ------------------------------------------------------------------ */

export interface SitePage {
  href: string;
  label: string;
}

export const SITE_PAGES: Record<string, SitePage> = {
  '/signal': { href: '/signal', label: '即時網路流量監控' },
  '/uplink': { href: '/uplink', label: '跨國海纜狀態查詢' },
  '/navigator': { href: '/navigator', label: '公用 Wi-Fi 位址與統計' },
  '/density': { href: '/density', label: '基地台數量統計' },
};

/** 後端偶爾會拼錯，一併收進來 */
const ROUTE_ALIAS: Record<string, string> = {
  '/nvigator': '/navigator',
  '/navigater': '/navigator',
};

const ROUTE_RE = /\/(signal|uplink|navigator|nvigator|navigater|density)\b/gi;

/**
 * 從 push 字串抓出頁面。
 * 只有「剛好一個」才回傳 —— 後端有時會把四個頁面全列出來當說明，
 * 那是選單不是建議，不該彈窗打擾使用者。
 */
export function extractPushPage(push: unknown): SitePage | null {
  if (typeof push !== 'string' || !push.trim()) return null;

  const found = new Set<string>();
  for (const m of push.matchAll(ROUTE_RE)) {
    const raw = `/${m[1].toLowerCase()}`;
    found.add(ROUTE_ALIAS[raw] ?? raw);
  }

  if (found.size !== 1) return null;
  return SITE_PAGES[[...found][0]] ?? null;
}

/* ------------------------------------------------------------------ */
/* 從問答內容推導 UI 指令                                              */
/* ------------------------------------------------------------------ */

const COUNTY_NAMES = Object.keys(COUNTY_COORDS);

/** 取第一句當地圖上的說明 */
function firstSentence(text: string, max = 42): string {
  const line = text
    .replace(/\*\*/g, '')
    .split(/[\n。！？!?]/)
    .map((s) => s.trim())
    .find((s) => s.length > 0);
  if (!line) return '';
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

/** 問句 + 回答裡提到哪些縣市，就把它們標到地圖上 */
export function deriveActions(query: string, answer: string): AgentAction[] {
  const q = normalizeCounty(query);
  const all = normalizeCounty(`${query} ${answer}`);

  if (/清除|清空|重設|重置|reset|clear/i.test(q)) {
    return [{ type: 'map.clear' }];
  }

  // 只比對全名，避免「台中」誤中「台中市」以外的東西
  const hits = COUNTY_NAMES.filter((c) => all.includes(c));
  if (hits.length === 0) return [];

  const tone: HighlightTone = /斷|中斷|異常|故障|壅塞|警告|down|error/i.test(answer)
    ? 'warn'
    : 'accent';

  const note = firstSentence(answer);

  if (hits.length === 1) {
    return [
      { type: 'map.focus', county: hits[0] },
      { type: 'map.highlight', counties: hits, tone, note },
    ];
  }

  return [
    {
      type: 'map.highlight',
      counties: hits,
      tone,
      note: note || `提到 ${hits.length} 個縣市`,
    },
  ];
}