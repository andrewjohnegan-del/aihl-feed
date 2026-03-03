import { chromium } from "playwright";
import fs from "fs";

const URL =
  "https://www.theaihl.com/leagues/schedules.cfm?clientid=3856&leagueID=11464&schedType=main&printPage=0";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(URL, { waitUntil: "networkidle", timeout: 120000 });

  const games = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="gameID="]'));
    const seen = new Set();
    const out = [];

    for (const a of links) {
      const href = a.getAttribute("href") || "";
      const m = href.match(/gameID=(\d+)/i);
      if (!m) continue;

      const gameId = m[1];
      if (seen.has(gameId)) continue;
      seen.add(gameId);

      const container =
        a.closest("tr, .row, .game, .card, li, div") || a.parentElement;

      const text = (container?.innerText || a.innerText || "")
        .replace(/\s+/g, " ")
        .trim();

      out.push({ gameId, raw: text });
    }

    return out;
  });

  await browser.close();

  const payload = {
    updatedAt: new Date().toISOString(),
    source: URL,
    games,
  };

  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync("docs/schedule.json", JSON.stringify(payload, null, 2), "utf8");

  console.log(`Wrote ${games.length} games`);
})();
