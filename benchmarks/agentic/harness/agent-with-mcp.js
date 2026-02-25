/**
 * Agent harness: WITH MCP tools (treatment).
 * Uses Claude API with file ops + Playwright + devtools MCP tools.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createBaselineTools, createMcpTools, toolsToAnthropicFormat } from './tool-definitions.js';
import { MetricsCollector } from './metrics-collector.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const MAX_TURNS = 25;

export async function runWithMCP({ fixtureDir, page, apiKey }) {
  const client = new Anthropic({ apiKey });
  const metrics = new MetricsCollector();
  const baselineTools = createBaselineTools(fixtureDir, page);
  const mcpTools = createMcpTools(page);
  const allTools = { ...baselineTools, ...mcpTools };
  const anthropicTools = toolsToAnthropicFormat(allTools);

  // Read bug description
  const bugDesc = readFileSync(join(fixtureDir, 'bug-description.md'), 'utf-8');

  const systemPrompt = `You are debugging a What Framework application. What Framework uses signals-based reactivity with fine-grained DOM updates.

Key concepts:
- signal(initial) creates a reactive value. sig() reads, sig(newVal) writes.
- effect(() => ...) runs when signals read inside change.
- h(tag, props, ...children) creates vnodes. Components are functions.
- Reactive text: () => expr as a child creates fine-grained text updates.
- Event handlers are lowercase: onclick, oninput, onchange.

You have access to What Framework DevTools MCP tools that let you inspect live app state:
- what_signals: See all signal values in real-time
- what_effects: See effect dependencies, run counts, and timing
- what_components: See mounted component tree
- what_snapshot: Full state snapshot
- what_errors: Runtime errors with stack traces
- what_cache: SWR/useQuery cache state
- what_set_signal: Modify signal values to test hypotheses
- what_watch: Watch for signal changes over time

Use these tools to diagnose the bug efficiently before reading source code.

${bugDesc}`;

  const messages = [{ role: 'user', content: 'Please fix the bug. Start by using the devtools MCP tools to inspect live app state before reading source files.' }];

  metrics.start();

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0,
      system: systemPrompt,
      tools: anthropicTools,
      messages,
    });

    metrics.recordApiCall({
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
    });

    const assistantContent = response.content;
    messages.push({ role: 'assistant', content: assistantContent });

    if (response.stop_reason === 'end_turn') break;

    const toolResults = [];
    for (const block of assistantContent) {
      if (block.type === 'tool_use') {
        const tool = allTools[block.name];
        metrics.recordToolCall(block.name);
        let result;
        if (tool) {
          try {
            result = await tool.execute(block.input || {});
          } catch (e) {
            result = `Error executing tool: ${e.message}`;
          }
        } else {
          result = `Unknown tool: ${block.name}`;
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      }
    }

    if (toolResults.length > 0) {
      messages.push({ role: 'user', content: toolResults });
    }
  }

  metrics.stop();
  return metrics;
}
