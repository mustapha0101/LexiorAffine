import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
const rawBuffer = fs.readFileSync('dummy.pdf');
const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(rawBuffer), standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' });
loadingTask.promise.then(async (pdfDocument) => {
  let extractedText = '';
  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();
    extractedText += textContent.items.map(s => s.str).join(' ') + '\n';
  }
  console.log('Extracted:', extractedText.substring(0, 100));
}).catch(console.error);
