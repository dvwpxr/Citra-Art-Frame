const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  await page.goto('http://localhost:8080/pages/ar.html?id=123', {waitUntil: 'networkidle0'});
  
  const stuck = await page.evaluate(() => {
    return document.getElementById("start-ar-confirm")?.disabled;
  });
  console.log("Is Start AR button disabled?", stuck);
  
  const progress = await page.evaluate(() => {
    return document.getElementById("ar-progress-text")?.textContent;
  });
  console.log("Progress Text:", progress);

  await browser.close();
})();
