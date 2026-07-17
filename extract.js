import fs from 'node:fs';
import OpenAI from 'openai';

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    stops: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          customerName: { type: 'string' },
          address: { type: 'string' },
          invoiceNumber: { type: ['string', 'null'] },
          invoiceValue: { type: 'number' },
          boxCount: { type: 'integer' },
          routeHint: { type: ['string', 'null'] },
          confidence: { type: 'number' }
        },
        required: ['customerName','address','invoiceNumber','invoiceValue','boxCount','routeHint','confidence']
      }
    }
  },
  required: ['stops']
};

export async function extractInvoice(file) {
  if (!process.env.OPENAI_API_KEY) return demoExtraction(file.originalname);
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const base64 = fs.readFileSync(file.path).toString('base64');
  const isImage = file.mimetype.startsWith('image/');
  const content = [{ type: 'input_text', text: 'Extract every delivery customer from this invoice or loading document. Preserve exact customer names and mailing/delivery addresses. Return invoice value and box count when visible. Use confidence 0 to 1. Do not invent missing values.' }];
  if (isImage) content.push({ type: 'input_image', image_url: `data:${file.mimetype};base64,${base64}` });
  else content.push({ type: 'input_text', text: `Uploaded PDF filename: ${file.originalname}. The current Phase 1 server cannot rasterize PDFs. Return one low-confidence review row identifying that manual review is needed.` });
  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    input: [{ role: 'user', content }],
    text: { format: { type: 'json_schema', name: 'invoice_stops', strict: true, schema } }
  });
  return JSON.parse(response.output_text).stops;
}

function demoExtraction(filename) {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  return [
    { customerName: `${base} Customer 1`, address: '125 Main Street, Hartford, CT 06103', invoiceNumber: 'DEMO-1001', invoiceValue: 842.35, boxCount: 18, routeHint: 'Hartford', confidence: 0.62 },
    { customerName: `${base} Customer 2`, address: '88 Park Avenue, West Hartford, CT 06119', invoiceNumber: 'DEMO-1002', invoiceValue: 516.20, boxCount: 11, routeHint: 'West Hartford', confidence: 0.58 }
  ];
}
