/**
 * Server-rendered HTML view of the BIA usage report (server/biaUsage.ts).
 *
 * Self-contained on purpose: inline CSS, inline SVG, ~70 lines of inline JS for
 * the hover layer, no build step and no network fetches. It is reached through
 * the same secret path segment as the JSON, so it must never be indexed and
 * never echo the secret back into the markup — every link here is relative.
 *
 * Charts follow one fixed spec: series colour tracks the channel (app = blue,
 * WhatsApp = orange, validated for CVD in both light and dark), hairline grid,
 * 2px lines, selective end labels, and a table view so no value is reachable
 * only by hovering.
 */

import type { BiaChannel } from "./supportTypes.js";
import type { UsageDay, UsageReport } from "./biaUsage.js";

const CHANNEL_LABEL: Record<BiaChannel, string> = {
  app: "In-app",
  whatsapp: "WhatsApp",
};

const RANGE_PRESETS = [7, 14, 30] as const;

// ─── Escaping & formatting ───────────────────────────────────────────────────

function esc(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inlined JSON must not be able to close the script element that carries it. */
function jsonScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function compact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

function usd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${((part / whole) * 100).toFixed(part / whole >= 0.1 ? 0 : 1)}%`;
}

function ms(n: number): string {
  if (n <= 0) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
}

/** "2026-07-27" → "27 Jul". Parsed as parts, not Date, to dodge timezone drift. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const label = months[Number(m) - 1] ?? m;
  return `${Number(d)} ${label}`;
}

// ─── Scales ──────────────────────────────────────────────────────────────────

/**
 * Round a max up to a clean axis top so ticks read 0 / 20 / 40 rather than 0 / 17 / 34.
 * Steps are fine-grained on purpose — a coarse ladder turns a max of 103 into a
 * top of 200 and leaves the plot half empty.
 */
function axisTop(maxValue: number): number {
  if (maxValue <= 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(maxValue));
  for (const step of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    const candidate = magnitude * step;
    // The mid tick is top/2, so only tops that halve cleanly are candidates —
    // otherwise a 3-turn day gets an axis reading 0 / 1.5 / 3.
    if (candidate >= maxValue && Number.isInteger(candidate / 2)) return candidate;
  }
  return magnitude * 10;
}

interface LineSeries {
  channel: BiaChannel;
  values: number[];
}

const PLOT = { width: 800, height: 232, left: 52, right: 20, top: 14, bottom: 42 } as const;

function xAt(index: number, count: number): number {
  const span = PLOT.width - PLOT.left - PLOT.right;
  if (count <= 1) return PLOT.left + span / 2;
  return PLOT.left + (span * index) / (count - 1);
}

function yAt(value: number, top: number): number {
  const span = PLOT.height - PLOT.top - PLOT.bottom;
  const ratio = top <= 0 ? 0 : Math.min(value / top, 1);
  return PLOT.height - PLOT.bottom - span * ratio;
}

// ─── Line chart ──────────────────────────────────────────────────────────────

interface LineChartOptions {
  id: string;
  title: string;
  subtitle: string;
  dates: string[];
  series: LineSeries[];
  /** Formats the value in tooltips, end labels and axis ticks. */
  format: (n: number) => string;
}

function renderLineChart(o: LineChartOptions): string {
  const count = o.dates.length;
  const maxValue = Math.max(0, ...o.series.flatMap((s) => s.values));
  const top = axisTop(maxValue);
  const ticks = [0, top / 2, top];
  const isEmpty = maxValue === 0;

  const grid = ticks
    .map((t) => {
      const y = yAt(t, top).toFixed(1);
      return (
        `<line class="grid" x1="${PLOT.left}" x2="${PLOT.width - PLOT.right}" y1="${y}" y2="${y}"/>` +
        `<text class="tick" x="${PLOT.left - 10}" y="${y}" text-anchor="end" dominant-baseline="middle">${esc(
          o.format(t)
        )}</text>`
      );
    })
    .join("");

  // Roughly six labels, whatever the range length.
  const labelEvery = Math.max(1, Math.ceil(count / 6));
  const xLabels = o.dates
    .map((d, i) =>
      i % labelEvery === 0 || i === count - 1
        ? `<text class="tick" x="${xAt(i, count).toFixed(1)}" y="${
            PLOT.height - PLOT.bottom + 20
          }" text-anchor="middle">${esc(shortDate(d))}</text>`
        : ""
    )
    .join("");

  const lines = o.series
    .map((s) => {
      const d = s.values
        .map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i, count).toFixed(1)} ${yAt(v, top).toFixed(1)}`)
        .join(" ");
      const lastIndex = count - 1;
      const lastValue = s.values[lastIndex] ?? 0;
      const endX = xAt(lastIndex, count);
      const endY = yAt(lastValue, top);
      // Only the endpoint is direct-labelled; the axis and tooltip carry the rest.
      const label =
        isEmpty || lastValue === 0
          ? ""
          : `<text class="end-label" x="${(endX - 8).toFixed(1)}" y="${(endY - 12).toFixed(
              1
            )}" text-anchor="end">${esc(o.format(lastValue))}</text>`;
      return (
        `<path class="line ${s.channel}" d="${d}"/>` +
        `<circle class="dot ${s.channel}" cx="${endX.toFixed(1)}" cy="${endY.toFixed(1)}" r="4"/>` +
        label
      );
    })
    .join("");

  // One focusable hit band per day: the crosshair snaps to it, and keyboard
  // focus surfaces exactly what hover does.
  const bandWidth = (PLOT.width - PLOT.left - PLOT.right) / Math.max(count - 1, 1);
  const bands = o.dates
    .map((d, i) => {
      const cx = xAt(i, count);
      const readout = o.series
        .map((s) => `${CHANNEL_LABEL[s.channel]} ${o.format(s.values[i] ?? 0)}`)
        .join(", ");
      return `<rect class="band" tabindex="0" role="img" aria-label="${esc(
        `${shortDate(d)}: ${readout}`
      )}" data-i="${i}" x="${(cx - bandWidth / 2).toFixed(1)}" y="${PLOT.top}" width="${bandWidth.toFixed(
        1
      )}" height="${PLOT.height - PLOT.bottom - PLOT.top}"/>`;
    })
    .join("");

  const legend = o.series
    .map(
      (s) =>
        `<span class="key"><span class="key-line ${s.channel}"></span>${esc(
          CHANNEL_LABEL[s.channel]
        )}</span>`
    )
    .join("");

  return `<section class="card">
  <div class="card-head">
    <div>
      <h2>${esc(o.title)}</h2>
      <p class="sub">${esc(o.subtitle)}</p>
    </div>
    <div class="legend">${legend}</div>
  </div>
  <div class="chart" data-chart="${esc(o.id)}">
    <svg viewBox="0 0 ${PLOT.width} ${PLOT.height}" role="group" aria-label="${esc(o.title)}">
      ${grid}
      <line class="axis" x1="${PLOT.left}" x2="${PLOT.width - PLOT.right}" y1="${
        PLOT.height - PLOT.bottom
      }" y2="${PLOT.height - PLOT.bottom}"/>
      ${xLabels}
      <line class="crosshair" y1="${PLOT.top}" y2="${PLOT.height - PLOT.bottom}" x1="0" x2="0"/>
      ${lines}
      ${bands}
    </svg>
    <div class="tooltip" role="status" aria-live="polite"></div>
    ${isEmpty ? '<p class="empty">No traffic recorded in this window</p>' : ""}
  </div>
</section>`;
}

// ─── Tool histogram ──────────────────────────────────────────────────────────

function renderToolBars(channel: BiaChannel, tools: Record<string, number>): string {
  const rows = Object.entries(tools)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const max = Math.max(1, ...rows.map(([, v]) => v));

  if (rows.length === 0) {
    return `<div class="facet">
      <h3><span class="key-line ${channel}"></span>${esc(CHANNEL_LABEL[channel])}</h3>
      <p class="empty">No tool calls</p>
    </div>`;
  }

  const bars = rows
    .map(([name, value]) => {
      const width = Math.max(2, (value / max) * 100);
      return `<div class="bar-row">
        <span class="bar-label">${esc(name)}</span>
        <span class="bar-track"><span class="bar ${channel}" style="width:${width.toFixed(
          1
        )}%" title="${esc(`${name}: ${value}`)}"></span></span>
        <span class="bar-value">${esc(compact(value))}</span>
      </div>`;
    })
    .join("");

  return `<div class="facet">
    <h3><span class="key-line ${channel}"></span>${esc(CHANNEL_LABEL[channel])}</h3>
    ${bars}
  </div>`;
}

// ─── Stat tiles ──────────────────────────────────────────────────────────────

function sparkline(values: number[], channel: BiaChannel): string {
  const max = Math.max(1, ...values);
  const w = 96;
  const h = 24;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${(h - (v / max) * (h - 4) - 2).toFixed(1)}`)
    .join(" ");
  const lastX = (values.length - 1) * step;
  const lastY = h - ((values.at(-1) ?? 0) / max) * (h - 4) - 2;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <path class="spark-line" d="${d}"/>
    <circle class="dot ${channel}" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.5"/>
  </svg>`;
}

function tile(label: string, value: string, note?: string): string {
  return `<div class="tile">
    <span class="tile-label">${esc(label)}</span>
    <span class="tile-value">${esc(value)}</span>
    ${note ? `<span class="tile-note">${esc(note)}</span>` : ""}
  </div>`;
}

function renderChannelPanel(
  channel: BiaChannel,
  days: UsageDay[],
  totals: UsageReport["channels"][BiaChannel]["totals"]
): string {
  const chronological = [...days].reverse();
  const turnsSeries = chronological.map((d) => d.turns);
  const latencyWeighted = days.reduce((acc, d) => acc + d.avgLatencyMs * d.turns, 0);
  const avgLatency = totals.turns > 0 ? latencyWeighted / totals.turns : 0;
  const peakUniques = Math.max(0, ...days.map((d) => d.uniqueActors));
  const wa = channel === "whatsapp" ? days.reduce(
    (acc, d) => ({
      partsSent: acc.partsSent + (d.whatsapp?.partsSent ?? 0),
      rateLimited: acc.rateLimited + (d.whatsapp?.rateLimited ?? 0),
      duplicates: acc.duplicates + (d.whatsapp?.duplicates ?? 0),
    }),
    { partsSent: 0, rateLimited: 0, duplicates: 0 }
  ) : null;

  return `<section class="card panel">
    <div class="card-head">
      <div>
        <h2><span class="key-line ${channel}"></span>${esc(CHANNEL_LABEL[channel])}</h2>
        <p class="sub">${esc(usd(totals.costUsd))} estimated · ${esc(
          compact(totals.promptTokens + totals.completionTokens)
        )} tokens</p>
      </div>
      ${sparkline(turnsSeries, channel)}
    </div>
    <div class="tiles">
      ${tile("Turns", compact(totals.turns))}
      ${tile(
        "Fallbacks",
        compact(totals.failedTurns),
        totals.turns > 0 ? `${pct(totals.failedTurns, totals.turns)} of turns` : undefined
      )}
      ${tile("Peak daily users", compact(peakUniques), channel === "app" ? "guests share one bucket" : "exact per number")}
      ${tile("Avg latency", ms(avgLatency))}
      ${tile("OpenAI calls", compact(totals.apiCalls), totals.turns > 0 ? `${(totals.apiCalls / totals.turns).toFixed(1)} per turn` : undefined)}
      ${
        wa
          ? tile("Messages sent", compact(wa.partsSent), `${compact(wa.rateLimited)} throttled · ${compact(wa.duplicates)} dupes`)
          : tile("Prompt tokens", compact(totals.promptTokens), `${compact(totals.completionTokens)} completion`)
      }
    </div>
  </section>`;
}

// ─── Table view ──────────────────────────────────────────────────────────────

function renderTable(report: UsageReport): string {
  const dates = report.channels.app.days.map((d) => d.date);
  const byDate = (channel: BiaChannel, date: string): UsageDay | undefined =>
    report.channels[channel].days.find((d) => d.date === date);

  const rows = dates
    .map((date) => {
      const a = byDate("app", date);
      const w = byDate("whatsapp", date);
      return `<tr>
        <th scope="row">${esc(date)}</th>
        <td>${esc(compact(a?.turns ?? 0))}</td>
        <td>${esc(compact(a?.uniqueActors ?? 0))}</td>
        <td>${esc(compact((a?.promptTokens ?? 0) + (a?.completionTokens ?? 0)))}</td>
        <td>${esc(usd(a?.costUsd ?? 0))}</td>
        <td>${esc(compact(w?.turns ?? 0))}</td>
        <td>${esc(compact(w?.uniqueActors ?? 0))}</td>
        <td>${esc(compact((w?.promptTokens ?? 0) + (w?.completionTokens ?? 0)))}</td>
        <td>${esc(usd(w?.costUsd ?? 0))}</td>
        <td>${esc(compact(w?.whatsapp?.partsSent ?? 0))}</td>
      </tr>`;
    })
    .join("");

  return `<details class="card table-card">
    <summary>Table view — every value, no hovering</summary>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col" rowspan="2">Date</th>
            <th scope="colgroup" colspan="4">In-app</th>
            <th scope="colgroup" colspan="5">WhatsApp</th>
          </tr>
          <tr>
            <th scope="col">Turns</th><th scope="col">Users</th><th scope="col">Tokens</th><th scope="col">Cost</th>
            <th scope="col">Turns</th><th scope="col">Users</th><th scope="col">Tokens</th><th scope="col">Cost</th><th scope="col">Sent</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </details>`;
}

// ─── Page ────────────────────────────────────────────────────────────────────

const STYLES = `
:root {
  color-scheme: light;
  --surface: #fcfcfb;
  --plane: #f9f9f7;
  --ink: #0b0b0b;
  --ink-2: #52514e;
  --muted: #898781;
  --grid: #e1e0d9;
  --axis: #c3c2b7;
  --border: rgba(11,11,11,0.10);
  --app: #2a78d6;
  --whatsapp: #eb6834;
  --spark: #c3c2b7;
  --critical: #d03b3b;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --surface: #1a1a19;
    --plane: #0d0d0d;
    --ink: #ffffff;
    --ink-2: #c3c2b7;
    --muted: #898781;
    --grid: #2c2c2a;
    --axis: #383835;
    --border: rgba(255,255,255,0.10);
    --app: #3987e5;
    --whatsapp: #d95926;
    --spark: #55554f;
    --critical: #d03b3b;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 32px 20px 64px;
  background: var(--plane);
  color: var(--ink);
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.wrap { max-width: 1080px; margin: 0 auto; }
header.page { display: flex; flex-wrap: wrap; gap: 16px 32px; align-items: flex-end; justify-content: space-between; margin-bottom: 8px; }
h1 { font-size: 19px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
.page-sub { color: var(--ink-2); font-size: 13px; margin: 4px 0 0; }
.hero { text-align: right; }
.hero-value { display: block; font-size: 48px; font-weight: 600; line-height: 1.05; letter-spacing: -0.02em; }
.hero-label { display: block; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
.filters { display: flex; gap: 8px; align-items: center; margin: 24px 0 20px; flex-wrap: wrap; }
.filters span.filters-label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; margin-right: 4px; }
.filters a {
  color: var(--ink-2); text-decoration: none; font-size: 13px;
  padding: 5px 12px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface);
}
.filters a:hover { color: var(--ink); }
.filters a[aria-current="true"] { color: var(--ink); border-color: var(--ink); font-weight: 600; }
.notice { display: flex; gap: 8px; align-items: baseline; border: 1px solid var(--border); border-left: 3px solid var(--critical); background: var(--surface); border-radius: 6px; padding: 10px 14px; margin: 0 0 20px; font-size: 13px; color: var(--ink-2); }
.grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px 20px; margin-bottom: 16px; }
.card-head { display: flex; gap: 16px; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; }
h2 { font-size: 14px; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 8px; }
h3 { font-size: 13px; font-weight: 600; margin: 0 0 10px; display: flex; align-items: center; gap: 8px; color: var(--ink-2); }
.sub { color: var(--muted); font-size: 12px; margin: 3px 0 0; }
.legend, .key { display: flex; align-items: center; gap: 6px; }
.legend { gap: 14px; font-size: 12px; color: var(--ink-2); flex-wrap: wrap; }
.key-line { display: inline-block; width: 14px; height: 2px; border-radius: 1px; background: var(--muted); flex: none; }
.key-line.app, h2 .key-line.app, .bar.app { background: var(--app); }
.key-line.whatsapp, h2 .key-line.whatsapp, .bar.whatsapp { background: var(--whatsapp); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 14px 18px; }
.tile { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tile-label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
.tile-value { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
.tile-note { color: var(--muted); font-size: 11px; }
.spark { width: 96px; height: 24px; flex: none; }
.spark-line { fill: none; stroke: var(--spark); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.chart { position: relative; }
.chart svg { width: 100%; height: auto; display: block; overflow: visible; }
.grid { stroke: var(--grid); stroke-width: 1; vector-effect: non-scaling-stroke; }
.axis { stroke: var(--axis); stroke-width: 1; vector-effect: non-scaling-stroke; }
.tick { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.end-label { fill: var(--ink-2); font-size: 11px; font-weight: 600; }
.line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.line.app { stroke: var(--app); }
.line.whatsapp { stroke: var(--whatsapp); }
.dot { stroke: var(--surface); stroke-width: 2; vector-effect: non-scaling-stroke; }
.dot.app { fill: var(--app); }
.dot.whatsapp { fill: var(--whatsapp); }
.band { fill: transparent; outline: none; }
.band:focus-visible { fill: color-mix(in srgb, var(--ink) 6%, transparent); }
.crosshair { stroke: var(--axis); stroke-width: 1; opacity: 0; vector-effect: non-scaling-stroke; }
.chart.is-active .crosshair { opacity: 1; }
.tooltip {
  position: absolute; top: 8px; left: 0; pointer-events: none; opacity: 0; transform: translateX(-50%);
  background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
  padding: 8px 10px; font-size: 12px; min-width: 132px; box-shadow: 0 4px 14px rgba(0,0,0,0.10);
}
.chart.is-active .tooltip { opacity: 1; }
.tooltip-date { color: var(--muted); font-size: 11px; margin-bottom: 4px; }
.tooltip-row { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.tooltip-row b { font-variant-numeric: tabular-nums; }
.tooltip-row span.name { color: var(--ink-2); }
.empty { color: var(--muted); font-size: 12px; margin: 8px 0 0; }
.facets { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; }
.bar-row { display: grid; grid-template-columns: 148px 1fr 44px; gap: 10px; align-items: center; margin-bottom: 8px; font-size: 12px; }
.bar-label { color: var(--ink-2); overflow-wrap: anywhere; }
.bar-track { display: block; height: 14px; }
.bar { display: block; height: 14px; border-radius: 0 4px 4px 0; }
.bar-value { color: var(--ink-2); font-variant-numeric: tabular-nums; text-align: right; font-weight: 600; }
.table-card { padding: 14px 20px; }
summary { cursor: pointer; font-size: 13px; font-weight: 600; }
.table-scroll { overflow-x: auto; margin-top: 14px; }
table { border-collapse: collapse; width: 100%; font-size: 12px; }
th, td { text-align: right; padding: 6px 10px; border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; white-space: nowrap; }
thead th { color: var(--muted); font-weight: 600; text-align: right; }
thead tr:first-child th { border-bottom: 1px solid var(--axis); }
/* A right-aligned group header sits over the group's last column and reads as its label. */
thead th[colspan] { text-align: center; color: var(--ink-2); }
th[scope="row"], thead th:first-child { text-align: left; }
tbody th { font-weight: 400; color: var(--ink-2); }
footer.page { color: var(--muted); font-size: 12px; margin-top: 24px; }
footer.page code { font-size: 11px; }
`;

const SCRIPT = `
const DATA = JSON.parse(document.getElementById("chart-data").textContent);
const PLOT = ${JSON.stringify({ width: PLOT.width, left: PLOT.left, right: PLOT.right })};

for (const el of document.querySelectorAll(".chart")) {
  const spec = DATA[el.dataset.chart];
  if (!spec) continue;
  const svg = el.querySelector("svg");
  const crosshair = el.querySelector(".crosshair");
  const tip = el.querySelector(".tooltip");

  const show = (i) => {
    const count = spec.dates.length;
    const span = PLOT.width - PLOT.left - PLOT.right;
    const x = count <= 1 ? PLOT.left + span / 2 : PLOT.left + (span * i) / (count - 1);
    crosshair.setAttribute("x1", x);
    crosshair.setAttribute("x2", x);
    tip.textContent = "";
    const date = document.createElement("div");
    date.className = "tooltip-date";
    date.textContent = spec.dates[i];
    tip.appendChild(date);
    for (const s of spec.series) {
      const row = document.createElement("div");
      row.className = "tooltip-row";
      const key = document.createElement("span");
      key.className = "key-line " + s.channel;
      const value = document.createElement("b");
      value.textContent = s.labels[i];
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = s.name;
      row.append(key, value, name);
      tip.appendChild(row);
    }
    // Keep the tooltip inside the card at both edges.
    const ratio = x / PLOT.width;
    tip.style.left = (ratio * 100).toFixed(2) + "%";
    tip.style.transform =
      ratio > 0.78 ? "translateX(-100%)" : ratio < 0.22 ? "translateX(0)" : "translateX(-50%)";
    el.classList.add("is-active");
  };
  const hide = () => el.classList.remove("is-active");

  for (const band of svg.querySelectorAll(".band")) {
    const i = Number(band.dataset.i);
    band.addEventListener("pointerenter", () => show(i));
    band.addEventListener("focus", () => show(i));
    band.addEventListener("blur", hide);
  }
  svg.addEventListener("pointerleave", hide);
}
`;

export function renderUsageDashboard(report: UsageReport): string {
  const app = report.channels.app;
  const whatsapp = report.channels.whatsapp;
  const chronological = app.days.map((d) => d.date).reverse();

  const seriesFor = (pick: (d: UsageDay) => number): LineSeries[] => [
    { channel: "app", values: [...app.days].reverse().map(pick) },
    { channel: "whatsapp", values: [...whatsapp.days].reverse().map(pick) },
  ];

  const turnsSeries = seriesFor((d) => d.turns);
  const usersSeries = seriesFor((d) => d.uniqueActors);
  const totalCost = app.totals.costUsd + whatsapp.totals.costUsd;
  const totalTurns = app.totals.turns + whatsapp.totals.turns;

  // Tooltip payload: pre-formatted so the client never re-implements formatting.
  const chartData = {
    turns: {
      dates: chronological.map(shortDate),
      series: turnsSeries.map((s) => ({
        channel: s.channel,
        name: CHANNEL_LABEL[s.channel],
        labels: s.values.map((v) => compact(v)),
      })),
    },
    users: {
      dates: chronological.map(shortDate),
      series: usersSeries.map((s) => ({
        channel: s.channel,
        name: CHANNEL_LABEL[s.channel],
        labels: s.values.map((v) => compact(v)),
      })),
    },
  };

  const rangeLinks = RANGE_PRESETS.map(
    (n) =>
      `<a href="?days=${n}"${report.days === n ? ' aria-current="true"' : ""}>Last ${n} days</a>`
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>BIA usage</title>
<style>${STYLES}</style>
</head>
<body>
<div class="wrap">
  <header class="page">
    <div>
      <h1>BIA usage</h1>
      <p class="page-sub">${esc(
        `Last ${report.days} days · dates in ${report.timeZone} · ${compact(totalTurns)} turns across both channels`
      )}</p>
    </div>
    <div class="hero">
      <span class="hero-value">${esc(usd(totalCost))}</span>
      <span class="hero-label">Estimated OpenAI spend</span>
    </div>
  </header>

  <nav class="filters" aria-label="Date range">
    <span class="filters-label">Range</span>
    ${rangeLinks}
  </nav>

  ${
    report.redisAvailable
      ? ""
      : `<p class="notice"><strong>Redis unreachable</strong> — counters are not being written, so every figure below reads zero. Per-turn <code>[biaUsage]</code> lines in the server log are unaffected.</p>`
  }

  <div class="grid-2">
    ${renderChannelPanel("app", app.days, app.totals)}
    ${renderChannelPanel("whatsapp", whatsapp.days, whatsapp.totals)}
  </div>

  ${renderLineChart({
    id: "turns",
    title: "Turns per day",
    subtitle: "One turn = one user message answered",
    dates: chronological,
    series: turnsSeries,
    format: (n) => compact(n),
  })}

  ${renderLineChart({
    id: "users",
    title: "Daily users",
    subtitle:
      "WhatsApp counts distinct numbers (also the Tata conversation proxy); in-app counts logged-in users, with all guests sharing one bucket",
    dates: chronological,
    series: usersSeries,
    format: (n) => compact(n),
  })}

  <section class="card">
    <div class="card-head">
      <div>
        <h2>Tool calls</h2>
        <p class="sub">Which of BIA's tools the model actually reaches for, per channel</p>
      </div>
    </div>
    <div class="facets">
      ${renderToolBars("app", aggregateTools(app.days))}
      ${renderToolBars("whatsapp", aggregateTools(whatsapp.days))}
    </div>
  </section>

  ${renderTable(report)}

  <footer class="page">
    Cost is list-price arithmetic at ${esc(
      `$${report.pricePerMillionUsd.input}/$${report.pricePerMillionUsd.output} per 1M tokens`
    )} — OpenAI's own usage page is the billing truth, and WhatsApp carries separate Tata conversation charges.
    Same data as JSON: drop <code>/view</code> from this URL.
  </footer>
</div>
<script id="chart-data" type="application/json">${jsonScript(chartData)}</script>
<script>${SCRIPT}</script>
</body>
</html>`;
}

function aggregateTools(days: UsageDay[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const day of days) {
    for (const [name, count] of Object.entries(day.tools)) {
      out[name] = (out[name] ?? 0) + count;
    }
  }
  return out;
}
