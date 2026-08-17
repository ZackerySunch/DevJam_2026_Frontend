// components/density_page/DensityMap.tsx
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { NetGeneration } from '@/services/density';
import * as topojson from 'topojson-client';

// 🌟 根據 API 文件，建立 縣市中文 -> Index 數字 的 Mapping
const COUNTY_MAPPING: Record<string, string> = {
  "南投縣": "0", "南投": "0",
  "嘉義市": "1", "嘉義": "1",
  "嘉義縣": "2",
  "基隆市": "3", "基隆": "3",
  "宜蘭縣": "4", "宜蘭": "4",
  "屏東縣": "5", "屏東": "5",
  "彰化縣": "6", "彰化": "6",
  "新北市": "7", "新北": "7", "臺北縣": "7", "台北縣": "7",
  "新竹市": "8", "新竹": "8",
  "新竹縣": "9",
  "桃園市": "10", "桃園": "10", "桃園縣": "10",
  "澎湖縣": "11", "澎湖": "11",
  "臺中市": "12", "台中市": "12", "臺中": "12", "台中": "12", "臺中縣": "12", "台中縣": "12",
  "臺北市": "13", "台北市": "13", "臺北": "13", "台北": "13",
  "臺南市": "14", "台南市": "14", "臺南": "14", "台南": "14", "臺南縣": "14", "台南縣": "14",
  "臺東縣": "15", "台東縣": "15", "臺東": "15", "台東": "15",
  "花蓮縣": "16", "花蓮": "16",
  "苗栗縣": "17", "苗栗": "17",
  "連江縣": "18", "連江": "18", "馬祖": "18",
  "金門縣": "19", "金門": "19",
  "雲林縣": "20", "雲林": "20",
  "高雄市": "21", "高雄": "21", "高雄縣": "21",
};

// 🌟 強大取值器：處理 API 的資料
const getCityDataValue = (geoName: string, mapData: Record<string, any>, generation: string) => {
  if (!mapData || !geoName) return 0;

  const dataKey = COUNTY_MAPPING[geoName];
  if (!dataKey || !mapData[dataKey]) return 0;

  const cityData = mapData[dataKey];
  const val = generation === '5G' ? Number(cityData[0]) : Number(cityData[1]);
  return isNaN(val) ? 0 : val;
};

/* ==================================================================
 * 規則常數
 * ================================================================== */

/** 只有「> 1」的資料才會進入 status（紅→藍）配色與高度映射 */
const STATUS_THRESHOLD = 1;

/** 基準柱高（100% = MAX_HEIGHT） */
const MAX_HEIGHT = 120;

/** Default 型態（資料 0 或 <= 1）的高度：1% */
const DEFAULT_HEIGHT = MAX_HEIGHT * 0.01;

/** Default 型態的顏色：極暗的石墨色 */
const DEFAULT_FILL: [number, number, number, number] = [26, 26, 34, 225];

/** 尚未初始化：整座台灣都是「淡淡的白光」＋ 1% 高度 */
const INTRO_HEIGHT = MAX_HEIGHT * 0.01;
const INTRO_FILL: [number, number, number, number] = [232, 240, 255, 70];
const INTRO_LINE: [number, number, number, number] = [255, 255, 255, 150];

/** 最終視角 */
const FINAL_VIEW_STATE = { longitude: 120.982, latitude: 23.9738, zoom: 7.2, pitch: 55, bearing: -10 };
const INTRO_VIEW_STATE = { longitude: 120.982, latitude: 23.9738, zoom: 4.6, pitch: 78, bearing: -60 };
const INTRO_DELAY = 400;
const INTRO_DURATION = 2800;
/** 鏡頭到位後，再等一下才「長出」資料，讓白光有一個呼吸的瞬間 */
const REVEAL_DELAY = 260;

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }

// 🌟 高級霧面消光材質
const MATTE_MATERIAL = {
  ambient: 0.75,
  diffuse: 0.6,
  shininess: 10,
  // deck.gl 要的是「剛好 3 個數字」的 tuple，寫 number[] 會被擋
  specularColor: [30, 30, 30] as [number, number, number],
};

/* ==================================================================
 * 背景：海（漂流量子點）＋ 海浪（排成一列、更快、越跑越淡）
 *
 * 兩層都是 deck.gl 的 3D 圖層，座標是經緯度，
 * 所以鏡頭轉／傾斜／縮放時，它們跟台灣一起動，像同一片海。
 * ================================================================== */

/** 共用：所有點都一樣大、一樣白 */
const DOT_RADIUS_PX = 1.6;

/** 共用：漂流方向（單位向量，經度 / 緯度）。海與海浪同一個方向 */
const DRIFT = (() => {
  const x = 0.90;
  const y = 0.44;
  const len = Math.hypot(x, y);
  return { x: x / len, y: y / len };
})();
/** 垂直於漂流方向 → 海浪的排列軸 */
const CREST_AXIS = { x: -DRIFT.y, y: DRIFT.x };

/* ---------------- 海：低密度、鋪滿整個畫面 ---------------- */

/** 鋪得比可視範圍大很多，pitch 55 看到很遠也不會露出邊界 */
const SEA_BOUNDS = { minLng: 110, maxLng: 132, minLat: 12, maxLat: 36 };
/** 取樣間距（度）。愈大愈稀疏 */
const SEA_STEP = 0.34;
/** 只留這個比例的點，看起來才不像格線 */
const SEA_KEEP = 0.42;
/** 漂流速度（度／秒）。很慢，像洋流 */
const SEA_SPEED = 0.045;
/** 海的亮度範圍（0-255），刻意壓很低 */
const SEA_ALPHA_MIN = 38;
const SEA_ALPHA_MAX = 104;
/** 海面極輕微的上下呼吸（公尺） */
const SEA_BOB = 240;

/* ---------------- 海浪：一整排、比海快、越跑越淡 ---------------- */

/** 同時存在幾道浪 */
const CREST_COUNT = 4;
/** 一排裡點的間距（度） */
const CREST_DOT_STEP = 0.11;
/** 一排的半長（度）。要夠長才能橫跨畫面 */
const CREST_HALF_LEN = 7.2;
/** 一排裡只留這個比例的點 → 是「一列點」不是實線 */
const CREST_KEEP = 0.78;
/** 浪的行進速度（度／秒）。約為海的 9 倍 */
const CREST_SPEED = 0.42;
/** 一道浪從出生到消散要走多遠（度） */
const CREST_TRAVEL = 9.0;
/** 出生位置：從中心往上游退這麼多（度） */
const CREST_START_BACK = 4.2;
/** 浪頭最亮時的 alpha（0-255） */
const CREST_PEAK_ALPHA = 195;
/** 衰減次方，愈大 → 淡得愈快 */
const CREST_DECAY = 2.0;
/** 浪頭比海面高出多少（公尺） */
const CREST_LIFT = 1100;
/** 一道浪的壽命（毫秒），由距離與速度推出來 */
const CREST_LIFETIME = (CREST_TRAVEL / CREST_SPEED) * 1000;

/** 固定亂數：同一組輸入永遠得到同一個值 */
function hash(a: number, b: number) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

function wrap(v: number, span: number) {
  return ((v % span) + span) % span;
}

/** deck.gl 會立刻把值寫進 buffer，所以陣列可以重複使用、零配置 */
type Dot = {
  /** 基準經緯度（海）或排列參數（浪） */
  baseLng: number;
  baseLat: number;
  along: number;      // 浪：在排列軸上的位置
  crest: number;      // 浪：屬於第幾道
  jitterA: number;
  jitterB: number;
  bright: number;
  pos: [number, number, number];
  color: [number, number, number, number];
};

function makeDot(): Dot {
  return {
    baseLng: 0, baseLat: 0, along: 0, crest: 0,
    jitterA: 0, jitterB: 0, bright: 1,
    pos: [0, 0, 0],
    color: [255, 255, 255, 0],
  };
}

/* ---------------- 建立海 ---------------- */

function buildSea(): Dot[] {
  const dots: Dot[] = [];
  for (let lat = SEA_BOUNDS.minLat; lat <= SEA_BOUNDS.maxLat; lat += SEA_STEP) {
    for (let lng = SEA_BOUNDS.minLng; lng <= SEA_BOUNDS.maxLng; lng += SEA_STEP) {
      const h1 = hash(lng, lat);
      if (h1 > SEA_KEEP) continue;

      const h2 = hash(lat, lng);
      const h3 = hash(lng * 3.7, lat * 1.9);

      const d = makeDot();
      // 從格點錯開，才不會看出棋盤
      d.baseLng = lng + (h2 - 0.5) * SEA_STEP * 0.95;
      d.baseLat = lat + (h3 - 0.5) * SEA_STEP * 0.95;
      d.jitterA = h2 * Math.PI * 2;   // 呼吸相位
      d.bright = 0.35 + h3 * 0.65;    // 每顆點亮度不同，才有顆粒感
      dots.push(d);
    }
  }
  return dots;
}

function updateSea(dots: Dot[], tSec: number) {
  const spanLng = SEA_BOUNDS.maxLng - SEA_BOUNDS.minLng;
  const spanLat = SEA_BOUNDS.maxLat - SEA_BOUNDS.minLat;
  const offLng = DRIFT.x * SEA_SPEED * tSec;
  const offLat = DRIFT.y * SEA_SPEED * tSec;

  for (const p of dots) {
    // 同一個方向一直漂，走出邊界就從另一邊接回來（無縫，因為點是隨機的）
    p.pos[0] = SEA_BOUNDS.minLng + wrap(p.baseLng - SEA_BOUNDS.minLng + offLng, spanLng);
    p.pos[1] = SEA_BOUNDS.minLat + wrap(p.baseLat - SEA_BOUNDS.minLat + offLat, spanLat);
    p.pos[2] = Math.sin(tSec * 0.55 + p.jitterA) * SEA_BOB;

    const shimmer = 0.80 + 0.20 * Math.sin(tSec * 0.8 + p.jitterA * 1.7);
    p.color[3] = (SEA_ALPHA_MIN + (SEA_ALPHA_MAX - SEA_ALPHA_MIN) * p.bright) * shimmer;
  }
}

/* ---------------- 建立海浪 ---------------- */

function buildCrests(): Dot[] {
  const dots: Dot[] = [];
  for (let c = 0; c < CREST_COUNT; c++) {
    for (let along = -CREST_HALF_LEN; along <= CREST_HALF_LEN; along += CREST_DOT_STEP) {
      const h1 = hash(along * 7.3, c * 19.7);
      if (h1 > CREST_KEEP) continue;

      const h2 = hash(c * 5.1, along * 11.3);
      const h3 = hash(along * 2.9, c * 31.1);

      const d = makeDot();
      d.crest = c;
      d.along = along + (h2 - 0.5) * CREST_DOT_STEP * 0.8;
      d.jitterA = (h3 - 0.5) * 0.09;  // 沿行進方向的小錯位 → 排列不會像尺
      d.bright = 0.5 + h2 * 0.5;
      dots.push(d);
    }
  }
  return dots;
}

function updateCrests(dots: Dot[], tSec: number, centerLng: number, centerLat: number) {
  const lifeSec = CREST_LIFETIME / 1000;

  for (const p of dots) {
    // 每道浪錯開出生時間，所以是「一波一波」
    const progress = wrap(tSec / lifeSec + p.crest / CREST_COUNT, 1);
    const travelled = -CREST_START_BACK + progress * CREST_TRAVEL;

    // 讓整排稍微彎一點，像真的浪脊
    const bend = Math.sin(p.along * 0.55 + p.crest * 2.1) * 0.16;
    const forward = travelled + bend + p.jitterA;

    p.pos[0] = centerLng + DRIFT.x * forward + CREST_AXIS.x * p.along;
    p.pos[1] = centerLat + DRIFT.y * forward + CREST_AXIS.y * p.along;

    // 亮度：一出生最亮，往前跑就越來越淡（這是它跟海的差別）
    const fadeIn = smoothstep(0, 0.05, progress);
    const decay = Math.pow(1 - progress, CREST_DECAY);
    const taper = 1 - smoothstep(0.7, 1.0, Math.abs(p.along) / CREST_HALF_LEN);

    p.pos[2] = CREST_LIFT * decay * fadeIn;
    p.color[3] = CREST_PEAK_ALPHA * decay * fadeIn * taper * p.bright;
  }
}

/**
 * 產生一層量子點。海與海浪外觀完全一樣（同大小、同白色），
 * 差別只在餵給它的資料不同，所以共用這個工廠函式。
 *
 * 注意：這裡把所有 props 寫在同一個物件字面值裡，不用展開（spread）。
 * deck.gl 的 props 型別要靠「字面值」才推得出來，展開一個外部物件
 * 會讓 TypeScript 對不上型別，編輯器就會滿江紅。
 */
function makeDotLayer(id: string, dots: Dot[], clock: number) {
  return new ScatterplotLayer<Dot>({
    id,
    data: dots,
    pickable: false,
    billboard: true,        // 永遠正對鏡頭 → 不管視角怎麼歪，每顆都一樣大
    stroked: false,
    filled: true,
    radiusUnits: 'pixels',
    getRadius: DOT_RADIUS_PX,
    radiusMinPixels: DOT_RADIUS_PX,
    radiusMaxPixels: DOT_RADIUS_PX,
    getPosition: (p: Dot) => p.pos,
    getFillColor: (p: Dot) => p.color,
    updateTriggers: {
      getPosition: clock,
      getFillColor: clock,
    },
  });
}

/* ==================================================================
 * 數字滾輪 Odometer
 * 數字不會直接跳，而是「加速 → 減速」滾到新的值，
 * 而且每一位數都是一個上下滾動的輪子，像機械鬧鐘。
 * ================================================================== */

/** 每一位數字輪的高度（px） */
const ODO_DIGIT_H = 34;
/** 動畫時間下限 / 上限（ms）。刻意偏短，滑鼠移開前一定滾完 */
const ODO_MIN_MS = 300;
const ODO_MAX_MS = 780;
/**
 * 每個數字輪「翻頁」佔一格的比例。
 * 0.25 = 前 75% 的時間停在一個看得清楚的數字上，最後 25% 快速翻到下一個，
 * 像機械鬧鐘的翻牌；設成 1 就會變成整格連續打滑、看不清數字。
 */
const ODO_ROLL_WINDOW = 0.26;

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * 把目標值補成連續變化的浮點數。
 * 中途換目標也沒問題：會從「當下顯示到哪」接著跑，不會閃回去。
 */
function useOdometer(target: number) {
  // 一開始從 0 滾上來，widget 出現時就有動態
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const delta = target - from;
    if (Math.abs(delta) < 0.001) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }

    // 差距愈大，滾愈久（但有上下限，不會等到不耐煩）
    const duration = Math.min(
      ODO_MAX_MS,
      Math.max(ODO_MIN_MS, 250 + Math.log10(Math.abs(delta) + 1) * 300),
    );
    const t0 = performance.now();

    const step = (now: number) => {
      const raw = Math.min((now - t0) / duration, 1);
      const v = from + delta * easeInOutCubic(raw);
      fromRef.current = v;
      setDisplay(v);
      if (raw < 1) rafRef.current = requestAnimationFrame(step);
      else { fromRef.current = target; setDisplay(target); }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  return display;
}

function RollingNumber({ value }: { value: number }) {
  const animated = useOdometer(Math.max(0, Math.round(value)));

  // 位數取「目標值」與「當下值」的較大者，滾動中才不會被裁掉
  const widest = Math.max(Math.abs(value), animated, 0);
  const digits = Math.max(1, String(Math.floor(widest)).length);
  const places = Array.from({ length: digits }, (_, i) => digits - 1 - i);

  return (
    <div
      className="flex font-mono font-light tracking-wider text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.25)]"
      style={{ height: ODO_DIGIT_H, fontSize: 30 }}
    >
      {places.map((place) => {
        const pow = Math.pow(10, place);
        const scaled = animated / pow;
        const whole = Math.floor(scaled);
        const digit = ((whole % 10) + 10) % 10;
        // 只有「快要跳下一格」時才翻頁，其他時間停在看得清楚的數字上
        const roll = smoothstep(1 - ODO_ROLL_WINDOW, 1, scaled - whole);
        const pos = digit + roll;
        return (
          <div key={place} style={{ height: ODO_DIGIT_H, overflow: 'hidden' }}>
            <div
              style={{
                transform: `translateY(${-pos * ODO_DIGIT_H}px)`,
                willChange: 'transform',
              }}
            >
              {/* 結尾多一個 0，讓 9 → 0 的接縫是連續的 */}
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d, i) => (
                <div
                  key={i}
                  style={{ height: ODO_DIGIT_H, lineHeight: `${ODO_DIGIT_H}px` }}
                >
                  {d}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ==================================================================
 * 主元件
 * ================================================================== */

interface Props {
  data: Record<string, any>;
  generation: NetGeneration;
}

export default function DensityMap({ data, generation }: Props) {
  const [hoverInfo, setHoverInfo] = useState<any>(null);
  const [viewState, setViewState] = useState(INTRO_VIEW_STATE);
  const [introDone, setIntroDone] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [geoData, setGeoData] = useState<any>(null);
  const [clock, setClock] = useState(0);

  useEffect(() => {
    fetch('/geo/twCounty2010.topo.json')
      .then((res) => res.json())
      .then((topo) => {
        const geo = topojson.feature(topo as any, (topo as any).objects.layer1) as any;
        setGeoData(geo);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let rafId: number | null = null;
    const startTimer = window.setTimeout(() => {
      const t0 = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const raw = Math.min((now - t0) / INTRO_DURATION, 1);
        const t = easeOutCubic(raw);
        setViewState({
          longitude: lerp(INTRO_VIEW_STATE.longitude, FINAL_VIEW_STATE.longitude, t),
          latitude: lerp(INTRO_VIEW_STATE.latitude, FINAL_VIEW_STATE.latitude, t),
          zoom: lerp(INTRO_VIEW_STATE.zoom, FINAL_VIEW_STATE.zoom, t),
          pitch: lerp(INTRO_VIEW_STATE.pitch, FINAL_VIEW_STATE.pitch, t),
          bearing: lerp(INTRO_VIEW_STATE.bearing, FINAL_VIEW_STATE.bearing, t),
        });
        if (raw < 1) rafId = requestAnimationFrame(tick);
        else { setViewState({ ...FINAL_VIEW_STATE }); setIntroDone(true); }
      };
      rafId = requestAnimationFrame(tick);
    }, INTRO_DELAY);
    return () => { cancelled = true; window.clearTimeout(startTimer); if (rafId) cancelAnimationFrame(rafId); };
  }, []);

  // 🌟 鏡頭到位 + 資料已到 → 才從白光切換成真實數據
  useEffect(() => {
    if (!introDone || !data || !geoData) return;
    const t = window.setTimeout(() => setRevealed(true), REVEAL_DELAY);
    return () => window.clearTimeout(t);
  }, [introDone, data, geoData]);

  // 🌟 背景時間軸：節流到 ~30fps，切到別的頁籤自動暫停
  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    let rafId = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= 33) {
        last = now;
        if (!document.hidden) setClock(now);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const onViewStateChange = useCallback(({ viewState: vs }: any) => {
    if (introDone) setViewState(vs);
  }, [introDone]);

  // 點陣只建一次，之後每格只就地改數值
  const seaDots = useMemo(() => buildSea(), []);
  const crestDots = useMemo(() => buildCrests(), []);

  const tSec = clock / 1000;
  updateSea(seaDots, tSec);
  updateCrests(crestDots, tSec, FINAL_VIEW_STATE.longitude, FINAL_VIEW_STATE.latitude);

  // 🌟 只統計「> 1」的資料
  //   最小值 -> 25% 高度基準
  //   最大值 -> 100% 高度基準
  //   0（或 <= 1）不參與統計，直接走 default 型態
  const { minVal, maxVal, hasStatus } = useMemo(() => {
    if (!data) return { minVal: 0, maxVal: 0, hasStatus: false };
    let m = Infinity;
    let M = -Infinity;
    Object.values(data).forEach((cityCounts: any) => {
      const val = generation === '5G' ? Number(cityCounts[0]) : Number(cityCounts[1]);
      if (!isNaN(val) && val > STATUS_THRESHOLD) {
        if (val < m) m = val;
        if (val > M) M = val;
      }
    });
    const found = m !== Infinity;
    return { minVal: found ? m : 0, maxVal: found ? M : 0, hasStatus: found };
  }, [data, generation]);

  /**
   * 把數值換成 0.25 ~ 1.0 的百分比。
   * 回傳 null = 不適用 status，請用 default 型態。
   */
  const toPercentage = useCallback((val: number): number | null => {
    if (!hasStatus || val <= STATUS_THRESHOLD) return null;
    if (maxVal === minVal) return 0.5;                // 全部一樣高 → 放中間
    const ratio = (val - minVal) / (maxVal - minVal); // 0 ~ 1
    return 0.25 + ratio * 0.75;                       // 0.25 ~ 1.0
  }, [hasStatus, minVal, maxVal]);

  const layers = [
    // 🌊 海：低密度、鋪滿畫面、往同一個方向慢慢漂
    makeDotLayer('sea-drift-field', seaDots, clock),

    // 🌊 海浪：排成一列，比海快 9 倍，越跑越淡
    makeDotLayer('sea-crest-field', crestDots, clock),

    new GeoJsonLayer({
      id: 'taiwan-extruded-layer',
      data: geoData,
      pickable: revealed,

      stroked: true,
      filled: true,
      extruded: true,
      wireframe: false,
      lineJointRounded: true,
      lineWidthMinPixels: 1,
      material: MATTE_MATERIAL,

      getLineColor: () => (revealed ? [20, 20, 30, 160] : INTRO_LINE),

      // 🌟 高度
      // 未初始化 → 全島 1%
      // 資料 <= 1（含 0）→ default 型態，1%
      // 資料 > 1 → 線性映射到 25% ~ 100%
      getElevation: (d: any) => {
        if (!revealed) return INTRO_HEIGHT;
        const val = getCityDataValue(d.properties?.COUNTYNAME, data, generation);
        const percentage = toPercentage(val);
        if (percentage === null) return DEFAULT_HEIGHT;
        return percentage * MAX_HEIGHT;
      },
      elevationScale: 200,

      // 🌟 顏色
      // 未初始化 → 淡淡的白光
      // default 型態 → 極暗石墨色
      // 25% ~ 50% → 紅色系（深 → 淺）
      // 50% ~ 100% → 藍色系（淺 → 深）
      getFillColor: (d: any) => {
        if (!revealed) return INTRO_FILL;

        const val = getCityDataValue(d.properties?.COUNTYNAME, data, generation);
        const percentage = toPercentage(val);
        if (percentage === null) return DEFAULT_FILL;

        if (percentage <= 0.5) {
          const subRatio = (percentage - 0.25) / 0.25; // 0 ~ 1
          const r = Math.round(180 + 40 * subRatio);
          const g = Math.round(100 + 80 * subRatio);
          const b = Math.round(100 + 80 * subRatio);
          return [r, g, b, 235];
        }
        const subRatio = (percentage - 0.5) / 0.5;     // 0 ~ 1
        const r = Math.round(170 - 70 * subRatio);
        const g = Math.round(190 - 40 * subRatio);
        const b = Math.round(220 - 10 * subRatio);
        return [r, g, b, 235];
      },

      autoHighlight: revealed,
      highlightColor: [255, 255, 255, 80],
      onHover: (info) => setHoverInfo(revealed ? info : null),

      updateTriggers: {
        getElevation: [data, generation, minVal, maxVal, hasStatus, revealed],
        getFillColor: [data, generation, minVal, maxVal, hasStatus, revealed],
        getLineColor: [revealed],
      },
      transitions: {
        getElevation: 900,
        getFillColor: 900,
        getLineColor: 900,
      },
    }),
  ];

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#020202]">
      {/* 未初始化時，中央的一圈柔光，讓白色台灣像是浮在光裡 */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-1000"
        style={{
          zIndex: 1,
          opacity: revealed ? 0 : 1,
          background:
            'radial-gradient(45% 40% at 50% 52%, rgba(190,215,255,0.16) 0%, rgba(190,215,255,0.05) 45%, rgba(0,0,0,0) 72%)',
        }}
      />

      <DeckGL
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        controller={introDone ? { dragMode: 'rotate', dragPan: false, scrollZoom: false, dragRotate: true, keyboard: false, touchRotate: true } : false}
        layers={layers}
        style={{ touchAction: 'none', zIndex: '2' }}
      >
        {hoverInfo?.object && (
          <div
            className="absolute z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full pb-6 transition-all duration-75 ease-out"
            style={{ left: hoverInfo.x, top: hoverInfo.y }}
          >
            <div className="px-6 py-4 rounded-xl min-w-[180px]" style={{ background: 'rgba(15, 15, 15, 0.65)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255, 255, 255, 0.2)', boxShadow: '0 20px 40px -10px rgba(0,0,0,1), inset 0 1px 0 rgba(255,255,255,0.15)' }}>
              <div className="font-black text-2xl tracking-[0.2em] text-white text-center mb-2 drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">
                {hoverInfo.object.properties.COUNTYNAME}
              </div>
              <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-zinc-400/30 to-transparent mb-3" />
              <div className="flex flex-col items-center gap-1">
                <span className="text-zinc-400 uppercase text-[11px] tracking-widest font-bold">{generation} Nodes</span>
                <RollingNumber
                  value={getCityDataValue(hoverInfo.object.properties.COUNTYNAME, data, generation)}
                />
              </div>
            </div>
          </div>
        )}
      </DeckGL>

      {/* 暗角：留得比較淡，海才鋪得滿；四個角落還是壓下去 */}
      <div
        className="pointer-events-none absolute inset-0 shadow-[inset_0_0_170px_rgba(0,0,0,0.72)]"
        style={{ zIndex: 3 }}
      />

      {introDone && (
        <div className="absolute bottom-8 right-8 text-right pointer-events-none" style={{ zIndex: 10 }}>
          <div className="text-zinc-500 text-[12px] font-mono uppercase tracking-widest flex items-center justify-end gap-2 mb-1">
            <span>Drag</span><kbd className="font-sans border border-zinc-700 bg-zinc-800 px-2 py-1 rounded-md text-zinc-200 shadow-md">Left-Click</kbd><span>to Rotate</span>
          </div>
        </div>
      )}
    </div>
  );
}