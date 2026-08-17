// components/home_page/HeroSection.tsx
'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
// ★ 新增：引入 Next.js 的 useRouter 來處理路由跳轉 ★
import { useRouter } from 'next/navigation';

export default function HeroSection() {
  const [showWidgets, setShowWidgets] = useState(false);

  // ★ 新增：初始化 router ★
  const router = useRouter();

  // 影片輪播狀態
  const videos = ['/video/home1.mp4', '/video/home2.mp4', '/video/home3.mp4'];
  const [currentVideoIndex, setCurrentVideoIndex] = useState<number | null>(null);

  // Logo 文字與狀態
  const logoText = "holyping".split("");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // 主 Logo 效果參數設定
  const baseScale = 1;
  const hoverScale = 1.3;
  const neighborScale = 1.1;
  const pushOffset = 22;

  useEffect(() => {
    // 初始載入時，隨機決定第一支播放的影片
    setCurrentVideoIndex(Math.floor(Math.random() * videos.length));

    // 1.5 秒後顯示底部 Widgets、Logo 上移，並讓背景影片漸漸浮現
    const timer = setTimeout(() => {
      setShowWidgets(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [videos.length]);

  const handleVideoEnd = () => {
    // 影片結束時，隨機選取下一支影片
    setCurrentVideoIndex((prev) => {
      if (prev === null) return 0;
      if (videos.length <= 1) return prev; // 只有一支影片就不切換

      let nextIndex = Math.floor(Math.random() * videos.length);
      // 確保抽出來的影片跟上一支不同，才能有切換的視覺效果
      while (nextIndex === prev) {
        nextIndex = Math.floor(Math.random() * videos.length);
      }
      return nextIndex;
    });
  };

  const widgets = [
    { title: 'Signal', desc: 'Real-time base-station load & traffic flow.' },
    { title: 'Uplink', desc: 'Taiwan\'s international connectivity, live.' },
    { title: 'Navigator', desc: 'Ask the map. It flies you there.' },
    { title: 'Density', desc: 'Latest year of 5G, visualized.' }
  ];

  return (
    <section className="relative flex flex-col items-center justify-center min-h-screen bg-black text-white overflow-hidden font-mono">

      {/* 1. 多影片輪播背景與暗色遮罩 */}
      <div className="absolute inset-0 z-0 w-full h-full pointer-events-none bg-black">
        <div className="absolute inset-0 bg-black/75 z-10 transition-opacity duration-1000" />

        {/* 確保隨機 index 決定後才渲染 video */}
        {currentVideoIndex !== null && (
          <video
            key={videos[currentVideoIndex]}
            autoPlay
            muted
            playsInline
            onEnded={handleVideoEnd}
            className={`absolute inset-0 w-full h-full object-cover z-0 grayscale transition-opacity duration-[2000ms] ease-in-out ${showWidgets ? 'opacity-50' : 'opacity-0'
              }`}
          >
            <source src={videos[currentVideoIndex]} type="video/mp4" />
          </video>
        )}
      </div>

      {/* 2. Logo 區塊與副標題 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{
          opacity: 1,
          y: showWidgets ? -80 : 0
        }}
        transition={{ duration: 1, ease: "easeInOut" }}
        className="relative z-20 flex flex-col items-center cursor-default"
      >
        {/* 主 Logo 容器 */}
        <div
          className="flex items-end mb-6 px-12 select-none"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {logoText.map((char, index) => {
            let offsetX = 0;
            if (hoveredIndex !== null) {
              const distance = index - hoveredIndex;
              if (distance > 0) offsetX = pushOffset;
              else if (distance < 0) offsetX = -pushOffset;
            }

            let targetScale = baseScale;
            if (hoveredIndex !== null) {
              if (index === hoveredIndex) targetScale = hoverScale;
              else if (Math.abs(index - hoveredIndex) === 1) targetScale = neighborScale;
            }

            const isSelf = hoveredIndex === index;
            const isNeighbor = hoveredIndex !== null && Math.abs(index - hoveredIndex) === 1;

            return (
              <motion.span
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  x: offsetX,
                  scale: targetScale,
                  color: isSelf ? '#ffffff' : (isNeighbor ? '#a1a1aa' : '#52525b'),
                  textShadow: isSelf
                    ? "0px 0px 20px rgba(255, 255, 255, 0.7), 0px 0px 40px rgba(255, 255, 255, 0.3)"
                    : isNeighbor
                      ? "0px 0px 10px rgba(255, 255, 255, 0.2)"
                      : "0px 0px 0px rgba(255, 255, 255, 0)",
                }}
                transition={{
                  x: { type: "spring", stiffness: 400, damping: 30 },
                  scale: { type: "spring", stiffness: 400, damping: 30 },
                  color: { duration: 0.15 },
                  textShadow: { duration: 0.2 }
                }}
                onMouseEnter={() => setHoveredIndex(index)}
                className="
                  inline-block uppercase cursor-crosshair font-black
                  text-7xl md:text-9xl tracking-[0.15em] md:tracking-[0.2em]
                  origin-center will-change-transform
                "
                style={{ lineHeight: 1 }}
              >
                {char}
              </motion.span>
            );
          })}
        </div>

        {/* 平台敘述副標題 (柔光點亮逐字效果) */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1 }}
          className="flex justify-between w-full px-12 text-sm md:text-base text-zinc-500 uppercase font-medium"
        >
          {"全方位網路基礎設施整合與公開資訊平台".split("").map((char, index) => (
            <motion.span
              key={index}
              whileHover={{
                y: -4,
                color: "#ffffff",
                scale: 1.15,
                textShadow: "0px 0px 12px rgba(255, 255, 255, 0.6)"
              }}
              transition={{ type: "spring", stiffness: 500, damping: 15 }}
              className="inline-block cursor-default transition-colors duration-200"
            >
              {char}
            </motion.span>
          ))}
        </motion.div>
      </motion.div>

      {/* 3. 極簡 Dashboard Widget */}
      {showWidgets && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", staggerChildren: 0.15 }}
          className="absolute bottom-12 w-full max-w-6xl px-6 z-20 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6"
        >
          {widgets.map((widget, index) => (
            <motion.button
              key={index}
              // ★ 新增：點擊時觸發路由跳轉，利用 toLowerCase() 將 Title 轉為小寫路由 ★
              onClick={() => router.push(`/${widget.title.toLowerCase()}`)}
              whileHover={{ y: -4, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="
                group relative flex flex-col justify-between p-6 text-left h-36
                bg-zinc-950/40 backdrop-blur-md 
                border border-zinc-800/80 rounded-xl overflow-hidden
                transition-all duration-300 ease-out
                hover:bg-zinc-900/60 hover:border-zinc-500 hover:shadow-[0_8px_30px_rgba(0,0,0,0.6)]
                focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400
              "
            >
              <div className="absolute top-0 left-0 w-8 h-[2px] bg-zinc-800 group-hover:bg-zinc-300 group-focus:bg-zinc-300 transition-colors duration-300" />

              <div className="flex flex-col">
                <div className="flex flex-wrap text-xl md:text-2xl font-bold text-zinc-200 group-hover:text-white group-focus:text-white mb-2">
                  {widget.title.split("").map((char, charIdx) => (
                    <motion.span
                      key={charIdx}
                      whileHover={{ y: -3, color: "#ffffff", scale: 1.1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 10 }}
                      className="inline-block transition-colors duration-200 cursor-default"
                    >
                      {char === " " ? "\u00A0" : char}
                    </motion.span>
                  ))}
                </div>

                <div className="flex flex-wrap leading-relaxed text-[10px] md:text-xs text-zinc-500 group-hover:text-zinc-400 group-focus:text-zinc-400">
                  {widget.desc.split(" ").map((word, wordIdx) => (
                    <span key={wordIdx} className="inline-flex mr-1 mb-1">
                      {word.split("").map((char, charIdx) => (
                        <motion.span
                          key={charIdx}
                          whileHover={{ y: -2, color: "#ffffff", scale: 1.15 }}
                          transition={{ type: "spring", stiffness: 500, damping: 15 }}
                          className="inline-block transition-colors duration-200 cursor-default"
                        >
                          {char}
                        </motion.span>
                      ))}
                    </span>
                  ))}
                </div>
              </div>

              <div className="w-full flex justify-end items-center pt-2">
                <svg
                  className="w-5 h-5 text-zinc-600 group-hover:text-white group-focus:text-white transform group-hover:translate-x-1 group-focus:translate-x-1 transition-all duration-300 ease-out"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </motion.button>
          ))}
        </motion.div>
      )}
    </section>
  );
}