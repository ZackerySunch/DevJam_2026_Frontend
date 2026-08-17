// services/eventService.ts

export interface NetworkEvent {
  title: string;
  decs: string;
  time: string; // 根據後端可能是 ISO 字串
  lable: 1 | 2 | 3 | 4;
}

export async function getLatestEvents(): Promise<NetworkEvent[]> {
  // 這裡替換成你實際的後端 API 網址
  // const res = await fetch('https://your-backend.com/home_page/get_events', { cache: 'no-store' });
  // if (!res.ok) throw new Error('Failed to fetch events');
  // return res.json();

  // 開發初期先回傳 Mock 假資料，確認畫面排版
  return [
    {
      title: "APG 海纜發生斷訊",
      decs: "偵測到由台灣連往東京之 APG 核心海纜發生異常，延遲飆升至 250ms。",
      time: new Date().toISOString(),
      lable: 2,
    },
    {
      title: "信義區跨年人潮壅塞",
      decs: "該區三大電信 5G 基地台乘載量超過 95%，出現嚴重封包掉包。",
      time: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15分鐘前
      lable: 1,
    },
    {
      title: "Taipei Free 節點異常",
      decs: "松山線捷運沿線 15 個公共 Wi-Fi 熱點失去連線回應。",
      time: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      lable: 3,
    },
    {
      title: "年度基地台密度更新",
      decs: "2026年最新 5G 基地台覆蓋歷史圖資已匯入系統就緒。",
      time: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      lable: 4,
    },
  ];
}