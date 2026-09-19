import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sanjeevani Voice',
    short_name: 'Sanjeevani',
    description: 'Speak naturally. Get the right next step.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f2eb',
    theme_color: '#2d6a5c',
    lang: 'en-IN',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
