// app/signal/page.tsx
import SignalContainer from '@/components/signal_page/SignalContainer';

export const metadata = {
  title: 'Signal Flow | HOLYPING',
  description: '台灣基地台即時流量流動視覺化',
};

export default function SignalPage() {
  return <SignalContainer />;
}