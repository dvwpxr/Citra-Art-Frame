const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  await page.goto('http://localhost:8080/test_bounds3.html', {waitUntil: 'networkidle0'});
  await new Promise(r => setTimeout(r, 1000));
  await browser.close();
})();
