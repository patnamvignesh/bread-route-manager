import fs from 'node:fs/promises';
import OpenAI from 'openai';

const schemaInstruction = `Extract one Rockland Bakery delivery ticket from the image. Return JSON only with: ticketNumber, date (YYYY-MM-DD), routeCode, routeName, customer{name,address,contact,phone,instructions}, items[{quantity,uom,description,vendor,itemCode}], units, confidence, warnings. Preserve fractional quantities such as 0.25 and 1.50. Do not invent missing values; use null and add a warning.`;

export async function extractTicketImage(filePath, mimeType) {
  if (!process.env.OPENAI_API_KEY) {
    return { status: 'OCR_CONFIGURATION_REQUIRED', message: 'Set OPENAI_API_KEY to process image-only tickets.' };
  }
  if (!String(mimeType).startsWith('image/')) {
    return { status: 'PAGE_RENDER_REQUIRED', message: 'Image-only PDFs must first be rendered into page images by the deployment OCR worker.' };
  }
  const bytes = await fs.readFile(filePath);
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OCR_MODEL || 'gpt-4.1-mini',
    input: [{ role: 'user', content: [
      { type: 'input_text', text: schemaInstruction },
      { type: 'input_image', image_url: `data:${mimeType};base64,${bytes.toString('base64')}` }
    ] }],
    text: { format: { type: 'json_object' } }
  });
  const parsed = JSON.parse(response.output_text);
  return { status: 'EXTRACTED', extraction: parsed };
}
