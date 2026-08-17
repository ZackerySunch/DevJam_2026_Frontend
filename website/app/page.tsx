// app/page.tsx
import HeroSection from '@/components/home_page/HeroSection';

export default function Home() {
  return (
    <main className="w-full min-h-screen bg-black">
      
      {/* 獨立 Component：第一個區塊 (科技風 Logo 推移與 Widgets) */}
      <HeroSection />

    </main>
  );
}