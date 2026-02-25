/**
 * Vite plugin to auto-inject what-devtools-mcp client into dev server.
 * Only active during `vite dev` (apply: 'serve').
 */

export default function whatDevToolsMCP({ port = 9229 } = {}) {
  return {
    name: 'what-devtools-mcp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(
        '</body>',
        `<script type="module">
import * as core from 'what-core';
import { installDevTools } from 'what-devtools';
import { connectDevToolsMCP } from 'what-devtools-mcp/client';
installDevTools(core);
connectDevToolsMCP({ port: ${port} });
</script>
</body>`
      );
    },
  };
}
