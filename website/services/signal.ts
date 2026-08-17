// services/signal.ts

/** 單一流量：起點 → 終點 */
export interface SignalFlow {
  id: string;
  /** [lng, lat] */
  source: [number, number];
  /** [lng, lat] */
  target: [number, number];
  /** 流量權重 1 ~ 100 */
  intensity: number;
  sourceCounty: string;
  targetCounty: string;
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

/** 縣市代表座標（與 Navigator 對齊） */
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

const COUNTIES = Object.keys(COUNTY_COORDS);

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pickCounty(exclude?: string) {
  let c = COUNTIES[Math.floor(Math.random() * COUNTIES.length)];
  while (exclude && c === exclude) {
    c = COUNTIES[Math.floor(Math.random() * COUNTIES.length)];
  }
  return c;
}

/**
 * 模擬一幀即時流量
 * 之後換成：fetch('/api/signal/live').then(r => r.json())
 */
export async function fetchSignalSnapshot(): Promise<SignalSnapshot> {
  // 模擬網路延遲
  await new Promise((r) => setTimeout(r, 40 + Math.random() * 80));

  const flowCount = 18 + Math.floor(Math.random() * 22); // 18~40 條
  const flows: SignalFlow[] = [];
  const agg = new Map<string, { inbound: number; outbound: number }>();

  for (const c of COUNTIES) {
    agg.set(c, { inbound: 0, outbound: 0 });
  }

  for (let i = 0; i < flowCount; i++) {
    const sourceCounty = pickCounty();
    const targetCounty = pickCounty(sourceCounty);
    const intensity = Math.round(rand(8, 100));

    const src = COUNTY_COORDS[sourceCounty];
    const tgt = COUNTY_COORDS[targetCounty];

    // 在縣市中心附近加一點抖動，比較像真實基地台座標
    const source: [number, number] = [
      src[0] + rand(-0.12, 0.12),
      src[1] + rand(-0.1, 0.1),
    ];
    const target: [number, number] = [
      tgt[0] + rand(-0.12, 0.12),
      tgt[1] + rand(-0.1, 0.1),
    ];

    flows.push({
      id: `f-${Date.now()}-${i}`,
      source,
      target,
      intensity,
      sourceCounty,
      targetCounty,
    });

    const s = agg.get(sourceCounty)!;
    const t = agg.get(targetCounty)!;
    s.outbound += intensity;
    t.inbound += intensity;
  }

  const byCounty: CountyTraffic[] = COUNTIES.map((county) => {
    const { inbound, outbound } = agg.get(county)!;
    return { county, inbound, outbound, total: inbound + outbound };
  }).sort((a, b) => b.total - a.total);

  return {
    timestamp: Date.now(),
    flows,
    byCounty,
  };
}