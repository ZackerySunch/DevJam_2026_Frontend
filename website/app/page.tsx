// app/page.tsx
import HeroSection from '@/components/home_page/HeroSection';
import AgentSection from '@/components/home_page/AgentSection';

export default function Home() {
  return (
    <main className="w-full min-h-screen bg-black">
      {/* 第一個區塊：科技風 Logo 推移與 Widgets */}
      <HeroSection />

      {/* 第二個區塊：AI Agent（左 2/3 地圖 · 右 1/3 chatbox） */}
      <AgentSection />
    </main>
  );
}