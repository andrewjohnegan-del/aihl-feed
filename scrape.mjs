import { chromium } from "playwright";
import fs from "fs";

const URL =
  "https://www.theaihl.com/leagues/schedules.cfm?clientid=3856&leagueID=11464&schedType=main&printPage=1";

function clean(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(URL, { waitUntil: "networkidle", timeout: 120000 });

  // Pull the first HTML table on the page (print view is usually a simple table)
  const rows = await page.evaluate(() => {
    const table = document.querySelector("table");
    if (!table) return [];
    const trs = Array.from(table.querySelectorAll("tr"));
    return trs.map(tr =>
      Array.from(tr.querySelectorAll("th,td")).map(td => td.innerText.trim())
    );
  });

  await browser.close();

  const payload = {
    updatedAt: new Date().toISOString(),
    source: URL,
    table: rows
  };

  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync("docs/schedule.json", JSON.stringify(payload, null, 2), "utf8");

  console.log(`Wrote table rows: ${rows.length}`);
})();
