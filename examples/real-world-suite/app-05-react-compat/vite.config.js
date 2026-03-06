import { defineConfig } from 'vite';
import { reactCompat } from 'what-react/vite';

export default defineConfig({
  plugins: [reactCompat()],
});
