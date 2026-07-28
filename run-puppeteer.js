const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  await page.goto('http://localhost:8082/test-bounds.html');
  await new Promise(r => setTimeout(r, 2000));
  
  const body = await page.evaluate(() => document.body.innerText);
  console.log("PAGE BODY:");
  console.log(body);
  
  await browser.close();
  process.exit(0);
})();
