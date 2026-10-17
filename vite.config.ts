import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Set VITE_BASE for GitHub Pages project sites, e.g. VITE_BASE=/my-repo/ npm run build
export default defineConfig({ base: process.env.VITE_BASE ?? './', plugins: [react()] });
