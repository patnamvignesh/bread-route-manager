import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRocklandText } from '../src/rocklandParser.js';

const sample = `ROCKLAND BAKERY
INC.
*DELIVERY*
*TICKET*
NUMBER DATE
30031509
09/20/2025
Saturday
ROUTE REFERENCE TERMS PAGE
0202 Hartford/Mass Rt2 Net 30 1
Bill To
DEL TO FRONT DOOR COVER BOXES
25819 -
MARLBOROUGH BAKERY
8 INDEPENDENT DR
MARLBOROUGH, CT 06447- USA
Ship To
SANDRA SQUILLANTE (860) 748-1795
MARLBOROUGH BAKERY
8 INDEPENDENT DR
MARLBOROUGH, CT 06447- USA
QUANTITY UOM DESCRIPTION VN ITEM
6.00 EA BASTONE SOL EA RB 0111-01
6.00 EA BASTONE SES SOL EA RB 0112-01
6.00 DZ BAGEL PLAIN LG SOL DZ RB 0165-01
UNITS
18.00`;

test('extracts a Rockland ticket into route, customer and products', () => {
  const result = parseRocklandText(sample);
  assert.equal(result.ticketCount, 1);
  assert.equal(result.routeCount, 1);
  const ticket = result.tickets[0];
  assert.equal(ticket.routeCode, '0202');
  assert.equal(ticket.ticketNumber, '30031509');
  assert.equal(ticket.customer.name, 'MARLBOROUGH BAKERY');
  assert.equal(ticket.customer.phone, '(860) 748-1795');
  assert.match(ticket.customer.instructions, /FRONT DOOR/);
  assert.equal(ticket.items.length, 3);
  assert.deepEqual(ticket.items[2], {
    quantity: 6,
    uom: 'DZ',
    description: 'BAGEL PLAIN LG SOL DZ',
    vendor: 'RB',
    itemCode: '0165-01'
  });
});

test('preserves fractional bakery quantities', () => {
  const result = parseRocklandText(sample.replace('6.00 DZ BAGEL', '0.25 DZ BAGEL'));
  assert.equal(result.tickets[0].items[2].quantity, 0.25);
});
