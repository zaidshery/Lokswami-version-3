import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Lokswami',
    short_name: 'Lokswami',
    description: 'Lokswami news platform',
    id: '/main',
    start_url: '/main',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    orientation: 'portrait',
    lang: 'hi-IN',
    background_color: '#111111',
    theme_color: '#e72129',
    categories: ['news', 'magazines', 'education'],
    icons: [
      {
        src: '/logo-app-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logo-app-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/logo-app-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logo-app-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Latest News',
        short_name: 'Latest',
        description: 'Open the latest news feed',
        url: '/main/latest',
        icons: [{ src: '/logo-app-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'E-Paper',
        short_name: 'E-Paper',
        description: "Open today's e-paper",
        url: '/main/epaper',
        icons: [{ src: '/logo-app-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Lokswami Swipe',
        short_name: 'Swipe',
        description: 'Open Lokswami Swipe news',
        url: '/main/videos',
        icons: [{ src: '/logo-app-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
