/**
 * Plain-English monthly summary of BIA usage, shaped like an invoice.
 *
 * Deliberately jargon-free: no tokens, no latency, no tool names, nothing a
 * non-technical reader has to decode. It answers one question — how many
 * conversations happened this month, and what does that come to — and states in
 * words how a conversation is counted, so the number can be defended to a client.
 *
 * The technical dashboard (server/usageDashboard.ts) stays separate; this page
 * does not link to it.
 */

import type { BillingDay, BillingReport } from "./biaUsage.js";
import type { BiaChannel } from "./supportTypes.js";

/** Reader-facing wording. Nobody outside the codebase says "channel". */
const CHANNEL_COPY: Record<BiaChannel, { name: string; line: string }> = {
  whatsapp: {
    name: "WhatsApp",
    line: "Customers who messaged us on WhatsApp",
  },
  app: {
    name: "App",
    line: "Customers who used the chat inside the app",
  },
};

function esc(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function num(n: number): string {
  return n.toLocaleString("en-IN");
}

function money(amount: number, currency: string): string {
  return `${currency}${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function rate(amount: number, currency: string): string {
  return `${currency}${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(d)} ${months[Number(m) - 1] ?? m}`;
}

const STYLES = `
:root {
  color-scheme: light;
  --surface: #fcfcfb;
  --plane: #f9f9f7;
  --ink: #0b0b0b;
  --ink-2: #52514e;
  --muted: #898781;
  --rule: #e1e0d9;
  --strong-rule: #c3c2b7;
  --border: rgba(11,11,11,0.10);
  --app: #2a78d6;
  --whatsapp: #eb6834;
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
    --rule: #2c2c2a;
    --strong-rule: #383835;
    --border: rgba(255,255,255,0.10);
    --app: #3987e5;
    --whatsapp: #d95926;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 40px 20px 72px;
  background: var(--plane); color: var(--ink);
  font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.wrap { max-width: 820px; margin: 0 auto; }
h1 { font-size: 22px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
.sub { color: var(--ink-2); font-size: 14px; margin: 6px 0 0; }
.months { display: flex; flex-wrap: wrap; gap: 8px; margin: 22px 0 26px; }
.months a {
  font-size: 13px; text-decoration: none; color: var(--ink-2);
  padding: 6px 13px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface);
}
.months a:hover { color: var(--ink); }
.months a[aria-current="true"] { color: var(--ink); border-color: var(--ink); font-weight: 600; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 24px 26px; margin-bottom: 18px; }
.headline { display: flex; flex-wrap: wrap; gap: 18px 40px; align-items: flex-end; justify-content: space-between; }
.headline-figure { font-size: 44px; font-weight: 600; line-height: 1.05; letter-spacing: -0.02em; display: block; }
.headline-label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; display: block; margin-bottom: 2px; }
.headline-aside { color: var(--ink-2); font-size: 14px; text-align: right; }
.headline-aside b { color: var(--ink); }
table.invoice { border-collapse: collapse; width: 100%; margin-top: 4px; }
table.invoice th, table.invoice td { padding: 12px 8px; text-align: right; }
table.invoice th:first-child, table.invoice td:first-child { text-align: left; }
table.invoice thead th { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--strong-rule); padding-bottom: 8px; }
table.invoice tbody td { border-bottom: 1px solid var(--rule); font-variant-numeric: tabular-nums; }
table.invoice tbody td:first-child { font-variant-numeric: normal; }
table.invoice tfoot td { padding-top: 14px; font-weight: 600; font-size: 17px; font-variant-numeric: tabular-nums; }
.what { display: flex; align-items: center; gap: 9px; }
.chip { width: 10px; height: 10px; border-radius: 3px; flex: none; }
.chip.app { background: var(--app); }
.chip.whatsapp { background: var(--whatsapp); }
.share { margin-top: 22px; }
.share-row { display: grid; grid-template-columns: 92px 1fr auto; gap: 12px; align-items: center; font-size: 13px; margin-bottom: 8px; }
.share-track { height: 16px; }
.share-bar { display: block; height: 16px; border-radius: 0 4px 4px 0; }
.share-bar.app { background: var(--app); }
.share-bar.whatsapp { background: var(--whatsapp); }
.share-value { color: var(--ink-2); font-variant-numeric: tabular-nums; }
h2 { font-size: 15px; font-weight: 600; margin: 0 0 12px; }
.rules { margin: 0; padding: 0; list-style: none; }
.rules li { display: grid; grid-template-columns: 108px 1fr; gap: 14px; padding: 11px 0; border-top: 1px solid var(--rule); font-size: 14px; color: var(--ink-2); }
.rules li:first-child { border-top: 0; }
.rules b { color: var(--ink); font-weight: 600; }
.notice { display: block; border: 1px solid var(--border); border-left: 3px solid var(--critical); background: var(--surface); border-radius: 6px; padding: 12px 16px; margin: 0 0 18px; font-size: 14px; color: var(--ink-2); }
.notice.soft { border-left-color: var(--strong-rule); }
.notice b { color: var(--ink); }
details.days { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px 26px; }
details.days summary { cursor: pointer; font-size: 14px; font-weight: 600; }
.days-scroll { overflow-x: auto; margin-top: 16px; }
table.days { border-collapse: collapse; width: 100%; font-size: 13px; }
table.days th, table.days td { padding: 7px 10px; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--rule); font-variant-numeric: tabular-nums; }
table.days th:first-child, table.days td:first-child { text-align: left; }
table.days thead th { color: var(--muted); font-weight: 600; }
table.days thead th[colspan] { text-align: center; color: var(--ink-2); }
footer { color: var(--muted); font-size: 13px; margin-top: 22px; }
@media print {
  body { background: #fff; padding: 0; font-size: 12pt; }
  .months, footer { display: none; }
  .card, details.days { border: 0; padding: 0 0 18pt; background: #fff; }
  details.days { display: block; }
  details.days summary { display: none; }
  .days-scroll { overflow: visible; }
}
`;

function shareBars(report: BillingReport): string {
  const max = Math.max(1, ...report.lines.map((l) => l.conversations));
  if (report.totalConversations === 0) return "";
  return `<div class="share">
    ${report.lines
      .map((l) => {
        const width = Math.max(l.conversations > 0 ? 2 : 0, (l.conversations / max) * 100);
        return `<div class="share-row">
          <span class="what"><span class="chip ${l.channel}"></span>${esc(
            CHANNEL_COPY[l.channel].name
          )}</span>
          <span class="share-track"><span class="share-bar ${l.channel}" style="width:${width.toFixed(
            1
          )}%"></span></span>
          <span class="share-value">${esc(num(l.conversations))} conversations</span>
        </div>`;
      })
      .join("")}
  </div>`;
}

export function renderBillingPage(report: BillingReport, days: BillingDay[]): string {
  const priced = report.totalAmount !== null;
  const totalMessages = report.lines.reduce((a, l) => a + l.messages, 0);

  const rows = report.lines
    .map(
      (l) => `<tr>
        <td><span class="what"><span class="chip ${l.channel}"></span>${esc(
          CHANNEL_COPY[l.channel].line
        )}</span></td>
        <td>${esc(num(l.conversations))}</td>
        <td>${l.rate === null ? "—" : esc(rate(l.rate, report.currency))}</td>
        <td>${l.amount === null ? "—" : esc(money(l.amount, report.currency))}</td>
      </tr>`
    )
    .join("");

  const dayRows = days
    .map(
      (d) => `<tr>
        <th scope="row">${esc(shortDate(d.date))}</th>
        <td>${esc(num(d.whatsapp.conversations))}</td>
        <td>${esc(num(d.whatsapp.messages))}</td>
        <td>${esc(num(d.app.conversations))}</td>
        <td>${esc(num(d.app.messages))}</td>
      </tr>`
    )
    .join("");

  const monthLinks = report.months
    .map(
      (m) =>
        `<a href="?month=${esc(m.key)}"${
          m.key === report.month ? ' aria-current="true"' : ""
        }>${esc(m.label)}</a>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>BIA — ${esc(report.monthLabel)}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="wrap">
  <h1>AI assistant usage — ${esc(report.monthLabel)}</h1>
  <p class="sub">Billed per conversation. ${esc(
    report.isCurrentMonth
      ? "This month is still running, so the figures grow as customers chat."
      : "This month is closed — the figures are final."
  )}</p>

  <nav class="months" aria-label="Month">${monthLinks}</nav>

  ${
    report.redisAvailable
      ? ""
      : `<p class="notice"><b>Figures unavailable.</b> The counting service is unreachable, so everything below reads zero. This is a technical fault, not a month with no customers — do not invoice from this page until it is fixed.</p>`
  }
  ${
    priced || report.totalConversations === 0
      ? ""
      : `<p class="notice soft"><b>No rates set yet.</b> Conversation counts are real, but nobody has told the system what one conversation costs, so the amounts read “—”. Ask the developer to set the per-conversation rates and this page fills itself in.</p>`
  }

  <section class="card">
    <div class="headline">
      <div>
        <span class="headline-label">${esc(priced ? "Amount for the month" : "Conversations this month")}</span>
        <span class="headline-figure">${esc(
          priced ? money(report.totalAmount ?? 0, report.currency) : num(report.totalConversations)
        )}</span>
      </div>
      <p class="headline-aside">
        ${
          // Without a price the headline figure *is* the conversation count —
          // repeating it here would read as two different numbers.
          priced ? `<b>${esc(num(report.totalConversations))}</b> conversations<br>` : ""
        }
        <b>${esc(num(totalMessages))}</b> questions answered inside them
      </p>
    </div>

    <table class="invoice">
      <thead>
        <tr>
          <th scope="col">What we charge for</th>
          <th scope="col">Conversations</th>
          <th scope="col">Rate each</th>
          <th scope="col">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td>${esc(num(report.totalConversations))}</td>
          <td></td>
          <td>${priced ? esc(money(report.totalAmount ?? 0, report.currency)) : "—"}</td>
        </tr>
      </tfoot>
    </table>

    ${shareBars(report)}
  </section>

  <section class="card">
    <h2>What counts as one conversation</h2>
    <ul class="rules">
      <li><b>On WhatsApp</b><span>One customer, one 24-hour stretch. However many messages they send in that stretch, it is one conversation. If they come back the next day, that is a second one. This is the same way WhatsApp itself charges us, so our count and the WhatsApp bill move together.</span></li>
      <li><b>In the app</b><span>One customer chatting. If they go quiet for 30 minutes and start again later, that counts as a new conversation.</span></li>
      <li><b>Questions</b><span>Every individual question a customer asks inside a conversation. Shown for context — nothing is charged per question.</span></li>
      <li><b>Not counted</b><span>Anything else in the app: browsing, rate lookups on the rates screen, bookings, tracking pages. This page is only about the AI assistant.</span></li>
    </ul>
  </section>

  <section class="card">
    <h2>What it cost us</h2>
    <p class="sub">The AI provider charged us about <b>$${esc(
      report.ourOpenAiCostUsd.toFixed(2)
    )}</b> for this month's conversations. WhatsApp conversation fees from Tata are billed separately and are not included here. Internal figure — not part of the client invoice.</p>
  </section>

  <details class="days">
    <summary>Day-by-day breakdown (backup for the invoice)</summary>
    <div class="days-scroll">
      <table class="days">
        <thead>
          <tr>
            <th scope="col" rowspan="2">Date</th>
            <th scope="colgroup" colspan="2">WhatsApp</th>
            <th scope="colgroup" colspan="2">App</th>
          </tr>
          <tr>
            <th scope="col">Conversations</th><th scope="col">Questions</th>
            <th scope="col">Conversations</th><th scope="col">Questions</th>
          </tr>
        </thead>
        <tbody>${dayRows}</tbody>
      </table>
    </div>
  </details>

  <footer>
    Dates follow ${esc(report.timeZone)}. App chats from customers who are not signed in are grouped by network, so a shared office or wifi can read as one customer — the app figure is conservative by design. Print this page for the invoice attachment.
  </footer>
</div>
</body>
</html>`;
}
