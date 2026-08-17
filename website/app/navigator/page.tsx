// app/navigator/page.tsx
import NavigatorContainer from '@/components/navigator_page/NavigatorContainer';

export const metadata = {
  title: '公共網路導航 | Navigator | HOLYPING',
  description: '精確查詢全台公共網路熱點，支援定位與關鍵字搜尋。',
};

export default function NavigatorPage() {
  return <NavigatorContainer />;
}