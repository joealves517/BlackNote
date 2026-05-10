import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  publicDir: 'src/public',
  manifest: {
    name: 'BlackNote - AI Note & Web Clipper',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7nj+WgQ/eySyQuei+75xvlYKJNytg9XT9U/m3QoaTHQ3LUB8GRIV52xtKeWMMquLM7fNw1hiyQBeCeDx6NEbZqcYQnGHAltkXLLEa0kKs8XzDMGSMgY5VJLmjU/lzj7PIu3ilGqaYL0xa61zp0IdLKOFZN4z2IEDDFX2A3E/YQ/XPREEy1U0qy6qB13YcnkV2h/RWMcZjSmZNS7mWLhiEHgtBOlCu8COOrekxvh1nOh4pFFZoGw9GWrjIBJ3EmuTPhePtQ4PH9jpRk0LAlIEOSR6pdHvV5nmUsjxtIiPM2atxJvESsqVtYMsy+U2QtrUDA1MoravkkZFhasK8726owIDAQAB',
    description: 'Premium Notion-like side-panel note-taking app. Features built-in AI writing assistant, cloud sync, and instant access.',
    host_permissions: ['<all_urls>'],
    permissions: ['sidePanel', 'identity', 'activeTab', 'storage', 'tabCapture', 'offscreen', 'desktopCapture'],
    oauth2: {
      client_id: '676582412453-64mpkmbnplhpca5ljs0uc1vsrejj0a67.apps.googleusercontent.com',
      scopes: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
    },
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
