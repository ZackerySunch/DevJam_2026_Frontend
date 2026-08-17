// services/density.ts

export type ProviderType = 'CHT' | 'FET' | 'TWM';
export type NetGeneration = '4G' | '5G';

// 第一層是時間 (例如 111/06), 第二層是城市, 第三層是 [5G數量, 4G數量]
export type DensityResponse = Record<string, Record<string, [number, number]>>;

// 從環境變數取得後端 URL，若無則預設為 localhost:3000
// (Next.js Client Component 需要加上 NEXT_PUBLIC_ 前綴)
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8001';

/**
 * 向後端 Fetch 基地台密度資料
 */
export async function fetchDensityData(provider: ProviderType): Promise<DensityResponse> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/density/provider`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // 依照你的規格，傳送 {"provider": "CHT"}
      body: JSON.stringify({ provider }),
      
      // 取消快取，確保每次拿到最新資料 (可視需求改為 'force-cache' 或設定 revalidate)
      cache: 'no-store' 
    });

    if (!response.ok) {
      throw new Error(`API 回應錯誤，狀態碼: ${response.status}`);
    }

    const data: DensityResponse = await response.json();
    return data;
    
  } catch (error) {
    console.error('獲取基地台資料失敗:', error);
    // 發生錯誤時回傳空物件，避免前端畫面崩潰
    return {};
  }
}