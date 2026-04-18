import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Returns a Proxy for CSS module imports so styles.anyClass === 'anyClass' in tests
const cssModuleProxy = {
    name: 'css-module-proxy',
    transform(_code: string, id: string) {
        if (id.endsWith('.module.css')) {
            return { code: "export default new Proxy({}, { get: (_, key) => key })" };
        }
    },
};

export default defineConfig({
    plugins: [react(), cssModuleProxy],
    resolve: {
        alias: { '@': path.resolve(__dirname, './src') },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
    },
});
