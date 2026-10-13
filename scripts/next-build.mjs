// Bumps build.json to the next deploy before it is committed and pushed:
// the same day counts up (#1, #2, ...), a new day starts again at #1.
// The app shows it as "v26.10.13 #2" (client/src/lib/buildInfo.ts).
//
//   npm run build:next
//
// Then add the row to docs/builds/BUILDS.md once the commit is known.

import { readFileSync, writeFileSync } from "fs";

const FILE = new URL("../build.json", import.meta.url);

// Today in India time, as YYYY-MM-DD.
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const current = JSON.parse(readFileSync(FILE, "utf-8"));
const next = {
  date: today,
  number: current.date === today ? current.number + 1 : 1,
};

writeFileSync(FILE, `${JSON.stringify(next, null, 2)}\n`);

const [y, m, d] = today.split("-");
console.log(`v${y.slice(2)}.${m}.${d} #${next.number}`);
