/**
 * Agent harness: WITHOUT MCP tools (baseline).
 * Uses Claude API with file ops + Playwright tools only.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createBaselineTools, toolsToAnthropicFormat } from './tool-definitions.js';
import { MetricsCollector } from './metrics-collector.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const MAX_TURNS = 25;

export async function runWithoutMCP({ fixtureDir, page, apiKey }) {
  const client = new Anthropic({ apiKey });
  const metrics = new MetricsCollector();
  const tools = createBaselineTools(fixtureDir, page);
  const anthropicTools = toolsToAnthropicFormat(tools);

  // Read bug description
  const bugDesc = readFileSync(join(fixtureDir, 'bug-description.md'), 'utf-8');

  const systemPrompt = `You are debugging a What Framework application. What Framework uses signals-based reactivity with fine-grained DOM updates.

Key concepts:
- signal(initial) creates a reactive value. sig() reads, sig(newVal) writes.
- effect(() => ...) runs when signals read inside change.
- h(tag, props, ...children) creates vnodes. Components are functions.
- Reactive text: () => expr as a child creates fine-grained text updates.
- Event handlers are lowercase: onclick, oninput, onchange.

Fix the bug described below. Use the available tools to read files, understand the issue, and edit the code to fix it.

${bugDesc}`;

  const messages = [{ role: 'user', content: 'Please fix the bug described in the system prompt. Start by reading the source files to understand the code.' }];

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

    // Process response
    const assistantContent = response.content;
    messages.push({ role: 'assistant', content: assistantContent });

    // Check if done (no tool use)
    if (response.stop_reason === 'end_turn') break;

    // Execute tool calls
    const toolResults = [];
    for (const block of assistantContent) {
      if (block.type === 'tool_use') {
        const tool = tools[block.name];
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
