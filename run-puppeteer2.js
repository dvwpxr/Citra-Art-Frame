const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:8082/test-bounds2.html');
  await new Promise(r => setTimeout(r, 2000));
  const body = await page.evaluate(() => document.body.innerText);
  console.log("HIERARCHY:\n", body);
  await browser.close();
  process.exit(0);
})();
