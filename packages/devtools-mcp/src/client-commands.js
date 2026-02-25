/**
 * Extended command handlers for the browser client.
 * Handles: eval, dom-inspect, get-route, navigate
 *
 * Usage in client.js:
 *   import { handleExtendedCommand } from './client-commands.js';
 *
 *   // Inside handleCommand(), before the default case:
 *   const extResult = handleExtendedCommand(command, args, devtools);
 *   if (extResult !== null) { result = extResult; break; }
 */

/**
 * Handle extended commands sent from the MCP server via the bridge.
 *
 * @param {string} command - The command name
 * @param {object} args - Command arguments
 * @param {object|null} devtools - window.__WHAT_DEVTOOLS__ reference
 * @returns {object|null} Result object, or null if command not handled
 */
export function handleExtendedCommand(command, args, devtools) {
  switch (command) {

    // -------------------------------------------------------------------------
    // eval — Execute arbitrary JS in the browser context
    // -------------------------------------------------------------------------
    case 'eval': {
      const start = performance.now();
      try {
        // Use Function constructor to execute in global scope
        // eslint-disable-next-line no-new-func
        const fn = new Function(args.code);
        const raw = fn();
        const elapsed = performance.now() - start;
        return {
          result: devtools?.safeSerialize ? devtools.safeSerialize(raw) : raw,
          type: typeof raw,
          executionTime: Math.round(elapsed * 100) / 100,
        };
      } catch (e) {
        return {
          error: e.message,
          stack: e.stack,
        };
      }
    }

    // -------------------------------------------------------------------------
    // dom-inspect — Serialize a component's rendered DOM
    // -------------------------------------------------------------------------
    case 'dom-inspect': {
      const { componentId, depth = 3 } = args || {};
      const registries = devtools?._registries;

      if (!registries?.components) {
        return { error: 'DevTools registries not available' };
      }

      const entry = registries.components.get(componentId);
      if (!entry) {
        return { error: `Component ${componentId} not found` };
      }

      const el = entry.element;
      if (!el) {
        return { error: `Component "${entry.name}" (id: ${componentId}) has no DOM element` };
      }

      /**
       * Recursively serialize a DOM node into a plain object.
       * Respects the max depth limit to avoid huge payloads.
       */
      function serializeDOM(node, currentDepth) {
        if (currentDepth > depth) {
          return { tag: '...', text: '(truncated)' };
        }

        // Text node
        if (node.nodeType === 3) {
          const text = node.textContent?.trim() || '';
          if (!text) return null; // skip empty text nodes
          return { text };
        }

        // Skip non-element, non-text nodes (comments, etc.)
        if (node.nodeType !== 1) return null;

        const result = {
          tag: node.tagName.toLowerCase(),
        };

        // Include common identifying attributes
        if (node.id) result.id = node.id;
        if (node.className && typeof node.className === 'string') {
          result.class = node.className;
        }

        // Include data attributes (often useful for debugging)
        const dataAttrs = {};
        for (const attr of node.attributes) {
          if (attr.name.startsWith('data-')) {
            dataAttrs[attr.name] = attr.value;
          }
        }
        if (Object.keys(dataAttrs).length > 0) {
          result.dataAttributes = dataAttrs;
        }

        // Recurse into children
        const children = [];
        for (const child of node.childNodes) {
          const serialized = serializeDOM(child, currentDepth + 1);
          if (serialized && (serialized.tag || serialized.text)) {
            children.push(serialized);
          }
        }
        if (children.length) result.children = children;

        return result;
      }

      const structure = serializeDOM(el, 0);
      // Cap HTML to 5000 chars to prevent huge payloads
      const html = el.innerHTML?.substring(0, 5000) || '';

      return {
        componentName: entry.name,
        componentId,
        html,
        structure,
      };
    }

    // -------------------------------------------------------------------------
    // get-route — Return current route information
    // -------------------------------------------------------------------------
    case 'get-route': {
      const loc = typeof window !== 'undefined' ? window.location : {};
      const result = {
        path: loc.pathname || '/',
        query: Object.fromEntries(new URLSearchParams(loc.search || '')),
        hash: loc.hash || '',
        fullUrl: loc.href || '',
      };

      // Try to get What Router state if available
      try {
        const core = window.__WHAT_CORE__;
        if (core?.routerState) {
          const state = typeof core.routerState === 'function'
            ? core.routerState()
            : core.routerState;
          if (state) {
            result.params = state.params || {};
            result.matchedRoute = state.pattern || state.route || null;
          }
        }
      } catch {
        // Router state not available — that's fine, we have window.location
      }

      return result;
    }

    // -------------------------------------------------------------------------
    // navigate — Programmatically change the route
    // -------------------------------------------------------------------------
    case 'navigate': {
      const { path, replace } = args || {};

      if (!path) {
        return { error: 'No path provided' };
      }

      try {
        // Prefer What Router's navigate() if available
        const core = window.__WHAT_CORE__;
        if (core?.navigate) {
          core.navigate(path, { replace: !!replace });
        } else if (replace) {
          history.replaceState(null, '', path);
          window.dispatchEvent(new PopStateEvent('popstate'));
        } else {
          history.pushState(null, '', path);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }

        return {
          navigatedTo: path,
          currentPath: window.location.pathname,
          method: replace ? 'replaceState' : 'pushState',
          usedWhatRouter: !!(core?.navigate),
          success: true,
        };
      } catch (e) {
        return { error: e.message };
      }
    }

    // -------------------------------------------------------------------------
    // Not handled — return null so caller falls through
    // -------------------------------------------------------------------------
    default:
      return null;
  }
}
