// components/signal_page/SignalMap.tsx
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer, ArcLayer, ScatterplotLayer } from '@deck.gl/layers';
import * as topojson from 'topojson-client';
import { SignalSnapshot, SignalFlow } from '@/services/signal';

const COUNTY_GEOJSON_URL = '/geo/twCounty2010.topo.json';

const INITIAL_VIEW = {
  longitude: 120.982,
  latitude: 23.6,
  zoom: 6.8,
  pitch: 0,
  bearing: 0,
};

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

/** 依流量把 intensity 映射成弧線寬度 / 透明度 */
function intensityToWidth(intensity: number) {
  return 1.2 + (intensity / 100) * 6;
}
function intensityToAlpha(intensity: number) {
  return Math.round(60 + (intensity / 100) * 160);
}

interface Props {
  snapshot: SignalSnapshot | null;
}

export default function SignalMap({ snapshot }: Props) {
  const [countyGeo, setCountyGeo] = useState<any>(null);
  const [viewState, setViewState] = useState(INITIAL_VIEW);
  const [hoverInfo, setHoverInfo] = useState<any>(null);

  // 平滑過渡：保留上一幀 flows，做淡出／淡入感
  const [displayFlows, setDisplayFlows] = useState<SignalFlow[]>([]);
  const prevFlowsRef = useRef<SignalFlow[]>([]);

  useEffect(() => {
    loadFeatureCollection(COUNTY_GEOJSON_URL).then((g) => g && setCountyGeo(g));
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    // 簡單策略：直接換新資料；之後可做 cross-fade
    prevFlowsRef.current = displayFlows;
    setDisplayFlows(snapshot.flows);
  }, [snapshot]);

  const onViewStateChange = useCallback(({ viewState: vs }: any) => {
    setViewState({
      ...vs,
      pitch: 0, // 強制平面
      bearing: vs.bearing ?? 0,
    });
  }, []);

  // 端點（起點 + 終點）小點
  const endpoints = useMemo(() => {
    const pts: { pos: [number, number]; kind: 'source' | 'target'; intensity: number }[] = [];
    for (const f of displayFlows) {
      pts.push({ pos: f.source, kind: 'source', intensity: f.intensity });
      pts.push({ pos: f.target, kind: 'target', intensity: f.intensity });
    }
    return pts;
  }, [displayFlows]);

  const layers = useMemo(() => {
    const result: any[] = [];

    // 平面台灣 + 縣市邊框
    result.push(
      new GeoJsonLayer({
        id: 'taiwan-flat',
        data: countyGeo || EMPTY_GEOJSON,
        pickable: false,
        stroked: true,
        filled: true,
        extruded: false,
        lineWidthMinPixels: 1.5,
        getLineColor: [80, 160, 220, 140],
        getFillColor: [12, 20, 36, 180],
        getLineWidth: 1,
      })
    );

    // 流量弧線
    result.push(
      new ArcLayer<SignalFlow>({
        id: 'signal-arcs',
        data: displayFlows,
        pickable: true,
        getSourcePosition: (d) => d.source,
        getTargetPosition: (d) => d.target,
        getSourceColor: (d) => [40, 180, 255, intensityToAlpha(d.intensity)],
        getTargetColor: (d) => [255, 120, 80, intensityToAlpha(d.intensity)],
        getWidth: (d) => intensityToWidth(d.intensity),
        greatCircle: true,
        numSegments: 40,
        onHover: (info) => setHoverInfo(info.object ? info : null),
        updateTriggers: {
          getWidth: displayFlows,
          getSourceColor: displayFlows,
          getTargetColor: displayFlows,
        },
      })
    );

    // 端點
    result.push(
      new ScatterplotLayer({
        id: 'signal-endpoints',
        data: endpoints,
        pickable: false,
        stroked: false,
        filled: true,
        radiusUnits: 'pixels',
        getPosition: (d: any) => d.pos,
        getRadius: (d: any) => 2 + (d.intensity / 100) * 4,
        getFillColor: (d: any) =>
          d.kind === 'source' ? [40, 200, 255, 220] : [255, 140, 90, 220],
        updateTriggers: {
          getRadius: endpoints,
          getFillColor: endpoints,
        },
      })
    );

    return result;
  }, [countyGeo, displayFlows, endpoints]);

  return (
    <div className="absolute inset-0 bg-[#020202]">
      <DeckGL
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        controller={true}
        layers={layers}
      >
        {hoverInfo?.object && (
          <div
            className="absolute z-50 pointer-events-none -translate-x-1/2 -translate-y-full pb-3"
            style={{ left: hoverInfo.x, top: hoverInfo.y }}
          >
            <div
              className="px-4 py-3 rounded-xl min-w-[200px] text-center"
              style={{
                background: 'rgba(12,18,28,0.95)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(80,180,255,0.4)',
                boxShadow: '0 16px 32px rgba(0,0,0,0.8)',
              }}
            >
              <div className="text-white text-sm font-bold">
                {hoverInfo.object.sourceCounty}
                <span className="text-zinc-500 mx-2">→</span>
                {hoverInfo.object.targetCounty}
              </div>
              <div className="text-cyan-300 text-lg font-mono mt-1">
                {hoverInfo.object.intensity}
              </div>
              <div className="text-zinc-500 text-[10px] mt-0.5">流量強度</div>
            </div>
          </div>
        )}
      </DeckGL>

      {/* 暗角 */}
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_180px_rgba(0,0,0,0.85)] z-10" />
    </div>
  );
}