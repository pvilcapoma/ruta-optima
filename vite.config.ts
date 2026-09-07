import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En GitHub Pages el sitio vive en https://<usuario>.github.io/<repo>/, así que la base debe ser "/<repo>/".
// GITHUB_REPOSITORY ("usuario/repo") la define GitHub Actions; en local la base es "/".
// VITE_BASE_PATH permite forzar otra base (p. ej. "/" si se usa un dominio propio).
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = process.env.VITE_BASE_PATH ?? (repo ? `/${repo}/` : '/');

export default defineConfig({
  base,
  plugins: [react()],
});
