// app/density/page.tsx
import DensityContainer from '@/components/density_page/DensityContainer';

export const metadata = {
  title: '基地台密度地圖 | Density Map',
  description: '台灣各電信業者基地台分佈與密度視覺化',
};

export default function DensityPage() {
  return <DensityContainer />;
}