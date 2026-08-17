// components/home_page/AgentMap.tsx
'use client';

import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer } from '@deck.gl/layers';
import * as topojson from 'topojson-client';

const COUNTY_GEOJSON_URL = '/geo/twCounty2010.topo.json';

const INITIAL_VIEW = {
  longitude: 120.982,
  latitude: 23.75,
  zoom: 6.6,
  pitch: 0,
  bearing: 0,
};

/** 不同來源的圖資欄位名不一樣，全部試一輪 */
const NAME_KEYS = ['COUNTYNAME', 'countyname', 'County', 'NAME_2', 'name', 'C_Name'];

function countyNameOf(feature: any): string {
  const p = feature?.properties ?? {};
  for (const k of NAME_KEYS) {
    if (typeof p[k] === 'string' && p[k].trim()) return p[k].replace(/臺/g, '台');
  }
  return '未知區域';
}

async function loadFeatureCollection(url: string) {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
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

interface Props {
  /** 目前選到的縣市（由外層跟 chatbox 共用） */
  selected: string | null;
  onSelect: (county: string | null) => void;
}

function AgentMapInner({ selected, onSelect }: Props) {
  const [geo, setGeo] = useState<any>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [viewState, setViewState] = useState(INITIAL_VIEW);

  useEffect(() => {
    loadFeatureCollection(COUNTY_GEOJSON_URL).then((g) => g && setGeo(g));
  }, []);

  const onViewStateChange = useCallback(({ viewState: vs }: any) => {
    setViewState({
      longitude: vs.longitude,
      latitude: vs.latitude,
      zoom: Math.min(9, Math.max(5.8, vs.zoom)),
      pitch: 0,
      bearing: 0,
    });
  }, []);

  const layers = useMemo(() => {
    if (!geo) return [];
    return [
      new GeoJsonLayer({
        id: 'tw-counties',
        data: geo,
        pickable: true,
        stroked: true,
        filled: true,
        extruded: false,
        lineWidthMinPixels: 1,
        getLineWidth: 1,
        getFillColor: (f: any) => {
          const n = countyNameOf(f);
          if (n === selected) return [16, 185, 129, 90];
          if (n === hovered) return [80, 180, 255, 60];
          return [12, 18, 30, 210];
        },
        getLineColor: (f: any) => {
          const n = countyNameOf(f);
          if (n === selected) return [52, 211, 153, 220];
          if (n === hovered) return [125, 211, 252, 200];
          return [70, 140, 200, 110];
        },
        onHover: ({ object }: any) =>
          setHovered(object ? countyNameOf(object) : null),
        onClick: ({ object }: any) => {
          if (!object) return;
          const n = countyNameOf(object);
          onSelect(n === selected ? null : n);
        },
        updateTriggers: {
          getFillColor: [selected, hovered],
          getLineColor: [selected, hovered],
        },
        transitions: { getFillColor: 180, getLineColor: 180 },
      }),
    ];
  }, [geo, selected, hovered, onSelect]);

  return (
    <div className="absolute inset-0 bg-[#04070c]">
      <DeckGL
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        controller={{
          dragPan: true,
          dragRotate: false,
          scrollZoom: { smooth: true },
          touchRotate: false,
          doubleClickZoom: false,
          keyboard: false,
        }}
        layers={layers}
        useDevicePixels={1}
        getCursor={({ isHovering }) => (isHovering ? 'pointer' : 'grab')}
      />

      {/* 邊角暈影 */}
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_140px_rgba(0,0,0,0.9)]" />

      {/* 左上角提示 */}
      <div className="absolute top-5 left-5 pointer-events-none">
        <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-600">
          Taiwan
        </div>
        <div className="mt-1 text-sm text-zinc-300">
          {selected ?? hovered ?? '點選任一縣市'}
        </div>
      </div>

      {/* 右下角清除 */}
      {selected && (
        <button
          onClick={() => onSelect(null)}
          className="absolute bottom-5 right-5 px-3 py-1.5 rounded-lg text-xs text-emerald-300 border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
        >
          清除 {selected}
        </button>
      )}
    </div>
  );
}

export default memo(AgentMapInner);