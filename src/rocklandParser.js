const HEADER = /ROCKLAND\s+BAKERY[\s\S]*?\*DELIVERY\*\s*\*TICKET\*/i;
const TICKET_START = /(?=ROCKLAND\s+BAKERY)/gi;
const ITEM_LINE = /^\s*(\d+(?:\.\d+)?)\s+(EA|DZ|PK|BX|CA|CS|BG|LB)\s+(.+?)\s+([A-Z]{2})\s+(\d{4}-\d{2})\s*$/i;

const clean = value => value?.replace(/\s+/g, ' ').trim() || null;

function parseDate(value) {
  const match = value?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[1]}-${match[2]}` : null;
}

function findAddress(lines, customerName) {
  const index = lines.findIndex(line => clean(line)?.toUpperCase() === customerName?.toUpperCase());
  if (index < 0) return null;
  const candidates = lines.slice(index + 1, index + 5).map(clean).filter(Boolean);
  return clean(candidates.filter(line => !/^(UNIT|PO DATE|PO#|QUANTITY|UOM)/i.test(line)).join(', '));
}

export function parseRocklandTicket(text, pageNumber = null) {
  const normalized = text.replace(/\r/g, '');
  const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean);
  if (!HEADER.test(normalized)) return null;

  const ticketNumber = normalized.match(/NUMBER\s+DATE\s+(\d{7,10})/i)?.[1]
    || lines.find(line => /^\d{7,10}$/.test(line));
  const date = parseDate(normalized.match(/\d{2}\/\d{2}\/\d{4}/)?.[0]);
  const routeMatch = normalized.match(/\b(\d{4})\s+([^\n]+?)(?=\s+(?:Net|\d+%|\d{6,}|[A-Z]{1,4}\d{5,})|\n)/i);
  const routeCode = routeMatch?.[1] || null;
  const routeName = clean(routeMatch?.[2]);

  const shipIndex = lines.findIndex(line => /^Ship\s*To$/i.test(line) || /^Ship To/i.test(line));
  const quantityIndex = lines.findIndex(line => /^QUANTITY\s+UOM/i.test(line));
  const shipBlock = shipIndex >= 0 ? lines.slice(shipIndex + 1, quantityIndex > shipIndex ? quantityIndex : shipIndex + 12) : [];
  const phoneLine = shipBlock.find(line => /\(\d{3}\)\s*\d{3}-\d{4}/.test(line));
  const phone = phoneLine?.match(/\(\d{3}\)\s*\d{3}-\d{4}/)?.[0] || null;
  const contact = clean(phoneLine?.replace(phone || '', ''));

  const ignored = /^(PO DATE|PO#|RT \d+|Ship To|Bill To|ORDER DATE)/i;
  const customerCandidates = shipBlock
    .map(clean)
    .filter(line => line && !ignored.test(line) && !/\(\d{3}\)/.test(line) && !/^\d+\s+/.test(line) && !/^[A-Z ]+,\s*[A-Z]{2}\s+\d{5}/.test(line));
  const customerName = customerCandidates[0] || null;
  const address = findAddress(shipBlock, customerName);

  const items = [];
  for (const line of lines) {
    const match = line.match(ITEM_LINE);
    if (!match) continue;
    items.push({
      quantity: Number(match[1]),
      uom: match[2].toUpperCase(),
      description: clean(match[3]),
      vendor: match[4].toUpperCase(),
      itemCode: match[5]
    });
  }

  const instructions = clean(lines.slice(0, Math.max(shipIndex, 0)).filter(line =>
    /DEL TO|DO NOT|USE KEY|BRING INSIDE|BACK DOOR|FRONT DOOR|LOADING DOCK|COVER BOXES|NO POPPY|DRUG FREE/i.test(line)
  ).join(' '));
  const units = Number(normalized.match(/UNITS\s+(\d+(?:\.\d+)?)/i)?.[1] || 0);

  const required = [ticketNumber, date, routeCode, customerName, items.length];
  const confidence = Math.round((required.filter(Boolean).length / required.length) * 100);

  return {
    pageNumber,
    ticketNumber: ticketNumber || null,
    date,
    routeCode,
    routeName,
    customer: { name: customerName, address, contact, phone, instructions },
    items,
    units,
    confidence,
    warnings: [
      !routeCode && 'Route number not found',
      !customerName && 'Customer name not found',
      !items.length && 'No product rows found'
    ].filter(Boolean)
  };
}

export function parseRocklandText(text) {
  const chunks = text.split(TICKET_START).filter(chunk => HEADER.test(chunk));
  const tickets = chunks.map((chunk, index) => parseRocklandTicket(chunk, index + 1)).filter(Boolean);
  const routes = Object.values(tickets.reduce((map, ticket) => {
    const code = ticket.routeCode || 'UNASSIGNED';
    map[code] ||= { routeCode: code, routeName: ticket.routeName, date: ticket.date, tickets: [] };
    map[code].tickets.push(ticket);
    return map;
  }, {}));
  return {
    format: 'ROCKLAND_DELIVERY_TICKETS',
    ticketCount: tickets.length,
    routeCount: routes.length,
    routes,
    tickets,
    averageConfidence: tickets.length ? Math.round(tickets.reduce((sum, ticket) => sum + ticket.confidence, 0) / tickets.length) : 0
  };
}
