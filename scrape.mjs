import { chromium } from "playwright";
import fs from "fs";

const URL =
  "https://theaihl.com/leagues/print_schedule.cfm?clientID=3856&leagueID=11464&mixed=1&teamID=0";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const debug = {
    updatedAt: new Date().toISOString(),
    source: URL,
    finalUrl: "",
    httpStatus: null,
    title: "",
    note: "",
    tableMeta: null
  };

  try {
    const resp = await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    debug.httpStatus = resp ? resp.status() : null;

    // give it a moment to render (if it ever will)
    await page.waitForTimeout(5000);

    debug.finalUrl = page.url();
    debug.title = await page.title();

    // Try to grab the biggest table on the page
    const best = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll("table"));
      const pageText = (document.body?.innerText || "").slice(0, 1200);

      if (!tables.length) {
        return { rows: [], meta: { note: "No tables found", pageTextPreview: pageText } };
      }

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
      return { rows: top.rows, meta: { tableIndex: top.idx, rows: top.rowCount, cols: top.colCount, pageTextPreview: pageText } };
    });

    debug.tableMeta = best.meta;

    // Save artifacts for troubleshooting
    fs.mkdirSync("docs", { recursive: true });

    const html = await page.content();
    fs.writeFileSync("docs/debug.html", html, "utf8");
    fs.writeFileSync("docs/debug.json", JSON.stringify(debug, null, 2), "utf8");
    await page.screenshot({ path: "docs/debug.png", fullPage: true });

    // The actual payload your Google Script will use later
    const payload = {
      updatedAt: debug.updatedAt,
      source: debug.source,
      meta: best.meta || {},
      table: best.rows || []
    };
    fs.writeFileSync("docs/schedule.json", JSON.stringify(payload, null, 2), "utf8");

    console.log(`HTTP ${debug.httpStatus} | title="${debug.title}" | rows=${(payload.table || []).length}`);
  } catch (e) {
    debug.note = String(e);

    fs.mkdirSync("docs", { recursive: true });
    fs.writeFileSync("docs/debug.json", JSON.stringify(debug, null, 2), "utf8");

    console.log("SCRAPE ERROR:", e);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
