// components/navigator_page/NavigatorMap.tsx
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, GeoJsonLayer } from '@deck.gl/layers';
import Map from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FlyToInterpolator } from '@deck.gl/core';
import * as topojson from 'topojson-client';
import { fetchAllCountyWifiCounts, fetchWifiNodesByCounty, WifiNode } from '@/services/navigator';

const VERSION_TAG = '[NavigatorMap v27 - Intro + Sea Background]';

const COUNTY_GEOJSON_URL = '/geo/twCounty2010.topo.json';
const TOWN_GEOJSON_URL = '/geo/twTown2010.topo.json';

const CITY_COORDS: Record<string, { longitude: number; latitude: number }> = {
  '基隆市': { longitude: 121.7419, latitude: 25.1276 },
  '台北市': { longitude: 121.5654, latitude: 25.0330 },
  '新北市': { longitude: 121.4654, latitude: 25.0112 },
  '桃園市': { longitude: 121.3009, latitude: 24.9936 },
  '新竹市': { longitude: 120.9675, latitude: 24.8138 },
  '新竹縣': { longitude: 121.0177, latitude: 24.8282 },
  '苗栗縣': { longitude: 120.8161, latitude: 24.5602 },
  '台中市': { longitude: 120.6736, latitude: 24.1477 },
  '彰化縣': { longitude: 120.5440, latitude: 24.0777 },
  '南投縣': { longitude: 120.9719, latitude: 23.9037 },
  '雲林縣': { longitude: 120.4313, latitude: 23.7092 },
  '嘉義市': { longitude: 120.4491, latitude: 23.4801 },
  '嘉義縣': { longitude: 120.3255, latitude: 23.4518 },
  '台南市': { longitude: 120.1838, latitude: 22.9997 },
  '高雄市': { longitude: 120.3120, latitude: 22.6208 },
  '屏東縣': { longitude: 120.4880, latitude: 22.6730 },
  '宜蘭縣': { longitude: 121.7536, latitude: 24.7570 },
  '花蓮縣': { longitude: 121.6068, latitude: 23.9872 },
  '台東縣': { longitude: 121.1444, latitude: 22.7583 },
  '澎湖縣': { longitude: 119.5664, latitude: 23.5673 },
  '金門縣': { longitude: 118.3171, latitude: 24.4327 },
  '連江縣': { longitude: 119.9363, latitude: 26.1505 },
};

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const BOUNDS = { minLng: 117.0, maxLng: 123.5, minLat: 20.5, maxLat: 26.5, minZoom: 6, maxZoom: 18 };

/* ==================================================================
 * 進場動畫常數（對齊 DensityMap）
 * ================================================================== */
const FINAL_VIEW_STATE = {
  longitude: 120.982,
  latitude: 23.9738,
  zoom: 7.2,
  pitch: 45,
  bearing: -10,
};
const INTRO_VIEW_STATE = {
  longitude: 120.982,
  latitude: 23.9738,
  zoom: 4.6,
  pitch: 78,
  bearing: -60,
};
const INTRO_DELAY = 400;
const INTRO_DURATION = 2800;
const REVEAL_DELAY = 260;

const TAIWAN_VIEW = { ...FINAL_VIEW_STATE, bearing: 0 };

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/* ==================================================================
 * 背景：海（漂流量子點）＋ 海浪
 * ================================================================== */
const DOT_RADIUS_PX = 1.6;

const DRIFT = (() => {
  const x = 0.9;
  const y = 0.44;
  const len = Math.hypot(x, y);
  return { x: x / len, y: y / len };
})();
const CREST_AXIS = { x: -DRIFT.y, y: DRIFT.x };

const SEA_BOUNDS = { minLng: 110, maxLng: 132, minLat: 12, maxLat: 36 };
const SEA_STEP = 0.34;
const SEA_KEEP = 0.42;
const SEA_SPEED = 0.045;
const SEA_ALPHA_MIN = 38;
const SEA_ALPHA_MAX = 104;
const SEA_BOB = 240;

const CREST_COUNT = 4;
const CREST_DOT_STEP = 0.11;
const CREST_HALF_LEN = 7.2;
const CREST_KEEP = 0.78;
const CREST_SPEED = 0.42;
const CREST_TRAVEL = 9.0;
const CREST_START_BACK = 4.2;
const CREST_PEAK_ALPHA = 195;
const CREST_DECAY = 2.0;
const CREST_LIFT = 1100;
const CREST_LIFETIME = (CREST_TRAVEL / CREST_SPEED) * 1000;

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

type Dot = {
  baseLng: number;
  baseLat: number;
  along: number;
  crest: number;
  jitterA: number;
  jitterB: number;
  bright: number;
  pos: [number, number, number];
  color: [number, number, number, number];
};

function makeDot(): Dot {
  return {
    baseLng: 0,
    baseLat: 0,
    along: 0,
    crest: 0,
    jitterA: 0,
    jitterB: 0,
    bright: 1,
    pos: [0, 0, 0],
    color: [255, 255, 255, 0],
  };
}

function buildSea(): Dot[] {
  const dots: Dot[] = [];
  for (let lat = SEA_BOUNDS.minLat; lat <= SEA_BOUNDS.maxLat; lat += SEA_STEP) {
    for (let lng = SEA_BOUNDS.minLng; lng <= SEA_BOUNDS.maxLng; lng += SEA_STEP) {
      const h1 = hash(lng, lat);
      if (h1 > SEA_KEEP) continue;
      const h2 = hash(lat, lng);
      const h3 = hash(lng * 3.7, lat * 1.9);
      const d = makeDot();
      d.baseLng = lng + (h2 - 0.5) * SEA_STEP * 0.95;
      d.baseLat = lat + (h3 - 0.5) * SEA_STEP * 0.95;
      d.jitterA = h2 * Math.PI * 2;
      d.bright = 0.35 + h3 * 0.65;
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
    p.pos[0] = SEA_BOUNDS.minLng + wrap(p.baseLng - SEA_BOUNDS.minLng + offLng, spanLng);
    p.pos[1] = SEA_BOUNDS.minLat + wrap(p.baseLat - SEA_BOUNDS.minLat + offLat, spanLat);
    p.pos[2] = Math.sin(tSec * 0.55 + p.jitterA) * SEA_BOB;
    const shimmer = 0.8 + 0.2 * Math.sin(tSec * 0.8 + p.jitterA * 1.7);
    p.color[3] = (SEA_ALPHA_MIN + (SEA_ALPHA_MAX - SEA_ALPHA_MIN) * p.bright) * shimmer;
  }
}

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
      d.jitterA = (h3 - 0.5) * 0.09;
      d.bright = 0.5 + h2 * 0.5;
      dots.push(d);
    }
  }
  return dots;
}

function updateCrests(dots: Dot[], tSec: number, centerLng: number, centerLat: number) {
  const lifeSec = CREST_LIFETIME / 1000;
  for (const p of dots) {
    const progress = wrap(tSec / lifeSec + p.crest / CREST_COUNT, 1);
    const travelled = -CREST_START_BACK + progress * CREST_TRAVEL;
    const bend = Math.sin(p.along * 0.55 + p.crest * 2.1) * 0.16;
    const forward = travelled + bend + p.jitterA;
    p.pos[0] = centerLng + DRIFT.x * forward + CREST_AXIS.x * p.along;
    p.pos[1] = centerLat + DRIFT.y * forward + CREST_AXIS.y * p.along;
    const fadeIn = smoothstep(0, 0.05, progress);
    const decay = Math.pow(1 - progress, CREST_DECAY);
    const taper = 1 - smoothstep(0.7, 1.0, Math.abs(p.along) / CREST_HALF_LEN);
    p.pos[2] = CREST_LIFT * decay * fadeIn;
    p.color[3] = CREST_PEAK_ALPHA * decay * fadeIn * taper * p.bright;
  }
}

function makeDotLayer(id: string, dots: Dot[], clock: number) {
  return new ScatterplotLayer<Dot>({
    id,
    data: dots,
    pickable: false,
    billboard: true,
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
 * 其他工具
 * ================================================================== */
const normalizeName = (name: string) =>
  name ? name.replace(/臺/g, '台').replace(/市|縣|區|鄉|鎮/g, '') : '';

const EMPTY_GEOJSON = { type: 'FeatureCollection' as const, features: [] };

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

function getClosestCity(lng: number, lat: number) {
  let minDistance = Infinity;
  let closest = '台北市';
  for (const [city, coord] of Object.entries(CITY_COORDS)) {
    const dist = Math.hypot(coord.longitude - lng, coord.latitude - lat);
    if (dist < minDistance) {
      minDistance = dist;
      closest = city;
    }
  }
  return closest;
}

function getGoogleMapsUrl(lat: number, lng: number, name?: string) {
  const query = name
    ? encodeURIComponent(`${name} @${lat},${lng}`)
    : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function calcDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface Props {
  userLocation?: { lng: number; lat: number } | null;
  onClearUserLocation?: () => void;
  onRequestLocate?: () => void;
  isLocating?: boolean;
  locateError?: string | null;
}

export default function NavigatorMap({
  userLocation = null,
  onClearUserLocation,
  onRequestLocate,
  isLocating = false,
  locateError = null,
}: Props) {
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [wifiData, setWifiData] = useState<WifiNode[]>([]);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [hoverInfo, setHoverInfo] = useState<any>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [nearbyNodes, setNearbyNodes] = useState<WifiNode[]>([]);
  const [showNearbyPanel, setShowNearbyPanel] = useState(false);

  const [countyGeoData, setCountyGeoData] = useState<any>(null);
  const [townGeoData, setTownGeoData] = useState<any>(null);
  const [tier1Counts, setTier1Counts] = useState<Record<string, number>>({});

  // 進場
  const [viewState, setViewState] = useState<any>({ ...INTRO_VIEW_STATE });
  const [introDone, setIntroDone] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [clock, setClock] = useState(0);

  const listItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastClickTime = useRef<number>(0);
  const lastClickedId = useRef<string | null>(null);
  const lockRef = useRef(false);

  const isTier1 = selectedCity === null;

  // 載入圖資
  useEffect(() => {
    loadFeatureCollection(COUNTY_GEOJSON_URL).then((geo) => geo && setCountyGeoData(geo));
    loadFeatureCollection(TOWN_GEOJSON_URL).then((geo) => geo && setTownGeoData(geo));
    fetchAllCountyWifiCounts().then((counts) => counts && setTier1Counts(counts));
  }, []);

  // 進場鏡頭動畫
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
        else {
          setViewState({ ...FINAL_VIEW_STATE });
          setIntroDone(true);
        }
      };
      rafId = requestAnimationFrame(tick);
    }, INTRO_DELAY);
    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // 鏡頭到位後再 reveal 資料
  useEffect(() => {
    if (!introDone || !countyGeoData) return;
    const t = window.setTimeout(() => setRevealed(true), REVEAL_DELAY);
    return () => window.clearTimeout(t);
  }, [introDone, countyGeoData]);

  // 背景時間軸 ~30fps
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

  // 進入縣市時載入 WiFi
  useEffect(() => {
    if (!selectedCity) {
      setWifiData([]);
      setSidebarSearch('');
      setHighlightedId(null);
      setNearbyNodes([]);
      setShowNearbyPanel(false);
      return;
    }
    const load = async () => {
      const nodes = await fetchWifiNodesByCounty(selectedCity);
      setWifiData(nodes || []);
    };
    load();
  }, [selectedCity]);

  // 處理定位
  useEffect(() => {
    if (!userLocation || lockRef.current || !introDone) return;
    const closest = getClosestCity(userLocation.lng, userLocation.lat);
    setSelectedCity(closest);
    setViewState((prev: any) => ({
      ...prev,
      longitude: userLocation.lng,
      latitude: userLocation.lat,
      zoom: 15,
      pitch: 40,
      transitionDuration: 1600,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.3 }),
    }));
  }, [userLocation, introDone]);

  // 附近熱點
  useEffect(() => {
    if (!userLocation || wifiData.length === 0 || lockRef.current) {
      if (!userLocation) setNearbyNodes([]);
      return;
    }
    const nearby = wifiData
      .map((node) => ({
        node,
        dist: calcDistanceMeters(userLocation.lat, userLocation.lng, node.pos[1], node.pos[0]),
      }))
      .filter((item) => item.dist <= 800)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 10)
      .map((item) => item.node);
    setNearbyNodes(nearby);
    if (nearby.length > 0) setShowNearbyPanel(true);
  }, [userLocation, wifiData]);

  // 飛到縣市（非定位、非鎖定、進場完成後）
  useEffect(() => {
    if (!introDone || userLocation || lockRef.current) return;
    if (!selectedCity) {
      setViewState((prev: any) => ({
        ...prev,
        ...TAIWAN_VIEW,
        transitionDuration: 1600,
        transitionInterpolator: new FlyToInterpolator({ speed: 1.3 }),
      }));
      return;
    }
    const target = CITY_COORDS[selectedCity];
    if (!target) return;
    setViewState((prev: any) => ({
      ...prev,
      longitude: target.longitude,
      latitude: target.latitude,
      zoom: 11,
      pitch: 40,
      transitionDuration: 1600,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.3 }),
    }));
  }, [selectedCity, userLocation, introDone]);

  useEffect(() => {
    if (userLocation === null && lockRef.current) {
      const t = setTimeout(() => {
        lockRef.current = false;
      }, 100);
      return () => clearTimeout(t);
    }
  }, [userLocation]);

  const onViewStateChange = useCallback(
    ({ viewState: vs }: any) => {
      if (!introDone) return;
      setViewState({
        ...vs,
        longitude: Math.max(BOUNDS.minLng, Math.min(BOUNDS.maxLng, vs.longitude)),
        latitude: Math.max(BOUNDS.minLat, Math.min(BOUNDS.maxLat, vs.latitude)),
        zoom: Math.max(BOUNDS.minZoom, Math.min(BOUNDS.maxZoom, vs.zoom)),
        transitionDuration: 0,
      });
    },
    [introDone]
  );

  const handleReturnToTaiwan = useCallback(() => {
    lockRef.current = true;
    setSelectedCity(null);
    setWifiData([]);
    setSidebarSearch('');
    setHighlightedId(null);
    setNearbyNodes([]);
    setShowNearbyPanel(false);
    setHoverInfo(null);
    setViewState({
      ...TAIWAN_VIEW,
      transitionDuration: 1600,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.3 }),
    });
    onClearUserLocation?.();
  }, [onClearUserLocation]);

  const handleCountyClick = useCallback(
    (info: any) => {
      if (!revealed || !info.object?.properties) return;
      const rawName =
        info.object.properties.COUNTYNAME || info.object.properties.C_Name || '';
      const matched = Object.keys(CITY_COORDS).find(
        (city) => normalizeName(city) === normalizeName(rawName)
      );
      if (matched) {
        lockRef.current = false;
        setSelectedCity(matched);
        onClearUserLocation?.();
      }
    },
    [onClearUserLocation, revealed]
  );

  const handlePointClick = useCallback((info: any) => {
    if (!info.object) return;
    const now = Date.now();
    const id = info.object.id || `${info.object.pos[0]}-${info.object.pos[1]}`;
    if (lastClickedId.current === id && now - lastClickTime.current < 350) {
      setHighlightedId(id);
      const el = listItemRefs.current[id];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      setHoverInfo(info);
    }
    lastClickTime.current = now;
    lastClickedId.current = id;
  }, []);

  const handleSidebarDoubleClick = useCallback((node: WifiNode) => {
    const url = getGoogleMapsUrl(node.pos[1], node.pos[0], node.name);
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const currentTownFeatures = useMemo(() => {
    if (!selectedCity) return EMPTY_GEOJSON;
    const normalized = normalizeName(selectedCity);
    if (townGeoData?.features?.length) {
      const matched = townGeoData.features.filter((f: any) => {
        const raw =
          f.properties?.COUNTYNAME || f.properties?.C_Name || f.properties?.COUNTY_ENG || '';
        return normalizeName(raw) === normalized;
      });
      if (matched.length > 0) return { type: 'FeatureCollection' as const, features: matched };
    }
    if (countyGeoData?.features?.length) {
      const matched = countyGeoData.features.filter((f: any) => {
        const raw =
          f.properties?.COUNTYNAME || f.properties?.C_Name || f.properties?.COUNTY_ENG || '';
        return normalizeName(raw) === normalized;
      });
      return { type: 'FeatureCollection' as const, features: matched };
    }
    return EMPTY_GEOJSON;
  }, [townGeoData, countyGeoData, selectedCity]);

  const filteredWifi = useMemo(() => {
    const kw = sidebarSearch.trim().toLowerCase();
    if (!kw) return wifiData;
    return wifiData.filter(
      (d) =>
        d.name.toLowerCase().includes(kw) ||
        d.provider.toLowerCase().includes(kw) ||
        d.address.toLowerCase().includes(kw)
    );
  }, [wifiData, sidebarSearch]);

  // 海面點陣
  const seaDots = useMemo(() => buildSea(), []);
  const crestDots = useMemo(() => buildCrests(), []);
  const tSec = clock / 1000;
  updateSea(seaDots, tSec);
  updateCrests(crestDots, tSec, FINAL_VIEW_STATE.longitude, FINAL_VIEW_STATE.latitude);

  const layers = useMemo(() => {
    const result: any[] = [];

    // 背景：海 + 浪（只在第一層顯示，第二層有底圖較不需要）
    if (isTier1) {
      result.push(makeDotLayer('sea-drift-field', seaDots, clock));
      result.push(makeDotLayer('sea-crest-field', crestDots, clock));
    }

    // 第一層：全台 3D
    result.push(
      new GeoJsonLayer({
        id: 'tier1-county-layer',
        data: countyGeoData || EMPTY_GEOJSON,
        visible: isTier1,
        pickable: revealed,
        stroked: true,
        filled: true,
        extruded: true,
        wireframe: false,
        getLineColor: revealed ? [40, 60, 90, 180] : [255, 255, 255, 150],
        getElevation: (d: any) => {
          if (!revealed) return 0.5;
          const norm = normalizeName(d.properties?.COUNTYNAME || d.properties?.C_Name || '');
          const count =
            Object.entries(tier1Counts).find(([k]) => normalizeName(k) === norm)?.[1] || 10;
          return Math.log2(count + 1);
        },
        elevationScale: revealed ? 1600 : 200,
        getFillColor: (d: any) => {
          if (!revealed) return [232, 240, 255, 70];
          const norm = normalizeName(d.properties?.COUNTYNAME || d.properties?.C_Name || '');
          const count =
            Object.entries(tier1Counts).find(([k]) => normalizeName(k) === norm)?.[1] || 10;
          const ratio = Math.min(count / 4500, 1);
          return [
            Math.round(30 + 80 * ratio),
            Math.round(120 + 80 * ratio),
            Math.round(200 + 40 * ratio),
            220,
          ];
        },
        autoHighlight: revealed,
        highlightColor: [255, 255, 255, 90],
        onHover: (info) => setHoverInfo(revealed ? info : null),
        onClick: handleCountyClick,
        updateTriggers: {
          getElevation: [tier1Counts, revealed],
          getFillColor: [tier1Counts, revealed],
          getLineColor: [revealed],
        },
        transitions: { getElevation: 900, getFillColor: 900, getLineColor: 900 },
      })
    );

    // 第二層：行政區
    result.push(
      new GeoJsonLayer({
        id: 'tier2-district-layer',
        data: currentTownFeatures,
        visible: !isTier1,
        pickable: false,
        stroked: true,
        filled: true,
        lineWidthMinPixels: 2,
        getLineColor: [80, 200, 255, 160],
        getFillColor: [10, 25, 50, 35],
      })
    );

    // 第二層：WiFi 點
    result.push(
      new ScatterplotLayer<WifiNode>({
        id: 'wifi-points',
        data: wifiData,
        visible: !isTier1,
        pickable: true,
        stroked: false,
        filled: true,
        radiusUnits: 'meters',
        getRadius: (d) => {
          const id = d.id || `${d.pos[0]}-${d.pos[1]}`;
          return highlightedId === id ? 90 : 55;
        },
        getPosition: (d) => d.pos,
        getFillColor: (d) => {
          const id = d.id || `${d.pos[0]}-${d.pos[1]}`;
          return highlightedId === id ? [255, 200, 50, 255] : [60, 170, 255, 220];
        },
        onHover: (info) => {
          if (info.object) setHoverInfo(info);
        },
        onClick: handlePointClick,
        updateTriggers: {
          getRadius: [highlightedId],
          getFillColor: [highlightedId],
        },
        transitions: { getRadius: 250, getFillColor: 250 },
      })
    );

    return result;
  }, [
    countyGeoData,
    currentTownFeatures,
    wifiData,
    tier1Counts,
    isTier1,
    highlightedId,
    handleCountyClick,
    handlePointClick,
    revealed,
    clock,
    seaDots,
    crestDots,
  ]);

  return (
    <div className="absolute inset-0 bg-[#020202] flex overflow-hidden">
      {/* 進場柔光 */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-1000"
        style={{
          zIndex: 1,
          opacity: revealed ? 0 : 1,
          background:
            'radial-gradient(45% 40% at 50% 52%, rgba(190,215,255,0.16) 0%, rgba(190,215,255,0.05) 45%, rgba(0,0,0,0) 72%)',
        }}
      />

      {/* 地圖區 */}
      <div
        className={`relative h-full transition-all duration-500 ${
          isTier1 ? 'w-full' : 'w-[calc(100%-380px)]'
        }`}
        style={{ zIndex: 2 }}
      >
        <DeckGL
          viewState={viewState}
          onViewStateChange={onViewStateChange}
          controller={
            introDone
              ? {
                  dragPan: true,
                  dragRotate: true,
                  scrollZoom: true,
                  touchZoom: true,
                  touchRotate: true,
                }
              : false
          }
          layers={layers}
        >
          {!isTier1 && (
            <div
              style={{
                opacity: 0.35,
                width: '100%',
                height: '100%',
                position: 'absolute',
                pointerEvents: 'none',
              }}
            >
              <Map mapStyle={MAP_STYLE} attributionControl={false} reuseMaps />
            </div>
          )}

          {/* 第一層 Hover */}
          {hoverInfo?.object && isTier1 && revealed && hoverInfo.object.properties && (
            <div
              className="absolute z-50 pointer-events-none -translate-x-1/2 -translate-y-full pb-3"
              style={{ left: hoverInfo.x, top: hoverInfo.y }}
            >
              <div
                className="px-5 py-3.5 rounded-xl min-w-[180px] text-center"
                style={{
                  background: 'rgba(12,18,28,0.92)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(80,180,255,0.4)',
                  boxShadow: '0 16px 32px rgba(0,0,0,0.8)',
                }}
              >
                <div className="font-bold text-white text-base tracking-wide">
                  {hoverInfo.object.properties.COUNTYNAME || hoverInfo.object.properties.C_Name}
                </div>
                <div className="text-cyan-300 text-2xl font-mono mt-1">
                  {(() => {
                    const norm = normalizeName(
                      hoverInfo.object.properties.COUNTYNAME ||
                        hoverInfo.object.properties.C_Name ||
                        ''
                    );
                    return (
                      Object.entries(tier1Counts).find(([k]) => normalizeName(k) === norm)?.[1] ||
                      0
                    );
                  })()}
                </div>
                <div className="text-zinc-500 text-[10px] mt-0.5">點擊進入</div>
              </div>
            </div>
          )}

          {/* 第二層點位 Widget */}
          {hoverInfo?.object && !isTier1 && hoverInfo.object.provider && (
            <div
              className="absolute z-50 -translate-x-1/2 -translate-y-full pb-3"
              style={{ left: hoverInfo.x, top: hoverInfo.y }}
            >
              <div
                className="px-4 py-3 rounded-xl min-w-[260px]"
                style={{
                  background: 'rgba(12,18,28,0.95)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(80,180,255,0.45)',
                  boxShadow: '0 16px 32px rgba(0,0,0,0.85)',
                }}
                onMouseLeave={() => setHoverInfo(null)}
              >
                <div className="font-bold text-white text-sm text-center mb-1">
                  {hoverInfo.object.name}
                </div>
                <div className="text-zinc-400 text-xs text-center mb-2">
                  {hoverInfo.object.address}
                </div>
                <div className="text-cyan-300 text-center text-sm font-mono mb-3">
                  {hoverInfo.object.provider}
                </div>
                <div className="text-zinc-500 text-[10px] text-center">
                  雙擊可跳到側欄對應項目
                </div>
              </div>
            </div>
          )}
        </DeckGL>

        {/* 左下角控制（進場完成後才顯示） */}
        {introDone && (
          <div className="absolute bottom-6 left-6 z-40 flex flex-col gap-3 items-start">
            {userLocation && nearbyNodes.length > 0 && showNearbyPanel && (
              <div
                className="w-80 px-5 py-4 rounded-xl"
                style={{
                  background: 'rgba(12,18,28,0.96)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(80,180,255,0.4)',
                  boxShadow: '0 12px 28px rgba(0,0,0,0.75)',
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="text-white text-base font-bold tracking-wide">
                    附近公開 WiFi（{nearbyNodes.length}）
                  </div>
                  <button
                    onClick={() => setShowNearbyPanel(false)}
                    className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded"
                  >
                    收合
                  </button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto hide-scrollbar">
                  {nearbyNodes.map((node) => {
                    const id = node.id || `${node.pos[0]}-${node.pos[1]}`;
                    return (
                      <div
                        key={id}
                        className="text-sm text-zinc-200 flex justify-between gap-3 cursor-pointer hover:text-cyan-300 py-1.5 border-b border-white/5 last:border-0"
                        onClick={() => {
                          setHighlightedId(id);
                          const el = listItemRefs.current[id];
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          setViewState((prev: any) => ({
                            ...prev,
                            longitude: node.pos[0],
                            latitude: node.pos[1],
                            zoom: 16,
                            transitionDuration: 1000,
                            transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }),
                          }));
                        }}
                      >
                        <span className="truncate font-medium">{node.name}</span>
                        <span className="text-cyan-400/90 shrink-0 text-xs font-mono">
                          {node.provider}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {userLocation && nearbyNodes.length > 0 && (
                <button
                  onClick={() => setShowNearbyPanel((v) => !v)}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2"
                  style={{
                    background: showNearbyPanel
                      ? 'rgba(14,165,233,0.25)'
                      : 'rgba(12,18,28,0.9)',
                    border: showNearbyPanel
                      ? '1px solid rgba(14,165,233,0.6)'
                      : '1px solid rgba(80,180,255,0.35)',
                    color: '#e0f2fe',
                    backdropFilter: 'blur(12px)',
                  }}
                >
                  <span>📡</span>
                  <span>
                    {showNearbyPanel ? '收合附近熱點' : `附近有 ${nearbyNodes.length} 個熱點`}
                  </span>
                </button>
              )}

              <button
                onClick={() => {
                  lockRef.current = false;
                  onRequestLocate?.();
                }}
                disabled={isLocating}
                className="px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-60"
                style={{
                  background: 'rgba(12,18,28,0.9)',
                  border: '1px solid rgba(80,180,255,0.35)',
                  color: '#e0f2fe',
                  backdropFilter: 'blur(12px)',
                }}
              >
                {isLocating ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    <span>定位中...</span>
                  </>
                ) : (
                  <>
                    <span>📍</span>
                    <span>定位到我</span>
                  </>
                )}
              </button>

              {!isTier1 && (
                <button
                  onClick={handleReturnToTaiwan}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2"
                  style={{
                    background: 'rgba(12,18,28,0.9)',
                    border: '1px solid rgba(80,180,255,0.35)',
                    color: '#e0f2fe',
                    backdropFilter: 'blur(12px)',
                  }}
                >
                  <span>←</span>
                  <span>返回全台</span>
                </button>
              )}
            </div>

            {locateError && (
              <p className="text-[11px] text-amber-400/90 px-1 max-w-[280px] leading-relaxed">
                {locateError}
              </p>
            )}
          </div>
        )}

        <div
          className="absolute inset-0 pointer-events-none shadow-[inset_0_0_170px_rgba(0,0,0,0.72)]"
          style={{ zIndex: 3 }}
        />
      </div>

      {/* 右側側欄 */}
      {!isTier1 && (
        <div
          className="h-full w-[380px] flex flex-col border-l"
          style={{
            background: 'rgba(8,12,20,0.97)',
            borderColor: 'rgba(80,180,255,0.15)',
            zIndex: 4,
          }}
        >
          <div className="px-5 pt-5 pb-4 border-b" style={{ borderColor: 'rgba(80,180,255,0.12)' }}>
            <h2 className="text-white font-bold text-lg tracking-wide">{selectedCity}</h2>
            <p className="text-zinc-400 text-xs mt-1">共 {wifiData.length} 個公開 WiFi 熱點</p>
            <div className="mt-4">
              <input
                type="text"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="搜尋名稱、業者、地址..."
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-zinc-500 outline-none"
                style={{
                  background: 'rgba(20,30,50,0.8)',
                  border: '1px solid rgba(80,180,255,0.25)',
                }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 hide-scrollbar">
            {filteredWifi.length === 0 ? (
              <div className="text-zinc-500 text-sm text-center py-10">
                {sidebarSearch ? '找不到符合的結果' : '載入中...'}
              </div>
            ) : (
              filteredWifi.map((node) => {
                const id = node.id || `${node.pos[0]}-${node.pos[1]}`;
                const isHighlighted = highlightedId === id;
                return (
                  <div
                    key={id}
                    ref={(el) => {
                      listItemRefs.current[id] = el;
                    }}
                    onDoubleClick={() => handleSidebarDoubleClick(node)}
                    onClick={() => {
                      setHighlightedId(id);
                      setViewState((prev: any) => ({
                        ...prev,
                        longitude: node.pos[0],
                        latitude: node.pos[1],
                        zoom: 15,
                        transitionDuration: 1200,
                        transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }),
                      }));
                    }}
                    className="px-3.5 py-3 rounded-xl cursor-pointer transition-all duration-200"
                    style={{
                      background: isHighlighted
                        ? 'rgba(14,165,233,0.18)'
                        : 'rgba(20,30,50,0.6)',
                      border: isHighlighted
                        ? '1px solid rgba(14,165,233,0.5)'
                        : '1px solid rgba(80,180,255,0.08)',
                    }}
                  >
                    <div className="font-medium text-white text-sm leading-snug">{node.name}</div>
                    <div className="text-zinc-400 text-xs mt-1 line-clamp-1">{node.address}</div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-cyan-400/90 text-xs font-mono">{node.provider}</span>
                      <span className="text-zinc-600 text-[10px]">雙擊開啟地圖</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}