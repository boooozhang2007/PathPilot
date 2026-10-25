import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PathPilot AI · 职业成长规划',
  description: '以岗位证据为依据、以成长记录为基础、以可执行行动为核心的职业发展系统',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 深色模式防闪烁:渲染前按本机偏好设置 html class */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('pp_theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
