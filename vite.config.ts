import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "Trail Navigator",
        short_name: "Trail",
        description: "Suivi GPS trail temps réel avec navigation sur trace GPX",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Le shell de l'app (JS/CSS) dépasse la limite par défaut de 2 Mo à
        // cause de Mapbox GL. On la relève pour qu'il soit bien précaché
        // (téléchargé une fois à l'installation), condition de l'usage hors-ligne.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Le style Mapbox et les tuiles transitent par plusieurs domaines.
        // On les met tous en cache pour permettre l'usage hors-ligne.
        runtimeCaching: [
          {
            // Tuiles vectorielles / raster servies par api.mapbox.com/v4
            urlPattern:
              /^https:\/\/api\.mapbox\.com\/v4\/.*\.(?:pbf|mvt|png|webp|jpg)/i,
            handler: "CacheFirst",
            options: {
              cacheName: "mapbox-tiles",
              expiration: {
                maxEntries: 6000,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Tuiles servies par les sous-domaines *.tiles.mapbox.com
            urlPattern: /^https:\/\/[a-z0-9]+\.tiles\.mapbox\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "mapbox-tiles",
              expiration: {
                maxEntries: 6000,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Style, sprites, glyphs (polices) — le reste de l'API Mapbox
            urlPattern: /^https:\/\/api\.mapbox\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "mapbox-api",
              expiration: {
                maxEntries: 400,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Sépare les grosses libs en chunks distincts : une mise à jour du code
    // applicatif n'invalide plus le cache de Mapbox/recharts.
    rollupOptions: {
      output: {
        manualChunks: {
          mapbox: ["mapbox-gl"],
          charts: ["recharts"],
        },
      },
    },
    chunkSizeWarningLimit: 2000,
  },
}));
