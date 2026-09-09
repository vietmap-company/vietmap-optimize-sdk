import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // Tell Vue that <vietmap-*> tags are custom elements, not Vue
          // components — this is the ONE line of framework glue the SDK needs.
          isCustomElement: (tag) => tag.startsWith('vietmap-'),
        },
      },
    }),
  ],
  // Dedicated port so it never collides with the React demo (5180) or dcwr (5173).
  server: { port: 5181 },
})
