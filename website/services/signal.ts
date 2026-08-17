// services/signal.ts

/* ------------------------------------------------------------------ */
/* 設定                                                                */
/* ------------------------------------------------------------------ */

/**
 * 後端位置。
 * 開發時直接打 localhost:8001；正式環境用 .env.local 覆蓋：
 *   NEXT_PUBLIC_SIGNAL_API=https://api.holyping.com
 * 若改用 next.config 的 rewrites 走同源代理，設成空字串即可。
 */
const API_BASE = process.env.NEXT_PUBLIC_SIGNAL_API ?? 'http://localhost:8001';
const FLOWS_PATH = '/api/signal/traffic_flows';

/** 全台骨幹 = -1 */
export const ALL_COUNTIES = -1;

const REQUEST_TIMEOUT_MS = 8000;

/* ------------------------------------------------------------------ */
/* 型別                                                                */
/* ------------------------------------------------------------------ */

/** 後端原始格式 */
export interface RawTrafficFlow {
  id: string;
  type?: string;
  from_name: string;
  from_lat: number;
  from_lng: number;
  to_name: string;
  to_lat: number;
  to_lng: number;
  traffic_mbps?: number;
  bandwidth_mbps?: number;
  load_percentage?: number;
  status?: 'normal' | 'busy' | 'congested' | 'down' | string;
  pulse_frequency?: number;
  latency_ms?: number;
}

/** 前端用格式：單一流量 起點 → 終點 */
export interface SignalFlow {
  id: string;
  /** [lng, lat] */
  source: [number, number];
  /** [lng, lat] */
  target: [number, number];
  /** 負載 1 ~ 100（地圖會再收斂成 1~5 檔） */
  intensity: number;
  sourceCounty: string;
  targetCounty: string;
  /** 後端建議的脈衝頻率（次/秒），地圖用來決定發送間隔 */
  pulse?: number;
  status?: string;
  trafficMbps?: number;
  latencyMs?: number;
  fromName?: string;
  toName?: string;
}

/** 縣市即時彙總 */
export interface CountyTraffic {
  county: string;
  inbound: number;
  outbound: number;
  total: number;
}

export interface SignalSnapshot {
  timestamp: number;
  flows: SignalFlow[];
  byCounty: CountyTraffic[];
}

/* ------------------------------------------------------------------ */
/* 縣市座標（與 Navigator 對齊，index 0-21 對應後端的 county 參數）    */
/* ------------------------------------------------------------------ */

export const COUNTY_COORDS: Record<string, [number, number]> = {
  基隆市: [121.7419, 25.1276],
  台北市: [121.5654, 25.033],
  新北市: [121.4654, 25.0112],
  桃園市: [121.3009, 24.9936],
  新竹市: [120.9675, 24.8138],
  新竹縣: [121.0177, 24.8282],
  苗栗縣: [120.8161, 24.5602],
  台中市: [120.6736, 24.1477],
  彰化縣: [120.544, 24.0777],
  南投縣: [120.9719, 23.9037],
  雲林縣: [120.4313, 23.7092],
  嘉義市: [120.4491, 23.4801],
  嘉義縣: [120.3255, 23.4518],
  台南市: [120.1838, 22.9997],
  高雄市: [120.312, 22.6208],
  屏東縣: [120.488, 22.673],
  宜蘭縣: [121.7536, 24.757],
  花蓮縣: [121.6068, 23.9872],
  台東縣: [121.1444, 22.7583],
  澎湖縣: [119.5664, 23.5673],
  金門縣: [118.3171, 24.4327],
  連江縣: [119.9363, 26.1505],
};

export const COUNTIES = Object.keys(COUNTY_COORDS);

/** 縣市名 → 後端要的 index */
export function countyIndex(name: string): number {
  const i = COUNTIES.indexOf(normalize(name));
  return i < 0 ? ALL_COUNTIES : i;
}

/* ------------------------------------------------------------------ */
/* 轉換工具                                                            */
/* ------------------------------------------------------------------ */

/** 後端可能寫「臺北市」，我們的表是「台北市」 */
const normalize = (s: string) => s.replace(/臺/g, '台');

/** 先用名稱比對，比不到就用座標找最近的縣市 */
function resolveCounty(name: string, lng: number, lat: number): string {
  const n = normalize(name ?? '');
  for (const c of COUNTIES) {
    if (n.includes(c)) return c;
  }
  let best = COUNTIES[0];
  let bestD = Infinity;
  for (const c of COUNTIES) {
    const [cx, cy] = COUNTY_COORDS[c];
    const d = (cx - lng) ** 2 + (cy - lat) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** 負載 → 1~100。優先用 load_percentage，其次自己算 */
function toIntensity(raw: RawTrafficFlow): number {
  let v = raw.load_percentage;
  if (!Number.isFinite(v as number)) {
    const t = raw.traffic_mbps ?? 0;
    const b = raw.bandwidth_mbps ?? 0;
    v = b > 0 ? (t / b) * 100 : 50;
  }
  return Math.min(100, Math.max(1, Math.round(v as number)));
}

function toSignalFlow(raw: RawTrafficFlow): SignalFlow | null {
  const { from_lat, from_lng, to_lat, to_lng } = raw;
  if (
    !Number.isFinite(from_lat) ||
    !Number.isFinite(from_lng) ||
    !Number.isFinite(to_lat) ||
    !Number.isFinite(to_lng)
  ) {
    return null; // 座標壞掉的直接丟掉，不要讓地圖畫出鬼線
  }

  return {
    id: raw.id,
    source: [from_lng, from_lat],
    target: [to_lng, to_lat],
    intensity: toIntensity(raw),
    sourceCounty: resolveCounty(raw.from_name, from_lng, from_lat),
    targetCounty: resolveCounty(raw.to_name, to_lng, to_lat),
    pulse: Number.isFinite(raw.pulse_frequency as number)
      ? (raw.pulse_frequency as number)
      : undefined,
    status: raw.status,
    trafficMbps: raw.traffic_mbps,
    latencyMs: raw.latency_ms,
    fromName: raw.from_name,
    toName: raw.to_name,
  };
}

function aggregate(flows: SignalFlow[]): CountyTraffic[] {
  const agg = new Map<string, { inbound: number; outbound: number }>();
  for (const c of COUNTIES) agg.set(c, { inbound: 0, outbound: 0 });

  for (const f of flows) {
    const w = Math.round(f.trafficMbps ?? f.intensity);
    agg.get(f.sourceCounty)!.outbound += w;
    agg.get(f.targetCounty)!.inbound += w;
  }

  return COUNTIES.map((county) => {
    const { inbound, outbound } = agg.get(county)!;
    return { county, inbound, outbound, total: inbound + outbound };
  }).sort((a, b) => b.total - a.total);
}

/* ------------------------------------------------------------------ */
/* 主要 API                                                            */
/* ------------------------------------------------------------------ */

/**
 * 取得即時流向。
 * @param county 縣市 index 0-21，省略或 -1 = 全台骨幹
 * @param signal 外部 AbortSignal（元件卸載時中斷用）
 */
export async function fetchSignalSnapshot(
  county: number = ALL_COUNTIES,
  signal?: AbortSignal
): Promise<SignalSnapshot> {
  const url = `${API_BASE}${FLOWS_PATH}?county=${county}`;

  // 自己的逾時 + 外部的取消，兩個都要能中斷
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });

    if (!res.ok) {
      throw new Error(`Signal API ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    // 後端直接回陣列；若之後包成 { data: [...] } 也接得住
    const rawList: RawTrafficFlow[] = Array.isArray(json)
      ? json
      : Array.isArray(json?.data)
      ? json.data
      : [];

    const flows = rawList
      .map(toSignalFlow)
      .filter((f): f is SignalFlow => f !== null);

    return {
      timestamp: Date.now(),
      flows,
      byCounty: aggregate(flows),
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}