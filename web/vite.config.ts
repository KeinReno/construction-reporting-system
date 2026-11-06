import { defineConfig } from 'vite';
// Optional local employee preview; browser assets never contain this server address.
export default defineConfig(() => {
  const proxy = { '/api': { target: process.env.CRS_API_PROXY || 'http://127.0.0.1:8000', changeOrigin: false } };
  return { server: { proxy }, preview: { proxy } };
});
