import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  
  const evalResult = await page.evaluate(() => {
    try {
      if (typeof window.renderSchedule === 'function') {
        window.renderSchedule();
        return "Executed global renderSchedule gracefully";
      } else {
        // try to find what `renderSchedule` does or if it's there
        return "renderSchedule is not global";
      }
    } catch(e) {
      return "ERROR: " + e.stack;
    }
  });
  console.log("EVAL RESULT: ", evalResult);
  
  const innerHTML = await page.evaluate(() => {
    const el = document.getElementById('schedule-grid');
    return el ? el.innerHTML : 'No element';
  });
  console.log("INNER HTML: ", innerHTML);
  
  const events = await page.evaluate(() => {
    return "Check complete";
  });

  await browser.close();
})();
