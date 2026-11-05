const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const iconsDir = path.resolve('d:/Personal Agent/apps/frontend/public/icons');

async function run() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const files = fs.readdirSync(iconsDir).filter((f) => f.endsWith('.svg'));

  for (const file of files) {
    const filePath = path.join(iconsDir, file);
    let svgContent = fs.readFileSync(filePath, 'utf8');

    // Let's strip out any large background rects that cover the whole SVG
    // (Assuming the viewBox is around 547x461)
    svgContent = svgContent.replace(
      /<rect[^>]+width="(547|548|546)"[^>]+height="(461|462|460)"[^>]*\/>/gi,
      ''
    );
    // Also remove `<rect ... width="100%" height="100%" />` if any
    svgContent = svgContent.replace(/<rect[^>]+width="100%"[^>]+height="100%"[^>]*\/>/gi, '');

    // Render the SVG in the browser
    await page.setContent(`
            <!DOCTYPE html>
            <html>
            <body style="margin:0;padding:0;">
                <div id="svg-container" style="display:inline-block;">
                    ${svgContent}
                </div>
            </body>
            </html>
        `);

    // Compute the bounding box
    const bbox = await page.evaluate(() => {
      const svg = document.querySelector('svg');
      if (!svg) return null;
      // Get all child elements except defs, title, etc.
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      // Move children into g to measure
      const children = Array.from(svg.children).filter(
        (c) => c.tagName !== 'defs' && c.tagName !== 'style'
      );
      children.forEach((c) => g.appendChild(c));
      svg.appendChild(g);

      const box = g.getBBox();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });

    if (bbox && bbox.width > 0 && bbox.height > 0) {
      console.log(`Computed bbox for ${file}:`, bbox);

      // Rewrite the viewBox
      // Allow a tiny margin of 2px
      const padding = 2;
      const newViewBox = `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`;

      // Replace viewBox attribute
      svgContent = svgContent.replace(/viewBox="[^"]+"/, `viewBox="${newViewBox}"`);
      // Remove hardcoded width and height on SVG if any
      svgContent = svgContent.replace(/<svg([^>]*)width="[^"]*"([^>]*)>/, '<svg$1$2>');
      svgContent = svgContent.replace(/<svg([^>]*)height="[^"]*"([^>]*)>/, '<svg$1$2>');

      fs.writeFileSync(filePath, svgContent, 'utf8');
    } else {
      console.log(`Failed to compute bbox for ${file}`);
    }
  }

  await browser.close();
}

run().catch(console.error);
