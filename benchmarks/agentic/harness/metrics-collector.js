/**
 * Metrics collector for agentic debugging benchmark.
 * Tracks tokens, tool calls, time, and accuracy across API round-trips.
 */

export class MetricsCollector {
  constructor() {
    this.reset();
  }

  reset() {
    this.startTime = null;
    this.endTime = null;
    this.apiCalls = [];
    this.toolCalls = [];
    this.toolCallBreakdown = {};
    this.screenshotCount = 0;
    this.fixCorrect = false;
  }

  start() {
    this.startTime = Date.now();
  }

  stop() {
    this.endTime = Date.now();
  }

  recordApiCall({ inputTokens, outputTokens }) {
    this.apiCalls.push({ inputTokens, outputTokens, timestamp: Date.now() });
  }

  recordToolCall(toolName) {
    this.toolCalls.push({ tool: toolName, timestamp: Date.now() });
    this.toolCallBreakdown[toolName] = (this.toolCallBreakdown[toolName] || 0) + 1;
    if (toolName.includes('screenshot')) {
      this.screenshotCount++;
    }
  }

  setFixCorrect(correct) {
    this.fixCorrect = correct;
  }

  getSummary() {
    const totalInputTokens = this.apiCalls.reduce((sum, c) => sum + (c.inputTokens || 0), 0);
    const totalOutputTokens = this.apiCalls.reduce((sum, c) => sum + (c.outputTokens || 0), 0);
    const peakInputTokens = Math.max(0, ...this.apiCalls.map(c => c.inputTokens || 0));

    return {
      total_tokens_input: totalInputTokens,
      total_tokens_output: totalOutputTokens,
      total_tokens: totalInputTokens + totalOutputTokens,
      api_round_trips: this.apiCalls.length,
      tool_calls: this.toolCalls.length,
      tool_call_breakdown: { ...this.toolCallBreakdown },
      playwright_screenshots: this.screenshotCount,
      time_to_fix_ms: this.endTime && this.startTime ? this.endTime - this.startTime : 0,
      fix_correct: this.fixCorrect,
      context_window_peak_tokens: peakInputTokens,
    };
  }
}
