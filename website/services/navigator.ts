// services/navigator.ts

export interface WifiNode {
  id: string;
  name: string;
  provider: string;
  address: string;
  pos: [number, number]; // [經度, 緯度]
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8001';

// 🌟 API 回傳的 Index -> 縣市名稱
const COUNTY_INDEX_MAP: Record<string, string> = {
  "0": "南投縣", "1": "嘉義市", "2": "嘉義縣", "3": "基隆市",
  "4": "宜蘭縣", "5": "屏東縣", "6": "彰化縣", "7": "新北市",
  "8": "新竹市", "9": "新竹縣", "10": "桃園市", "11": "澎湖縣",
  "12": "台中市", "13": "台北市", "14": "台南市", "15": "台東縣",
  "16": "花蓮縣", "17": "苗栗縣", "18": "連江縣", "19": "金門縣",
  "20": "雲林縣", "21": "高雄市"
};

// 🌟 反向 Mapping，把前端選的中文轉成後端要的 Index (0-21)
const COUNTY_NAME_TO_INDEX: Record<string, number> = {
  "南投縣": 0, "南投": 0,
  "嘉義市": 1, "嘉義": 1,
  "嘉義縣": 2, 
  "基隆市": 3, "基隆": 3,
  "宜蘭縣": 4, "宜蘭": 4,
  "屏東縣": 5, "屏東": 5,
  "彰化縣": 6, "彰化": 6,
  "新北市": 7, "新北": 7, "臺北縣": 7, "台北縣": 7,
  "新竹市": 8, "新竹": 8,
  "新竹縣": 9, 
  "桃園市": 10, "桃園": 10, "桃園縣": 10,
  "澎湖縣": 11, "澎湖": 11,
  "臺中市": 12, "台中市": 12, "臺中": 12, "台中": 12, "臺中縣": 12, "台中縣": 12,
  "臺北市": 13, "台北市": 13, "臺北": 13, "台北": 13,
  "臺南市": 14, "台南市": 14, "臺南": 14, "台南": 14, "臺南縣": 14, "台南縣": 14,
  "臺東縣": 15, "台東縣": 15, "臺東": 15, "台東": 15,
  "花蓮縣": 16, "花蓮": 16,
  "苗栗縣": 17, "苗栗": 17,
  "連江縣": 18, "連江": 18, "馬祖": 18,
  "金門縣": 19, "金門": 19,
  "雲林縣": 20, "雲林": 20,
  "高雄市": 21, "高雄": 21, "高雄縣": 21,
};

/**
 * 1-1: 抓取全台灣縣市的公共 wifi 數量 (用於 Tier 1 的 3D 密度柱)
 */
export async function fetchAllCountyWifiCounts(): Promise<Record<string, number>> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/navigator/counties`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store'
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);

    const rawData = await response.json(); 
    const formattedData: Record<string, number> = {};
    for (const [indexStr, count] of Object.entries(rawData)) {
      const countyName = COUNTY_INDEX_MAP[indexStr];
      if (countyName) {
        formattedData[countyName] = Number(count);
      }
    }
    return formattedData;
  } catch (error) {
    console.error('Failed to fetch county wifi counts:', error);
    // 第一層絕對保底，就算 API 掛了也回傳空物件，確保 UI 還是畫得出 3D 輪廓
    return {};
  }
}

/**
 * 1-2: 抓取特定縣市裡面的每一個熱點經緯度與詳細資料 (用於 Tier 2 & Tier 3)
 */
export async function fetchWifiNodesByCounty(countyName: string): Promise<WifiNode[]> {
  try {
    const index = COUNTY_NAME_TO_INDEX[countyName];
    // 防呆：如果亂傳縣市名稱，直接回傳空陣列
    if (index === undefined) return [];

    const response = await fetch(`${BACKEND_URL}/api/navigator/hotspots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ county: index }),
      cache: 'no-store'
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);

    const rawData = await response.json();
    
    // 將後端資料映射到前端 DeckGL 需要的格式
    return rawData.map((item: any, i: number) => ({
      id: `${index}-${i}`,
      name: item.name || '未命名熱點',
      provider: item.source || '未知',
      address: item.address || '無詳細地址',
      pos: [Number(item.lng), Number(item.lat)]
    }));

  } catch (error) {
    console.error(`Failed to fetch wifi nodes for ${countyName}:`, error);
    // 第二層絕對保底，就算 API 噴錯也只是不顯示光點，地圖不會崩潰
    return []; 
  }
}