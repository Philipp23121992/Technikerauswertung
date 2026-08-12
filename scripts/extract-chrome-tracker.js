const fs = require("fs");
const path = require("path");

const dir = path.join(
  process.env.LOCALAPPDATA,
  "Google/Chrome/User Data/Default/Local Storage/leveldb",
);
const files = fs.readdirSync(dir).filter((f) => /\.(ldb|log)$/.test(f));
const needle = "technikerauswertung.tracker.v4";
let best = null;

for (const file of files) {
  const buf = fs.readFileSync(path.join(dir, file));
  const text = buf.toString("utf8");
  let idx = 0;
  while ((idx = text.indexOf(needle, idx)) !== -1) {
    const searchFrom = idx;
    const start = text.indexOf('{"year":', searchFrom);
    if (start !== -1 && start - searchFrom < 300) {
      let depth = 0;
      let end = -1;
      let inString = false;
      let escape = false;
      for (let i = start; i < text.length; i += 1) {
        const c = text[i];
        if (inString) {
          if (escape) escape = false;
          else if (c === "\\") escape = true;
          else if (c === '"') inString = false;
          continue;
        }
        if (c === '"') {
          inString = true;
          continue;
        }
        if (c === "{") depth += 1;
        else if (c === "}") {
          depth -= 1;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }
      if (end > start) {
        const json = text.slice(start, end);
        try {
          const parsed = JSON.parse(json);
          const score =
            Object.keys(parsed.tickets || {}).length +
            Object.keys(parsed.openTickets || {}).length +
            Object.keys(parsed.tourTickets || {}).length +
            (parsed.technicians || []).length;
          console.log("candidate", file, "score", score, "len", json.length);
          if (!best || score > best.score) best = { file, score, parsed, len: json.length };
        } catch (err) {
          console.log("parse fail", file, err.message);
        }
      }
    }
    idx += needle.length;
  }
}

if (!best) {
  console.error("NONE");
  process.exit(1);
}

const payload = {
  exportedAt: new Date().toISOString(),
  storageKey: "technikerauswertung.tracker.v4",
  source: "chrome-localstorage",
  state: best.parsed,
};

fs.writeFileSync("public/data/tracker-snapshot.json", JSON.stringify(payload, null, 2));
fs.writeFileSync("data/tracker-snapshot.json", JSON.stringify(payload, null, 2));
console.log(
  "SAVED",
  "tickets",
  Object.keys(best.parsed.tickets || {}).length,
  "open",
  Object.keys(best.parsed.openTickets || {}).length,
  "tour",
  Object.keys(best.parsed.tourTickets || {}).length,
  "tech",
  (best.parsed.technicians || []).length,
  "statuses",
  Object.keys(best.parsed.statuses || {}).length,
);
