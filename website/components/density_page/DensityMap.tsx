// components/density_page/DensityMap.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer } from '@deck.gl/layers';
import { NetGeneration } from '@/services/density';
import * as topojson from 'topojson-client';

const normalizeCityName = (name: string) => {
  if (!name) return '';
  return name.replace('臺', '台').replace('市', '').replace('縣', '');
};

/** 最終視角（定位完成） */
const FINAL_VIEW_STATE = {
  longitude: 120.982,
  latitude: 23.9738,
  zoom: 7.2,
  pitch: 55,
  bearing: -10,
};

/** 進場起始：明顯更遠 + 側邊 */
const INTRO_VIEW_STATE = {
  longitude: 120.982,
  latitude: 23.9738,
  zoom: 4.6,
  pitch: 78,
  bearing: -60,
};

const INTRO_DELAY = 400;
const INTRO_DURATION = 2800;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

interface Props {
  data: Record<string, [number, number]>;
  generation: NetGeneration;
}

export default function DensityMap({ data, generation }: Props) {
  const [hoverInfo, setHoverInfo] = useState<any>(null);
  const [viewState, setViewState] = useState(INTRO_VIEW_STATE);
  const [introDone, setIntroDone] = useState(false);
  
  // 新增：用來存放解壓縮後的 GeoJSON 圖資
  const [geoData, setGeoData] = useState<any>(null);

  // 新增：載入 76KB 的 TopoJSON 檔案並轉換
  // 新增：載入本地的 76KB TopoJSON 檔案並強制升格現代版
  useEffect(() => {
    fetch('/geo/twCounty2010.topo.json')
      .then((res) => {
        if (!res.ok) throw new Error("找不到本地圖資檔");
        return res.json();
      })
      .then((topo) => {
        // 將 TopoJSON 轉換為 GeoJSON
        const geo = topojson.feature(topo as any, (topo as any).objects.layer1) as any;
        
        // 🌟 魔法時空陣：攔截並把 2010 的舊行政區名稱升格成現代版
        geo.features.forEach((f: any) => {
          let name = f.properties.COUNTYNAME;
          
          // 升格與合併邏輯
          if (name === '臺北縣' || name === '台北縣') name = '新北市';
          if (name === '桃園縣') name = '桃園市';
          if (name === '臺中縣' || name === '台中縣') name = '臺中市';
          if (name === '臺南縣' || name === '台南縣') name = '臺南市';
          if (name === '高雄縣') name = '高雄市';
          
          // 覆寫回 properties
          f.properties.COUNTYNAME = name;
        });

        setGeoData(geo);
      })
      .catch((err) => console.error("圖資載入失敗 bruh:", err));
  }, []);

  // 進場：鎖拖曳 → 拉近轉正 → 開拖曳
  useEffect(() => {
    let cancelled = false;
    let rafId: number | null = null;

    const startTimer = window.setTimeout(() => {
      if (cancelled) return;

      const t0 = performance.now();

      const tick = (now: number) => {
        if (cancelled) return;

        const elapsed = now - t0;
        const raw = Math.min(elapsed / INTRO_DURATION, 1);
        const t = easeOutCubic(raw);

        setViewState({
          longitude: lerp(INTRO_VIEW_STATE.longitude, FINAL_VIEW_STATE.longitude, t),
          latitude: lerp(INTRO_VIEW_STATE.latitude, FINAL_VIEW_STATE.latitude, t),
          zoom: lerp(INTRO_VIEW_STATE.zoom, FINAL_VIEW_STATE.zoom, t),
          pitch: lerp(INTRO_VIEW_STATE.pitch, FINAL_VIEW_STATE.pitch, t),
          bearing: lerp(INTRO_VIEW_STATE.bearing, FINAL_VIEW_STATE.bearing, t),
        });

        if (raw < 1) {
          rafId = requestAnimationFrame(tick);
        } else {
          // 定位完成
          setViewState({ ...FINAL_VIEW_STATE });
          setIntroDone(true);
        }
      };

      rafId = requestAnimationFrame(tick);
    }, INTRO_DELAY);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, []);

  const onViewStateChange = useCallback(
    ({ viewState: vs }: any) => {
      // 進場期間完全不接受使用者拖曳
      if (!introDone) return;
      setViewState({
        longitude: vs.longitude,
        latitude: vs.latitude,
        zoom: vs.zoom,
        pitch: vs.pitch,
        bearing: vs.bearing,
      });
    },
    [introDone]
  );

  const layers = [
    new GeoJsonLayer({
      id: 'taiwan-extruded-layer',
      // 修改：將原本的 URL 換成轉換好的 geoData
      data: geoData,
      pickable: true,
      stroked: true,
      filled: true,
      extruded: true,
      wireframe: false,
      lineJointRounded: true,
      material: false,
      lineWidthMinPixels: 1.5,

      getLineColor: (d: any) => {
        const cityName = normalizeCityName(d.properties?.COUNTYNAME);
        const cityData = data[cityName];
        const value = cityData
          ? generation === '5G'
            ? cityData[0]
            : cityData[1]
          : 0;
        const brightness = Math.min(
          Math.round(80 + 175 * (value / (generation === '5G' ? 800 : 2500))),
          255
        );
        return [brightness, brightness, brightness, 180];
      },

      getElevation: (d: any) => {
        const cityName = normalizeCityName(d.properties?.COUNTYNAME);
        const cityData = data[cityName];
        if (!cityData) return 20;
        const val = generation === '5G' ? cityData[0] : cityData[1];
        return Math.max(val, 15);
      },
      elevationScale: 45,

      getFillColor: (d: any) => {
        const cityName = normalizeCityName(d.properties?.COUNTYNAME);
        const cityData = data[cityName];
        if (!cityData) return [35, 35, 38, 200];
        const value = generation === '5G' ? cityData[0] : cityData[1];
        const maxThreshold = generation === '5G' ? 800 : 2500;
        const ratio = Math.min(value / maxThreshold, 1);
        const colorVal = Math.round(40 + 215 * ratio);
        const alpha = Math.round(180 + 75 * ratio);
        return [colorVal, colorVal, colorVal, alpha];
      },

      autoHighlight: true,
      highlightColor: [255, 255, 255, 150],
      onHover: (info) => setHoverInfo(info),

      updateTriggers: {
        getElevation: [data, generation],
        getFillColor: [data, generation],
        getLineColor: [data, generation],
      },

      transitions: {
        getElevation: 600,
        getFillColor: 600,
        getLineColor: 600,
      },
    }),
  ];

  return (
    <div className="absolute inset-0 bg-[#020202]">
      <DeckGL
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        // 流程：進場中 false → 定位好後才開左鍵旋轉
        controller={
          introDone
            ? {
                dragMode: 'rotate',
                dragPan: false,
                scrollZoom: false,
                dragRotate: true,
                keyboard: false,
                touchRotate: true,
              }
            : false
        }
        layers={layers}
        style={{ touchAction: 'none' }}
      >
        {hoverInfo?.object && (
          <div
            className="absolute z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full pb-6 transition-all duration-75 ease-out"
            style={{ left: hoverInfo.x, top: hoverInfo.y }}
          >
            <div
              className="px-6 py-4 rounded-xl min-w-[180px]"
              style={{
                background: 'rgba(15, 15, 15, 0.65)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow:
                  '0 20px 40px -10px rgba(0,0,0,1), inset 0 1px 0 rgba(255,255,255,0.2)',
              }}
            >
              <div className="font-black text-2xl tracking-[0.2em] text-white text-center mb-2 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
                {hoverInfo.object.properties.COUNTYNAME}
              </div>
              <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-zinc-400/50 to-transparent mb-3" />
              <div className="flex flex-col items-center gap-1">
                <span className="text-zinc-400 uppercase text-[11px] tracking-widest font-bold">
                  {generation} Nodes
                </span>
                <span className="text-white text-3xl font-mono font-light tracking-wider drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                  {data[normalizeCityName(hoverInfo.object.properties.COUNTYNAME)]
                    ? generation === '5G'
                      ? data[normalizeCityName(hoverInfo.object.properties.COUNTYNAME)][0]
                      : data[normalizeCityName(hoverInfo.object.properties.COUNTYNAME)][1]
                    : '0'}
                </span>
              </div>
            </div>
          </div>
        )}
      </DeckGL>

      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_250px_rgba(0,0,0,1)]" />

      {introDone && (
        <div className="absolute bottom-8 right-8 text-right pointer-events-none z-10">
          <div className="text-zinc-500 text-[12px] font-mono uppercase tracking-widest flex items-center justify-end gap-2 mb-1">
            <span>Drag</span>
            <kbd className="font-sans border border-zinc-700 bg-zinc-800 px-2 py-1 rounded-md text-zinc-200 shadow-md">
              Left-Click
            </kbd>
            <span>to Rotate</span>
          </div>
          <div className="text-zinc-600 text-[10px] tracking-widest">
            ( 直接按住滑鼠左鍵即可旋轉視角 )
          </div>
        </div>
      )}
    </div>
  );
}