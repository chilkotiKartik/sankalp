import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppProvider } from '@/components/providers/app-provider';
import { ServiceWorker } from '@/components/providers/service-worker';
import { ToastProvider } from '@/components/providers/toast-provider';
import { PREFERENCES_BOOT_SCRIPT } from '@/lib/storage';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sanjeevani — speak naturally, get the right next step',
  description:
    'A voice-first medical navigation assistant for India. Describe how you feel in Hindi, English or Hinglish and find the right care nearby. Not a doctor — in an emergency, call 112.',
  applicationName: 'Sanjeevani Voice',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Sanjeevani', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f2eb' },
    { media: '(prefers-color-scheme: dark)', color: '#111615' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_BOOT_SCRIPT }} />
      </head>
      <body>
        <AppProvider>
          <ToastProvider>{children}</ToastProvider>
        </AppProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
