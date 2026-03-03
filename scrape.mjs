import { chromium } from "playwright";
import fs from "fs";

const URL =
  "https://www.theaihl.com/leagues/schedules.cfm?clientid=3856&leagueID=11464&schedType=main&printPage=1";

async function extractLargestTableFromContext(context) {
  // context can be a Page or a Frame
  const tables = await context.evaluate(() => {
    const all = Array.from(document.querySelectorAll("table"));
    return all.map((t, idx) => {
      const rows = Array.from(t.querySelectorAll("tr")).map(tr =>
        Array.from(tr.querySelectorAll("th,td")).map(td => (td.innerText || "").trim())
      );
      const rowCount = rows.length;
      const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
      return { idx, rowCount, colCount, rows };
    });
  });

  if (!tables || tables.length === 0) return null;

  // pick the "largest" table by rowCount then colCount
  tables.sort((a, b) => (b.rowCount - a.rowCount) || (b.colCount - a.colCount));
  return tables[0];
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 120000 });

  // Give the page a moment in case it hydrates content after initial load
  await page.waitForTimeout(4000);

  // 1) Try extracting from the main page
  let best = await extractLargestTableFromContext(page);

  // 2) If not found or empty, try frames (some sites render content in an iframe)
  if (!best || !best.rows || best.rows.length < 2) {
    for (const frame of page.frames()) {
      try {
        const candidate = await extractLargestTableFromContext(frame);
        if (candidate && candidate.rows && candidate.rows.length > (best?.rows?.length || 0)) {
          best = candidate;
        }
      } catch (e) {
        // ignore frames we can't read
      }
    }
  }

  await browser.close();

  const payload = {
    updatedAt: new Date().toISOString(),
    source: URL,
    table: best?.rows || [],
    meta: best ? { tableIndex: best.idx, rows: best.rowCount, cols: best.colCount } : { note: "No tables found" }
  };

  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync("docs/schedule.json", JSON.stringify(payload, null, 2), "utf8");

  console.log(`Wrote rows: ${(payload.table || []).length}`);
})();
