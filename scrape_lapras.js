const fs = require('fs');
const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  console.log('Navigating to LAPRAS...');
  await page.goto('https://lapras.com/public/aizwellenstan', {
    waitUntil: 'networkidle2'
  });

  await page.waitForSelector('.scores', { timeout: 10000 });

  // 1. EXACT GRAPH SVG SANITIZATION LOGIC (UNTOUCHED)
  const chartSvg = await page.evaluate(() => {
    const scoresEl = document.querySelector('.scores');
    if (!scoresEl) return '';

    // Convert computed transforms (e.g. pointer lines) into static x/y attributes
    scoresEl.querySelectorAll('line, path, rect').forEach(el => {
      const computedStyle = window.getComputedStyle(el);
      const transform = computedStyle.transform;
      
      // Fix transform matrices into inline attributes so GitHub can render them
      if (transform && transform !== 'none') {
        const values = transform.match(/matrix\((.+)\)/);
        if (values) {
          const coords = values[1].split(', ');
          const translateX = parseFloat(coords[4]);
          if (el.tagName === 'line') {
            const currentX1 = parseFloat(el.getAttribute('x1') || '0');
            const currentX2 = parseFloat(el.getAttribute('x2') || '0');
            el.setAttribute('x1', (currentX1 + translateX).toString());
            el.setAttribute('x2', (currentX2 + translateX).toString());
            el.style.transform = '';
          }
        }
      }

      // Hardcode colors directly onto SVG elements
      if (computedStyle.stroke && computedStyle.stroke !== 'none') {
        el.setAttribute('stroke', computedStyle.stroke);
      }
      if (computedStyle.fill && computedStyle.fill !== 'none') {
        el.setAttribute('fill', computedStyle.fill);
      }
    });

    // Replace the mask with a simple solid fill blue curve if gradients fail
    const fillRect = scoresEl.querySelector('.fill-rect-1');
    if (fillRect) {
      fillRect.setAttribute('fill', '#0F6EF0');
    }

    const svg = scoresEl.querySelector('.position-chart svg');
    return svg ? svg.outerHTML : '';
  });

  // 2. EXTRACT DATA VALUES
  const data = await page.evaluate(() => {
    const score = document.querySelector('.score-head-value')?.innerText.trim() || '3.39';
    const rank = document.querySelector('.position-chart .text')?.innerText.trim() || 'エンジニアの上位 21.43%';
    
    const items = Array.from(document.querySelectorAll('.detail-list .item')).map(item => ({
      label: item.querySelector('.label')?.innerText.trim() || '',
      value: item.querySelector('.value')?.innerText.trim() || '',
      source: item.querySelector('.source')?.innerText.trim() || ''
    }));

    return { score, rank, items };
  });

  // 3. BUILD BREAKDOWN ROWS WITH DARK TEXT COLORS (#111111 and #333333)
  const breakdownRows = data.items.map(item => `<tr><td><font color="#111111"><b>${item.label}</b></font></td><td align="right"><font color="#111111"><b>${item.value}</b></font></td><td><font color="#333333" size="2">${item.source}</font></td></tr>`).join('');

  // 4. CLEAN GITHUB HTML WITH COMPACT TEXT HEADER (</> REMOVED) + BOTTOM CARDS
  const cleanCardHtml = `<div align="center">
<table border="0" cellpadding="16" cellspacing="0" width="100%" bgcolor="#EEF6FF">
<tr>
<td colspan="3" style="padding-bottom: 0px;">
<font size="2" color="#2D3748"><b>技術力スコア</b></font><br/>
<font size="5" color="#111111"><b>${data.score}</b></font> <font color="#718096" size="1"><u>v2.3.0</u></font>
</td>
</tr>
<tr valign="top">
<td width="48%" height="200" bgcolor="#FFFFFF" align="center" valign="middle">
${chartSvg}
<br/>
<font size="3" color="#111111"><b>${data.rank}</b></font>
</td>
<td width="4%"></td>
<td width="48%" height="200" bgcolor="#FFFFFF" valign="middle">
<font size="3" color="#111111"><b>▌ 内訳</b></font>
<br/><br/>
<table border="0" cellpadding="4" cellspacing="0" width="100%">
${breakdownRows}
</table>
</td>
</tr>
</table>
</div>`;

  // Inject into README.md
  const readmePath = 'README.md';
  let readme = fs.readFileSync(readmePath, 'utf8');
  const startTag = '<!-- LAPRAS-STATS:START -->';
  const endTag = '<!-- LAPRAS-STATS:END -->';

  const regex = new RegExp(`${startTag}[\\s\\S]*?${endTag}`);
  const updatedReadme = readme.replace(
    regex,
    `${startTag}\n${cleanCardHtml}\n${endTag}`
  );

  fs.writeFileSync(readmePath, updatedReadme);
  console.log('Successfully updated README.md with text-only compact header!');

  await browser.close();
})();
