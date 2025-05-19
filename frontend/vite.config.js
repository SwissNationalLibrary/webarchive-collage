import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import svgLoader from 'vite-svg-loader';
import fs from 'fs';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      vue(),
      svgLoader({
        svgoConfig: {
          plugins: [
            'removeDoctype',
            'removeDimensions',
            'removeUselessDefs',
            'removeUnusedNS',
            'collapseGroups',
          ],
        },
      }),
    ],
    //content: ["./src/**/*.{js,ts,jsx,tsx,vue}"],
    server: {
      //host: '0.0.0.0',
      host: 'access.ehelvetica.localhost',
      port: env['VITE_PORT'] ?? 8080,
      compress: true,
      https:
        mode === 'development'
          ? {
              key: fs.readFileSync('./access.ehelvetica.localhost-key.pem'),
              cert: fs.readFileSync('./access.ehelvetica.localhost.pem'),
            }
          : false,
      proxy: {
        '^/iiif': {
          target: 'http://localhost:8686',
          ws: true,
          changeOrigin: false,
        },
        '^/collage//?data': {
          target: 'http://access.ehelvetica.localhost:8686/',
          rewrite: (path) => path.replace(/^\/collage/, ''),
        },
        '^/(view|api|search|js|css|fonts|app.css)': {
          target: 'https://access.ehelvetica.localhost:8443',
          changeOrigin: true,
          auth: `${process.env.EHELVETICA_ACCESS_BASICAUTH_USER}:${process.env.EHELVETICA_ACCESS_BASICAUTH_USER}`,
          cookieDomainRewrite: '.access.ehelvetica.localhost',
          withCredentials: true,
          onProxyReq: function (proxyReq) {
            //proxyReq.setHeader("Cookie", "ehs.sid=" + accessCookie)
          },
        },
      },
    },
    base: '/collage',
    resolve: {
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue'],
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
