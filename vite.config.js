import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';
// base './' lets the site work from any GitHub Pages sub-path (the app uses #hash routing).
export default defineConfig({base:'./',plugins:[react()],server:{host:true}});
