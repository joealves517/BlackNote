import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  publicDir: 'src/public',
  manifest: {
    name: 'BlackNote - AI Note & Web Clipper',
    description: 'Premium Notion-like side-panel note-taking app. Features built-in AI writing assistant, cloud sync, and instant access.',
    host_permissions: ['<all_urls>'],
    permissions: ['sidePanel', 'identity', 'activeTab', 'storage', 'tabCapture', 'offscreen'],
    optional_permissions: ['desktopCapture'],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
    },
    icons: {
      16: '/icon/16.png',
      48: '/icon/48.png',
      128: '/icon/128.png',
    },
    action: {
      default_icon: {
        16: '/icon/16.png',
        48: '/icon/48.png',
        128: '/icon/128.png',
      },
      default_title: 'Open BlackNote',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
