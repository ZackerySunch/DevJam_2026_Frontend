// services/density.ts

export type ProviderType = 'CHT' | 'FET' | 'TWM';
export type NetGeneration = '4G' | '5G';

// 第一層是時間 (例如 111/06), 第二層是城市, 第三層是 [5G數量, 4G數量]
export type DensityResponse = Record<string, Record<string, [number, number]>>;

// 模擬向後端 Fetch 資料
export async function fetchDensityData(provider: ProviderType): Promise<DensityResponse> {
  // 這裡你可以替換成實際的 fetch 邏輯 (例如: return fetch(`/api/density?provider=${provider}`).then(res => res.json()))
  // 以下是為了讓你能夠立刻看到畫面運作的假資料：
  
  return new Promise((resolve) => {
    setTimeout(() => {
      const mockData: DensityResponse = {
        '111/06': { '台北': [400, 1500], '新北': [350, 1800], '桃園': [200, 1200], '台中': [300, 1400], '台南': [150, 900], '高雄': [280, 1300] },
        '111/07': { '台北': [1450, 1500], '新北': [380, 1800], '桃園': [230, 1200], '台中': [330, 1400], '台南': [180, 900], '高雄': [310, 1300] },
        '111/08': { '台北': [500, 1500], '新北': [420, 1800], '桃園': [260, 1200], '台中': [360, 1400], '台南': [210, 900], '高雄': [350, 1300] },
        '111/09': { '台北': [600, 1500], '新北': [500, 1800], '桃園': [300, 1200], '台中': [400, 1400], '台南': [250, 900], '高雄': [400, 1300] },
      };
      
      // 依據不同供應商給一點隨機變化，讓切換時有感覺
      const multiplier = provider === 'CHT' ? 1 : provider === 'TWM' ? 0.8 : 0.7;
      
      const modifiedData: DensityResponse = {};
      Object.entries(mockData).forEach(([time, cities]) => {
        modifiedData[time] = {};
        Object.entries(cities).forEach(([city, counts]) => {
          modifiedData[time][city] = [
            Math.floor(counts[0] * multiplier),
            Math.floor(counts[1] * multiplier)
          ];
        });
      });

      resolve(modifiedData);
    }, 300); // 模擬網路延遲
  });
}