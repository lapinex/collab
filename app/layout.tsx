import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import '../styles/globals.css';
import { Providers } from './providers';
import { DesktopWindowControls } from '@/components/desktop/DesktopWindowControls';
// Task 3: Initialize LiveKit cleanup on server start
import '@/lib/livekit/init';

const inter = Inter({ 
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
});

export const viewport: Viewport = {
  themeColor: '#000000',
};

export const metadata: Metadata = {
  title: 'Collab - Private Messenger',
  description: 'Private messenger for limited user base',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Корневой layout: Next.js должен добавить <!DOCTYPE html>; при его отсутствии в ответе — баг standalone/стриминга
  return (
    <html lang="en" className="dark" data-theme="collab" suppressHydrationWarning>
      <body className={`${inter.className} ${inter.variable} antialiased`} suppressHydrationWarning>
        <Providers>
          <DesktopWindowControls />
          {children}
        </Providers>
      </body>
    </html>
  );
}
