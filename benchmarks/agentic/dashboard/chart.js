/**
 * Zero-dependency chart rendering for benchmark dashboard.
 * Draws bar charts on HTML canvas.
 */

const COLORS = {
  without: '#f97316',
  with: '#22c55e',
  bg: '#12121a',
  grid: '#1e1e2e',
  text: '#808090',
  label: '#c0c0d0',
};

export function drawBarChart(canvas, data, options = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const padding = { top: 30, right: 20, bottom: 40, left: 60 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const { labels, withoutValues, withValues, title, unit = '' } = data;
  const maxVal = Math.max(...withoutValues, ...withValues, 1);
  const barWidth = chartW / labels.length / 3;
  const gap = barWidth * 0.5;

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, h);

  // Title
  ctx.fillStyle = COLORS.label;
  ctx.font = 'bold 13px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(title || '', w / 2, 18);

  // Grid lines
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();

    // Y-axis labels
    const val = Math.round(maxVal * (1 - i / 4));
    ctx.fillStyle = COLORS.text;
    ctx.font = '10px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(val.toLocaleString() + unit, padding.left - 8, y + 3);
  }

  // Bars
  for (let i = 0; i < labels.length; i++) {
    const groupX = padding.left + (chartW * (i + 0.5)) / labels.length;

    // Without bar
    const h1 = (withoutValues[i] / maxVal) * chartH;
    ctx.fillStyle = COLORS.without;
    ctx.fillRect(groupX - barWidth - gap / 2, padding.top + chartH - h1, barWidth, h1);

    // With bar
    const h2 = (withValues[i] / maxVal) * chartH;
    ctx.fillStyle = COLORS.with;
    ctx.fillRect(groupX + gap / 2, padding.top + chartH - h2, barWidth, h2);

    // X-axis label
    ctx.fillStyle = COLORS.text;
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], groupX, h - padding.bottom + 15);
  }

  // Legend
  const legendY = h - 8;
  ctx.fillStyle = COLORS.without;
  ctx.fillRect(w / 2 - 80, legendY - 8, 10, 10);
  ctx.fillStyle = COLORS.text;
  ctx.font = '10px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('Without MCP', w / 2 - 66, legendY);
  ctx.fillStyle = COLORS.with;
  ctx.fillRect(w / 2 + 20, legendY - 8, 10, 10);
  ctx.fillStyle = COLORS.text;
  ctx.fillText('With MCP', w / 2 + 34, legendY);
}

export function drawPieChart(canvas, data, options = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const { entries, title } = data;
  const total = entries.reduce((sum, e) => sum + e.value, 0);
  if (total === 0) return;

  const cx = w / 2;
  const cy = h / 2 + 10;
  const radius = Math.min(w, h) / 2 - 40;

  // Title
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = COLORS.label;
  ctx.font = 'bold 13px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(title || '', cx, 18);

  const palette = ['#6366f1', '#a855f7', '#22c55e', '#f97316', '#ec4899', '#06b6d4', '#eab308', '#ef4444'];
  let angle = -Math.PI / 2;

  for (let i = 0; i < entries.length; i++) {
    const slice = (entries[i].value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = palette[i % palette.length];
    ctx.fill();

    // Label
    if (slice > 0.15) {
      const midAngle = angle + slice / 2;
      const lx = cx + Math.cos(midAngle) * radius * 0.65;
      const ly = cy + Math.sin(midAngle) * radius * 0.65;
      ctx.fillStyle = '#fff';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(entries[i].name, lx, ly);
      ctx.fillText(`${entries[i].value}`, lx, ly + 12);
    }

    angle += slice;
  }
}
