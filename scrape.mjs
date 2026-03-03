import { chromium } from "playwright";
import fs from "fs";

const URL =
  "https://theaihl.com/leagues/print_schedule.cfm?clientID=3856&leagueID=11464&mixed=1&teamID=0";

function cellText(td) {
  return (td.innerText || "").replace(/\s+/g, " ").trim();
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(URL, { waitUntil: "networkidle", timeout: 120000 });

  // Wait briefly in case the page takes a moment
  await page.waitForTimeout(2000);

  // Pull the biggest table on the page
  const best = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll("table"));
    if (!tables.length) return { rows: [], meta: { note: "No tables found" } };

    const parsed = tables.map((t, idx) => {
      const rows = Array.from(t.querySelectorAll("tr")).map(tr =>
        Array.from(tr.querySelectorAll("th,td")).map(td =>
          (td.innerText || "").replace(/\s+/g, " ").trim()
        )
      );
      const rowCount = rows.length;
      const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
      return { idx, rows, rowCount, colCount };
    });

    parsed.sort((a, b) => (b.rowCount - a.rowCount) || (b.colCount - a.colCount));
    const top = parsed[0];
    return { rows: top.rows, meta: { tableIndex: top.idx, rows: top.rowCount, cols: top.colCount } };
  });

  // Optional: also save a debug HTML snapshot so we can inspect if needed
  const html = await page.content();

  await browser.close();

  const payload = {
    updatedAt: new Date().toISOString(),
    source: URL,
    table: best.rows || [],
    meta: best.meta || {},
  };

  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync("docs/schedule.json", JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync("docs/debug.html", html, "utf8");

  console.log(`Wrote rows: ${(payload.table || []).length}`);
})();
