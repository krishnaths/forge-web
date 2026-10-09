// Small charts in SVG, sized from the container's measured width. Hovering (or focusing and using
// the arrow keys) reads out one point; otherwise the numbers live in the panel around the chart.

import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { shortDate } from '../dates.js';
import { html } from './core.js';

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const Empty = ({ text, height }) => html`<div class="chart-empty" style=${{ height: `${height}px` }}>${text}</div>`;

const PAD_L = 44;
const PAD_B = 22;

/** points: [{x, y, day}], x ascending. `goal` draws a dashed guide. */
export function LineChart({ points, goal, height = 260, label, unit = '' }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  if (points.length < 2) return html`<div ref=${ref}><${Empty} text="Log a few weigh-ins to see the trend" height=${height} /></div>`;
  const ys = points.map(p => p.y).concat(goal != null ? [goal] : []);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = Math.max((maxY - minY) * 0.12, 0.4);
  const [y0, y1] = [minY - pad, maxY + pad];
  const [x0, x1] = [points[0].x, points[points.length - 1].x];
  const plotW = Math.max(0, w - PAD_L);
  const plotH = height - PAD_B;
  const px = x => PAD_L + (x1 === x0 ? 0 : ((x - x0) / (x1 - x0)) * plotW);
  const py = y => plotH - ((y - y0) / (y1 - y0)) * plotH;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join('');
  const area = `${line}L${px(x1)},${plotH}L${px(x0)},${plotH}Z`;
  const ticks = [0, 1, 2, 3].map(i => y0 + ((y1 - y0) * (i + 0.5)) / 4);
  const shown = hover ?? points.length - 1;
  const p = points[shown];

  const onMove = e => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    points.forEach((q, i) => { if (Math.abs(px(q.x) - x) < Math.abs(px(points[best].x) - x)) best = i; });
    setHover(best);
  };
  const onKey = e => {
    if (e.key === 'ArrowLeft') setHover(Math.max(0, shown - 1));
    if (e.key === 'ArrowRight') setHover(Math.min(points.length - 1, shown + 1));
  };

  return html`
    <div ref=${ref} class="chart">
      ${w > 0 && html`
        <svg width=${w} height=${height} role="img" aria-label=${label} tabIndex="0"
             onMouseMove=${onMove} onMouseLeave=${() => setHover(null)} onKeyDown=${onKey} onBlur=${() => setHover(null)}>
          <defs>
            <linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="var(--primary)" stop-opacity="0.22" />
              <stop offset="1" stop-color="var(--primary)" stop-opacity="0" />
            </linearGradient>
          </defs>
          ${ticks.map(t => html`
            <line x1=${PAD_L} x2=${w} y1=${py(t)} y2=${py(t)} class="gridline" />
            <text x=${PAD_L - 8} y=${py(t) + 4} class="axis" text-anchor="end">${t.toFixed(1)}</text>`)}
          <text x=${PAD_L} y=${height - 4} class="axis">${shortDate(points[0].day)}</text>
          <text x=${w} y=${height - 4} class="axis" text-anchor="end">${shortDate(points[points.length - 1].day)}</text>
          <path d=${area} fill="url(#lc-fill)" />
          ${goal != null && html`
            <line x1=${PAD_L} x2=${w} y1=${py(goal)} y2=${py(goal)} class="goal" />
            <text x=${w} y=${py(goal) - 6} class="axis goal-label" text-anchor="end">Goal ${goal}${unit}</text>`}
          <path d=${line} class="series" />
          ${hover != null && html`<line x1=${px(p.x)} x2=${px(p.x)} y1="0" y2=${plotH} class="crosshair" />`}
          <circle cx=${px(p.x)} cy=${py(p.y)} r="5" fill="var(--primary)" stroke="var(--surface)" stroke-width="2" />
        </svg>
        <div class="chart-readout" style=${{ left: `${Math.min(Math.max(px(p.x), 70), w - 70)}px` }}>
          <strong>${p.y}${unit}</strong> ${shortDate(p.day)}
        </div>`}
    </div>`;
}

/** bars: [{day, value}]. The newest bar is solid; hover reads one out. */
export function BarChart({ bars, height = 200, label, unit = '' }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  if (!bars.length) return html`<div ref=${ref}><${Empty} text="Finish a session to see its volume here" height=${height} /></div>`;
  const maxV = Math.max(...bars.map(b => b.value), 0.0001);
  const gap = Math.min(8, (w * 0.25) / bars.length);
  const bw = (w - gap * (bars.length - 1)) / bars.length;
  const plotH = height - PAD_B;
  const shown = bars[hover ?? bars.length - 1];
  return html`
    <div ref=${ref} class="chart">
      <div class="chart-caption"><strong>${Math.round(shown.value).toLocaleString()}${unit}</strong> ${shortDate(shown.day)}</div>
      ${w > 0 && html`
        <svg width=${w} height=${height} role="img" aria-label=${label} onMouseLeave=${() => setHover(null)}>
          ${bars.map((b, i) => {
            const bh = Math.max(2, (b.value / maxV) * plotH);
            return html`<rect x=${i * (bw + gap)} y=${plotH - bh} width=${bw} height=${bh} rx=${Math.min(4, bw / 3)}
              class=${`bar-rect ${i === (hover ?? bars.length - 1) ? 'on' : ''}`} onMouseEnter=${() => setHover(i)} />`;
          })}
          <text x="0" y=${height - 4} class="axis">${shortDate(bars[0].day)}</text>
          <text x=${w} y=${height - 4} class="axis" text-anchor="end">${shortDate(bars[bars.length - 1].day)}</text>
        </svg>`}
    </div>`;
}

/** Habit grid: one column per day (oldest first), one row per habit, labelled. */
export function StreakGrid({ days, labels }) {
  const [ref, w] = useWidth();
  const rows = labels.length;
  const LABEL_W = 150;
  if (!days.length) return html`<div ref=${ref}><${Empty} text="Tick a habit to start the grid" height=${120} /></div>`;
  const gap = 3;
  const cell = Math.max(3, Math.min(18, (w - LABEL_W - gap * (days.length - 1)) / days.length));
  const height = rows * (cell + gap);
  return html`
    <div ref=${ref}>
      ${w > 0 && html`
        <svg width=${w} height=${height} role="img" aria-label="Habits ticked, one column per day">
          ${labels.map((l, r) => html`
            <text x="0" y=${r * (cell + gap) + cell / 2 + 4} class="axis label-text">${l}</text>`)}
          ${days.map(([day, flags], c) => flags.map((done, r) => html`
            <rect x=${LABEL_W + c * (cell + gap)} y=${r * (cell + gap)} width=${cell} height=${cell} rx=${cell * 0.25}
                  fill=${done ? 'var(--primary)' : 'var(--surface-high)'}><title>${shortDate(day)}: ${labels[r]}${done ? '' : ' (not ticked)'}</title></rect>`))}
        </svg>`}
    </div>`;
}
