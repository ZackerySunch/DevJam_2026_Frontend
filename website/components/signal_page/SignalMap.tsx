// components/signal_page/SignalMap.tsx
'use client';

import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import * as topojson from 'topojson-client';
import type { SignalSnapshot, SignalFlow } from '@/services/signal';

/* ------------------------------------------------------------------ */
/* 常數                                                                */
/* ------------------------------------------------------------------ */

const COUNTY_GEOJSON_URL = '/geo/twCounty2010.topo.json';

const MAX_ROUTES = 28;         // 同時存在的路線上限
const CURVE_SAMPLES = 48;      // 每條曲線取樣點數
const CURVATURE = 0.16;        // 弧度（0 = 直線）
const SPEED_DEG_PER_SEC = 1.5; // 線頭前進速度：每秒幾個「經緯度」
const MIN_GROW = 1.0;          // 伸完全程最快幾秒
const MAX_GROW = 3.2;          // 伸完全程最慢幾秒
const HOLD_RATIO = 0.28;       // 接通後停留多久（× 伸出時間）
const SHRINK_RATIO = 0.7;      // 收回時間（× 伸出時間）
const RING_LIFE = 0.85;        // 抵達漣漪存活秒數

const INITIAL_VIEW = {
  longitude: 120.982,
  latitude: 23.6,
  zoom: 6.8,
  pitch: 0,
  bearing: 0,
};

/* 資料量 1~5：綠 → 黃 → 橘。越大越粗、發得越勤 */
type Level = 1 | 2 | 3 | 4 | 5;

const LEVELS: Record<
  Level,
  {
    core: [number, number, number];
    width: number; // 線寬（px）
    head: number;  // 線頭亮點半徑（px）
    glow: number;  // 光暈半徑（px）
    gap: number;   // 收乾淨後休息幾秒
  }
> = {
  1: { core: [ 74, 222, 128], width: 1.2, head: 1.8, glow: 5.0,  gap: 1.60 },
  2: { core: [163, 230,  53], width: 2.0, head: 2.2, glow: 6.5,  gap: 1.25 },
  3: { core: [250, 204,  21], width: 3.0, head: 2.7, glow: 8.0,  gap: 0.95 },
  4: { core: [251, 146,  60], width: 4.2, head: 3.2, glow: 10.0, gap: 0.70 },
  5: { core: [249, 115,  22], width: 5.6, head: 3.8, glow: 12.0, gap: 0.45 },
};

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

const nowSec = () =>
  (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mod = (x: number, n: number) => ((x % n) + n) % n;

/** 出發快、進站慢 */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 2.2);
/** 收尾先慢後快，像被吸走 */
const easeIn = (t: number) => Math.pow(t, 1.9);

async function loadFeatureCollection(url: string) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.type === 'Topology') {
      const keys = Object.keys(json.objects ?? {});
      const features = keys.flatMap((k) => {
        const fc: any = topojson.feature(json, json.objects[k]);
        return fc.type === 'FeatureCollection' ? fc.features : [fc];
      });
      return { type: 'FeatureCollection', features };
    }
    return json;
  } catch {
    return null;
  }
}

/** 後端可能給 1~5，也可能給 0~100，統一收斂成 1~5 */
function toLevel(v: number): Level {
  if (!Number.isFinite(v)) return 1;
  const lv = v > 5 ? Math.round((v / 100) * 4) + 1 : Math.round(v);
  return Math.min(5, Math.max(1, lv)) as Level;
}

/**
 * 路線的身分證：用「起點座標 → 終點座標」，不是 flow.id。
 * 後端每秒重發、id 每次都換，但同一條路線的座標不變，
 * 動畫才不會每秒被砍掉重練。
 */
function routeKey(f: SignalFlow) {
  const [x1, y1] = f.source as [number, number];
  const [x2, y2] = f.target as [number, number];
  return `${x1.toFixed(3)},${y1.toFixed(3)}>${x2.toFixed(3)},${y2.toFixed(3)}`;
}

function hash01(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/* ------------------------------------------------------------------ */
/* 路線                                                                */
/* ------------------------------------------------------------------ */

type Route = {
  key: string;
  level: Level;
  path: [number, number][];
  cum: number[];
  total: number;
  grow: number;   // 線頭從起點伸到終點
  hold: number;   // 整條接通後停留
  shrink: number; // 線尾追上去、收乾淨
  cycle: number;  // grow + hold + shrink + gap
  pulse?: number; // 後端給的脈衝頻率（次/秒）
  bornAt: number; // 動畫起算時間（秒）
  dead: boolean;  // 後端已經沒有這條了，跑完這一輪就下線
  source: [number, number];
  target: [number, number];
};

function timing(level: Level, total: number, pulse?: number) {
  const grow = Math.min(MAX_GROW, Math.max(MIN_GROW, total / SPEED_DEG_PER_SEC));
  const hold = grow * HOLD_RATIO;
  const shrink = grow * SHRINK_RATIO;
  // 後端有給 pulse_frequency（次/秒）就照它的節奏，沒有就用等級預設
  const gap =
    pulse && pulse > 0
      ? Math.min(2.4, Math.max(0.25, 1.4 / pulse))
      : LEVELS[level].gap;
  return { grow, hold, shrink, cycle: grow + hold + shrink + gap };
}

function buildRoute(f: SignalFlow, t: number): Route {
  const key = routeKey(f);
  const [x1, y1] = f.source as [number, number];
  const [x2, y2] = f.target as [number, number];

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1e-6;

  // 控制點：中點往同一側推開 → 所有線彎法一致，畫面有秩序
  const cx = (x1 + x2) / 2 + (-dy / dist) * CURVATURE * dist;
  const cy = (y1 + y2) / 2 + (dx / dist) * CURVATURE * dist;

  const path: [number, number][] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const u = 1 - i / CURVE_SAMPLES;
    const v = i / CURVE_SAMPLES;
    path.push([
      u * u * x1 + 2 * u * v * cx + v * v * x2,
      u * u * y1 + 2 * u * v * cy + v * v * y2,
    ]);
  }

  const cum = [0];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    cum.push(total);
  }
  total = total || 1e-6;

  const level = toLevel(f.intensity);
  const tm = timing(level, total, f.pulse);

  return {
    key,
    level,
    path,
    cum,
    total,
    pulse: f.pulse,
    ...tm,
    // 錯開起跑點，避免整張圖同時開始
    bornAt: t - hash01(key) * tm.cycle,
    dead: false,
    source: [x1, y1],
    target: [x2, y2],
  };
}

/** 取路徑上 t（0~1）的位置 */
function sampleRoute(r: Route, t: number): [number, number] {
  const d = clamp01(t) * r.total;
  let lo = 0;
  let hi = r.cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (r.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = r.cum[hi] - r.cum[lo] || 1e-6;
  const k = (d - r.cum[lo]) / seg;
  const a = r.path[lo];
  const b = r.path[hi];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

/** 取 t0 → t1 這一段的折線，兩端精準內插，不會一格一格跳 */
function subPath(r: Route, t0: number, t1: number): [number, number][] {
  const a = clamp01(t0);
  const b = Math.max(a, clamp01(t1));
  const d0 = a * r.total;
  const d1 = b * r.total;

  const pts: [number, number][] = [sampleRoute(r, a)];
  for (let i = 0; i < r.cum.length; i++) {
    if (r.cum[i] > d0 && r.cum[i] < d1) pts.push(r.path[i]);
  }
  pts.push(sampleRoute(r, b));
  return pts;
}

/* ------------------------------------------------------------------ */
/* 每一幀                                                              */
/* ------------------------------------------------------------------ */

type Beam = {
  key: string;
  path: [number, number][];
  color: [number, number, number, number];
  width: number;
};
type Dot = {
  pos: [number, number];
  color: [number, number, number, number];
  radius: number;
};
type Ring = Dot & { lineWidth: number };

function buildFrame(routes: Route[], t: number) {
  const beams: Beam[] = [];
  const glows: Dot[] = [];
  const heads: Dot[] = [];
  const rings: Ring[] = [];
  const nodes: Dot[] = [];

  for (const r of routes) {
    const cfg = LEVELS[r.level];
    const [cr, cg, cb] = cfg.core;

    nodes.push({ pos: r.source, color: [cr, cg, cb, 110], radius: 1.6 });

    const tau = mod(t - r.bornAt, r.cycle);

    // 線頭抵達終點 → 盪一圈漣漪（線收完了圈圈還能繼續盪）
    const age = tau - r.grow;
    if (age >= 0 && age < RING_LIFE) {
      const q = age / RING_LIFE;
      rings.push({
        pos: r.target,
        color: [cr, cg, cb, Math.round(190 * (1 - q) * (1 - q))],
        radius: 3 + q * 18,
        lineWidth: 0.4 + 1.8 * (1 - q),
      });
    }

    // 一輪四段：伸長 → 停留 → 收回 → 休息
    let head: number;
    let tail: number;

    if (tau < r.grow) {
      head = easeOut(tau / r.grow); // 頭往前跑，尾巴留在起點
      tail = 0;
    } else if (tau < r.grow + r.hold) {
      head = 1;                     // 整條接通，停一下
      tail = 0;
    } else if (tau < r.grow + r.hold + r.shrink) {
      head = 1;                     // 頭停在終點，尾巴追上來
      tail = easeIn((tau - r.grow - r.hold) / r.shrink);
    } else {
      continue;                     // 休息中，這條線這一幀完全不畫
    }

    const span = head - tail;
    if (span < 1e-4) continue;

    const fade = Math.min(1, span / 0.08); // 收到剩一點點時淡出

    beams.push({
      key: r.key,
      path: subPath(r, tail, head),
      color: [cr, cg, cb, Math.round(225 * fade)],
      width: cfg.width,
    });

    const headPos = sampleRoute(r, head);
    glows.push({
      pos: headPos,
      color: [cr, cg, cb, Math.round(70 * fade)],
      radius: cfg.glow,
    });
    heads.push({
      pos: headPos,
      color: [
        Math.round(cr + (255 - cr) * 0.7),
        Math.round(cg + (255 - cg) * 0.7),
        Math.round(cb + (255 - cb) * 0.7),
        Math.round(240 * fade),
      ],
      radius: cfg.head,
    });
  }

  return { beams, glows, heads, rings, nodes };
}

/* ------------------------------------------------------------------ */
/* 元件                                                                */
/* ------------------------------------------------------------------ */

interface Props {
  snapshot: SignalSnapshot | null;
}

function SignalMapInner({ snapshot }: Props) {
  const [countyGeo, setCountyGeo] = useState<any>(null);
  const [viewState, setViewState] = useState(INITIAL_VIEW);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [clock, setClock] = useState(() => nowSec());
  const [reduced, setReduced] = useState(false);

  const registry = useRef<Map<string, Route>>(new Map());

  useEffect(() => {
    loadFeatureCollection(COUNTY_GEOJSON_URL).then((g) => g && setCountyGeo(g));
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /* ---- 輪詢進來的新資料：合併，不是整組重建 ---- */
  useEffect(() => {
    const flows = snapshot?.flows;
    if (!flows?.length) return;

    const t = nowSec();
    const top = [...flows]
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, MAX_ROUTES);

    const next = new Map<string, Route>();

    for (const f of top) {
      const key = routeKey(f);
      if (next.has(key)) continue;

      const prev = registry.current.get(key);
      const level = toLevel(f.intensity);

      if (!prev) {
        next.set(key, buildRoute(f, t)); // 新連線：現場長出來
      } else if (prev.level === level && prev.pulse === f.pulse && !prev.dead) {
        next.set(key, prev);             // 沒變：原封不動，動畫繼續跑
      } else {
        // 只換等級 / 節奏，保留原本的動畫進度，不要跳掉
        const tm = timing(level, prev.total, f.pulse);
        const ratio = mod(t - prev.bornAt, prev.cycle) / prev.cycle;
        next.set(key, {
          ...prev,
          level,
          pulse: f.pulse,
          ...tm,
          dead: false,
          bornAt: t - ratio * tm.cycle,
        });
      }
    }

    // 這次沒出現的：標記下線，讓它把目前這一輪跑完再消失
    for (const [key, r] of registry.current) {
      if (next.has(key)) continue;
      const tau = mod(t - r.bornAt, r.cycle);
      const drawing = tau < r.grow + r.hold + r.shrink;
      if (drawing && !r.dead) next.set(key, { ...r, dead: true });
    }

    registry.current = next;

    const arr = Array.from(next.values());
    setRoutes((prev) =>
      prev.length === arr.length && prev.every((r, i) => r === arr[i]) ? prev : arr
    );
  }, [snapshot]);

  /* ---- 動畫時鐘 ---- */
  useEffect(() => {
    if (reduced || routes.length === 0) return;

    let raf = 0;
    const loop = () => {
      setClock(nowSec());
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else start();
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduced, routes.length]);

  const frame = useMemo(() => {
    if (reduced) {
      // 靜態模式：直接畫成接通的樣子
      return buildFrame(
        routes.map((r) => ({ ...r, bornAt: -r.grow })),
        0
      );
    }
    return buildFrame(routes, clock);
  }, [routes, clock, reduced]);

  const onViewStateChange = useCallback(({ viewState: vs }: any) => {
    setViewState((prev) =>
      prev.longitude === vs.longitude &&
      prev.latitude === vs.latitude &&
      prev.zoom === vs.zoom
        ? prev
        : {
            longitude: vs.longitude,
            latitude: vs.latitude,
            zoom: vs.zoom,
            pitch: 0,
            bearing: 0,
          }
    );
  }, []);

  const countyLayer = useMemo(() => {
    if (!countyGeo) return null;
    return new GeoJsonLayer({
      id: 'taiwan-flat',
      data: countyGeo,
      pickable: false,
      stroked: true,
      filled: true,
      extruded: false,
      lineWidthMinPixels: 1,
      getLineColor: [70, 140, 200, 110],
      getFillColor: [10, 16, 28, 200],
      getLineWidth: 1,
    });
  }, [countyGeo]);

  const layers = useMemo(() => {
    const list: any[] = [];
    if (countyLayer) list.push(countyLayer);

    // 1. 靜態航線（很淡，只是說明這裡有通道）
    list.push(
      new PathLayer<Route>({
        id: 'signal-routes',
        data: routes,
        pickable: false,
        widthUnits: 'pixels',
        widthMinPixels: 0.5,
        widthMaxPixels: 3,
        capRounded: true,
        jointRounded: true,
        getPath: (d) => d.path,
        getWidth: (d) => LEVELS[d.level].width * 0.35,
        getColor: (d) => {
          const c = LEVELS[d.level].core;
          return [c[0], c[1], c[2], 30];
        },
        updateTriggers: { getWidth: routes, getColor: routes },
      })
    );

    // 2. 起點節點
    list.push(
      new ScatterplotLayer<Dot>({
        id: 'signal-nodes',
        data: frame.nodes,
        pickable: false,
        stroked: false,
        filled: true,
        radiusUnits: 'pixels',
        getPosition: (d) => d.pos,
        getRadius: (d) => d.radius,
        getFillColor: (d) => d.color,
      })
    );

    // 3. 主角：伸長 → 停留 → 收回 的那條線
    list.push(
      new PathLayer<Beam>({
        id: 'signal-beams',
        data: frame.beams,
        pickable: false,
        widthUnits: 'pixels',
        widthMinPixels: 1,
        widthMaxPixels: 9,
        capRounded: true,
        jointRounded: true,
        getPath: (d) => d.path,
        getWidth: (d) => d.width,
        getColor: (d) => d.color,
      })
    );

    // 4. 線頭光暈
    list.push(
      new ScatterplotLayer<Dot>({
        id: 'signal-glow',
        data: frame.glows,
        pickable: false,
        stroked: false,
        filled: true,
        radiusUnits: 'pixels',
        getPosition: (d) => d.pos,
        getRadius: (d) => d.radius,
        getFillColor: (d) => d.color,
      })
    );

    // 5. 線頭亮點
    list.push(
      new ScatterplotLayer<Dot>({
        id: 'signal-head',
        data: frame.heads,
        pickable: false,
        stroked: false,
        filled: true,
        radiusUnits: 'pixels',
        getPosition: (d) => d.pos,
        getRadius: (d) => d.radius,
        getFillColor: (d) => d.color,
      })
    );

    // 6. 抵達漣漪
    list.push(
      new ScatterplotLayer<Ring>({
        id: 'signal-arrival',
        data: frame.rings,
        pickable: false,
        stroked: true,
        filled: false,
        radiusUnits: 'pixels',
        lineWidthUnits: 'pixels',
        getPosition: (d) => d.pos,
        getRadius: (d) => d.radius,
        getLineColor: (d) => d.color,
        getLineWidth: (d) => d.lineWidth,
      })
    );

    return list;
  }, [countyLayer, routes, frame]);

  return (
    <div className="absolute inset-0 bg-[#020202]">
      <DeckGL
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        controller={{
          dragPan: true,
          dragRotate: false,
          scrollZoom: true,
          touchZoom: true,
          touchRotate: false,
          doubleClickZoom: false,
          keyboard: false,
        }}
        layers={layers}
        useDevicePixels={1}
        pickingRadius={0}
      />
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_180px_rgba(0,0,0,0.85)] z-10" />
    </div>
  );
}

export default memo(SignalMapInner);