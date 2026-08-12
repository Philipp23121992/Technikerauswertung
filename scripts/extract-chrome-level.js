const { ClassicLevel } = require("classic-level");
const fs = require("fs");
const path = require("path");

async function main() {
  const dbPath = path.join(process.env.TEMP, "techniker-leveldb-copy");
  const db = new ClassicLevel(dbPath, { keyEncoding: "buffer", valueEncoding: "buffer" });
  await db.open();

  let best = null;
  for await (const [keyBuf, valueBuf] of db.iterator()) {
    const key = keyBuf.toString("utf8");
    if (!key.includes("technikerauswertung.tracker")) continue;
    console.log("KEY", JSON.stringify(key), "vlen", valueBuf.length);

    // Chrome localStorage value: often starts with 0x01 then UTF-8/UTF-16 string
    let text = null;
    if (valueBuf[0] === 0x01) {
      text = valueBuf.subarray(1).toString("utf8");
      if (!text.startsWith("{")) {
        text = valueBuf.subarray(1).toString("utf16le");
      }
    } else {
      text = valueBuf.toString("utf8");
      if (!text.includes('"year"')) text = valueBuf.toString("utf16le");
    }

    const start = text.indexOf('{"year":');
    if (start === -1) {
      console.log("no json start, sample", text.slice(0, 80));
      continue;
    }
    const json = text.slice(start);
    try {
      const parsed = JSON.parse(json);
      const score =
        Object.keys(parsed.tickets || {}).length +
        Object.keys(parsed.openTickets || {}).length +
        Object.keys(parsed.tourTickets || {}).length +
        (parsed.technicians || []).length;
      console.log("parsed score", score);
      if (!best || score > best.score) best = { key, score, parsed };
    } catch (err) {
      console.log("parse error", err.message, "head", json.slice(0, 120));
    }
  }

  await db.close();

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
    "SAVED tickets",
    Object.keys(best.parsed.tickets || {}).length,
    "open",
    Object.keys(best.parsed.openTickets || {}).length,
    "tour",
    Object.keys(best.parsed.tourTickets || {}).length,
    "tech",
    (best.parsed.technicians || []).length,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
