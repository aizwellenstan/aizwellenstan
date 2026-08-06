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

  // 1. EXTRACT SCORES AND GRAPH METRICS
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

  // Calculate coordinates for SVG elements based on score (Scale: 2.00 at x=42.5, 4.00 at x=232.5)
  const scoreNum = parseFloat(data.score) || 3.39;
  const scoreX = 42.5 + ((scoreNum - 2.0) / 2.0) * (232.5 - 42.5); // x position for line
  const triangleX = scoreX - 6.5; // Offset for indicator triangle

  // 2. GENERATE A STATIC GITHUB-COMPATIBLE GRAPH SVG (NO MASKS, NO INLINE TRANSFORMS)
  const chartSvg = `<svg width="275" height="88" viewBox="0 0 275 88" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="lapras_grad" x1="0" y1="0" x2="275" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#1ED2E6"/>
<stop offset="0.14" stop-color="#19B0E9"/>
<stop offset="0.35" stop-color="#1280EE"/>
<stop offset="0.45" stop-color="#0F6EF0"/>
<stop offset="1" stop-color="#003296"/>
</linearGradient>
</defs>
<path fill-rule="evenodd" clip-rule="evenodd" d="M274.149 76L274.149 74.611C233.382 71.4458 214.053 55.277 197.037 40.0867C192.939 36.4289 189.032 32.7793 185.258 29.2553C168.226 13.3482 153.934 0 137.298 0C120.662 0 106.369 13.3483 89.3373 29.2553C85.564 32.7793 81.6563 36.4289 77.5589 40.0868C60.5431 55.277 41.2135 71.4459 0.446778 74.6111L0.446778 76L274.149 76Z" fill="url(#lapras_grad)"/>
<rect x="${scoreX}" y="0" width="${275 - scoreX}" height="76" fill="#D7E6F5" opacity="0.6"/>
<g opacity="0.5">
<line x1="42.5" y1="0" x2="42.5" y2="76" stroke="#FFFFFF"/>
<text x="42.5" y="86" text-anchor="middle" fill="#666666" font-size="10">2.00</text>
<line x1="90" y1="0" x2="90" y2="76" stroke="#FFFFFF"/>
<text x="90" y="86" text-anchor="middle" fill="#666666" font-size="10">2.50</text>
<line x1="137.5" y1="0" x2="137.5" y2="76" stroke="#FFFFFF"/>
<text x="137.5" y="86" text-anchor="middle" fill="#666666" font-size="10">3.00</text>
<line x1="185" y1="0" x2="185" y2="76" stroke="#FFFFFF"/>
<text x="185" y="86" text-anchor="middle" fill="#666666" font-size="10">3.50</text>
<line x1="232.5" y1="0" x2="232.5" y2="76" stroke="#FFFFFF"/>
<text x="232.5" y="86" text-anchor="middle" fill="#666666" font-size="10">4.00</text>
</g>
<line x1="${scoreX}" y1="0" x2="${scoreX}" y2="76" stroke="#FF5A5F" stroke-width="2"/>
<path d="M7.86602 11.25C7.48111 11.9167 6.51886 11.9167 6.13396 11.25L0.504801 1.5C0.119901 0.833331 0.601026 0 1.37083 0L12.6292 0C13.399 0 13.8801 0.833333 13.4952 1.5L7.86602 11.25Z" transform="translate(${triangleX}, 0)" fill="#FF5A5F"/>
</svg>`;

  // 3. BUILD BREAKDOWN ROWS
  const breakdownRows = data.items.map(item => `<tr><td><font color="#111111"><b>${item.label}</b></font></td><td align="right"><font color="#111111"><b>${item.value}</b></font></td><td><font color="#333333" size="2">${item.source}</font></td></tr>`).join('');

  // 4. CLEAN GITHUB HTML CONTAINER
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
  console.log('Successfully updated README.md with visible static SVG graph!');

  await browser.close();
})();
