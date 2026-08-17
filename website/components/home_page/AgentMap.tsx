// components/home_page/AgentMap.tsx
'use client';

import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { FlyToInterpolator } from '@deck.gl/core';
import * as topojson from 'topojson-client';
import type { MapState, HighlightTone, MapMarker } from '@/services/agent';

const COUNTY_GEOJSON_URL = '/geo/twCounty2010.topo.json';

/** 圖資欄位名不一定，全部試一輪 */
const NAME_KEYS = ['COUNTYNAME', 'countyname', 'County', 'NAME_2', 'name', 'C_Name'];

function countyNameOf(feature: any): string {
  const p = feature?.properties ?? {};
  for (const k of NAME_KEYS) {
    if (typeof p[k] === 'string' && p[k].trim()) return p[k].replace(/臺/g, '台');
  }
  return '未知區域';
}

const TONE_RGB: Record<HighlightTone, [number, number, number]> = {
  accent: [16, 185, 129],
  info: [80, 180, 255],
  warn: [251, 146, 60],
  danger: [244, 63, 94],
};

const BASE_FILL: [number, number, number, number] = [12, 18, 30, 210];
const BASE_LINE: [number, number, number, number] = [70, 140, 200, 100];

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
  /** 唯一真相，由 useAgentChat 提供 */
  map: MapState;
  /** 使用者自己點縣市 */
  onSelectCounty?: (county: string | null) => void;
}

function AgentMapInner({ map, onSelectCounty }: Props) {
  const [geo, setGeo] = useState<any>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [viewState, setViewState] = useState<any>({
    longitude: map.view.longitude,
    latitude: map.view.latitude,
    zoom: map.view.zoom,
    pitch: 0,
    bearing: 0,
  });

  const lastNonce = useRef(map.view.nonce);

  useEffect(() => {
    loadFeatureCollection(COUNTY_GEOJSON_URL).then((g) => g && setGeo(g));
  }, []);

  // nonce 變了才飛，使用者自己拖曳不會被拉回去
  useEffect(() => {
    if (map.view.nonce === lastNonce.current) return;
    lastNonce.current = map.view.nonce;
    setViewState({
      longitude: map.view.longitude,
      latitude: map.view.latitude,
      zoom: map.view.zoom,
      pitch: 0,
      bearing: 0,
      transitionDuration: 900,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }),
    });
  }, [map.view]);

  const onViewStateChange = useCallback(({ viewState: vs }: any) => {
    setViewState({
      longitude: vs.longitude,
      latitude: vs.latitude,
      zoom: Math.min(10, Math.max(5.8, vs.zoom)),
      pitch: 0,
      bearing: 0,
    });
  }, []);

  const layers = useMemo(() => {
    const list: any[] = [];

    if (geo) {
      list.push(
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
            const tone = map.highlights[n];
            if (tone) {
              const [r, g, b] = TONE_RGB[tone];
              return [r, g, b, n === map.focus ? 110 : 75];
            }
            if (n === hovered) return [80, 180, 255, 55];
            return BASE_FILL;
          },
          getLineColor: (f: any) => {
            const n = countyNameOf(f);
            const tone = map.highlights[n];
            if (tone) {
              const [r, g, b] = TONE_RGB[tone];
              return [r, g, b, 220];
            }
            if (n === hovered) return [125, 211, 252, 190];
            return BASE_LINE;
          },
          onHover: ({ object }: any) =>
            setHovered(object ? countyNameOf(object) : null),
          onClick: ({ object }: any) => {
            if (!onSelectCounty) return;
            if (!object) return onSelectCounty(null);
            const n = countyNameOf(object);
            onSelectCounty(n === map.focus ? null : n);
          },
          updateTriggers: {
            getFillColor: [map.highlights, map.focus, hovered],
            getLineColor: [map.highlights, map.focus, hovered],
          },
          transitions: { getFillColor: 200, getLineColor: 200 },
        })
      );
    }

    if (map.markers.length) {
      list.push(
        new ScatterplotLayer<MapMarker>({
          id: 'agent-markers-glow',
          data: map.markers,
          pickable: false,
          stroked: false,
          filled: true,
          radiusUnits: 'pixels',
          getPosition: (d) => [d.longitude, d.latitude],
          getRadius: (d) => 6 + (d.level ?? 3) * 2.5,
          getFillColor: (d) => {
            const [r, g, b] = TONE_RGB[d.tone ?? 'accent'];
            return [r, g, b, 55];
          },
        }),
        new ScatterplotLayer<MapMarker>({
          id: 'agent-markers',
          data: map.markers,
          pickable: false,
          stroked: true,
          filled: true,
          radiusUnits: 'pixels',
          lineWidthUnits: 'pixels',
          getPosition: (d) => [d.longitude, d.latitude],
          getRadius: (d) => 2.5 + (d.level ?? 3) * 0.9,
          getFillColor: (d) => {
            const [r, g, b] = TONE_RGB[d.tone ?? 'accent'];
            return [r, g, b, 235];
          },
          getLineColor: [255, 255, 255, 180],
          getLineWidth: 0.8,
        }),
        new TextLayer<MapMarker>({
          id: 'agent-marker-labels',
          data: map.markers,
          pickable: false,
          getPosition: (d) => [d.longitude, d.latitude],
          getText: (d) => d.name,
          getSize: 11,
          sizeUnits: 'pixels',
          getColor: [228, 228, 231, 220],
          getPixelOffset: [0, -16],
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          outlineWidth: 2,
          outlineColor: [0, 0, 0, 255],
          fontSettings: { sdf: true },
        })
      );
    }

    return list;
  }, [geo, map.highlights, map.focus, map.markers, hovered, onSelectCounty]);

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

      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_140px_rgba(0,0,0,0.9)]" />

      {/* 左上：目前看的是哪裡 */}
      <div className="absolute top-5 left-5 pointer-events-none">
        <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-600">
          Taiwan
        </div>
        <div className="mt-1 text-sm text-zinc-300">
          {map.focus ?? hovered ?? '點選任一縣市，或直接問右邊的 Agent'}
        </div>
      </div>

      {/* 左下：Agent 留下的說明 */}
      {map.note && (
        <div className="absolute bottom-5 left-5 max-w-[70%] pointer-events-none">
          <div className="px-3 py-2 rounded-xl text-xs text-zinc-300 bg-zinc-950/80 border border-zinc-800 backdrop-blur-md">
            {map.note}
          </div>
        </div>
      )}

      {/* 右下：清除 */}
      {(map.focus || Object.keys(map.highlights).length > 0) && onSelectCounty && (
        <button
          onClick={() => onSelectCounty(null)}
          className="absolute bottom-5 right-5 px-3 py-1.5 rounded-lg text-xs text-emerald-300 border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
        >
          清除
        </button>
      )}
    </div>
  );
}

export default memo(AgentMapInner);