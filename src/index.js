import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import pdf from 'pdf-parse';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { parseRocklandText } from './rocklandParser.js';

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET || 'development-only-change-me';
const uploadDir = path.resolve('uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 30 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadDir));
app.use(express.static('public'));

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const signToken = user => jwt.sign({ sub: user.id, role: user.role, name: user.name }, jwtSecret, { expiresIn: '12h' });
function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try { req.user = jwt.verify(token, jwtSecret); next(); } catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
}
const allow = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Insufficient permission' });
const parseDate = value => value ? new Date(`${value}T12:00:00`) : new Date();

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'bread-route-manager', rocklandParser: true }));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const input = z.object({ email: z.string().email(), password: z.string().min(6) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));

app.get('/api/me', authenticate, asyncRoute(async (req, res) => {
  res.json(await prisma.user.findUnique({ where: { id: Number(req.user.sub) }, select: { id: true, name: true, email: true, role: true } }));
}));

app.get('/api/users', authenticate, allow('MANAGER'), asyncRoute(async (_req, res) => {
  res.json(await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true }, orderBy: [{ role: 'asc' }, { name: 'asc' }] }));
}));

app.get('/api/routes', authenticate, asyncRoute(async (req, res) => {
  const where = req.user.role === 'MANAGER' ? {} : { assignments: { some: { userId: Number(req.user.sub) } } };
  res.json(await prisma.route.findMany({ where, orderBy: [{ routeDate: 'desc' }, { routeCode: 'asc' }], include: { assignments: { include: { user: { select: { id: true, name: true, role: true } } } }, customers: { orderBy: { stopOrder: 'asc' }, include: { items: { include: { product: true } } } } } }));
}));

app.post('/api/routes', authenticate, allow('MANAGER'), asyncRoute(async (req, res) => {
  const input = z.object({ routeCode: z.string().min(1), routeName: z.string().optional(), routeDate: z.string().optional() }).parse(req.body);
  res.status(201).json(await prisma.route.create({ data: { routeCode: input.routeCode, routeName: input.routeName, routeDate: input.routeDate ? new Date(input.routeDate) : new Date() } }));
}));

app.put('/api/routes/:id/assignments', authenticate, allow('MANAGER'), asyncRoute(async (req, res) => {
  const routeId = Number(req.params.id);
  const input = z.object({ assignments: z.array(z.object({ userId: z.number().int(), workType: z.enum(['MANAGER','PACKER','PICKER','DRIVER']) })) }).parse(req.body);
  await prisma.$transaction([prisma.assignment.deleteMany({ where: { routeId } }), ...input.assignments.map(a => prisma.assignment.create({ data: { routeId, ...a } }))]);
  res.json(await prisma.assignment.findMany({ where: { routeId }, include: { user: true } }));
}));

app.get('/api/routes/:id/packing-board', authenticate, asyncRoute(async (req, res) => {
  const route = await prisma.route.findUnique({ where: { id: Number(req.params.id) }, include: { customers: { orderBy: { stopOrder: 'asc' }, include: { items: { include: { product: true } } } } } });
  if (!route) return res.status(404).json({ error: 'Route not found' });
  const products = new Map();
  for (const customer of route.customers) for (const item of customer.items) {
    const entry = products.get(item.productId) || { productId: item.productId, productName: item.product.name, sku: item.product.sku, uom: item.uom, required: 0, packed: 0, short: 0, customers: [] };
    entry.required += item.quantity; entry.packed += item.packedQty; entry.short += item.shortQty;
    entry.customers.push({ itemId: item.id, customerId: customer.id, customerName: customer.name, quantity: item.quantity, uom: item.uom, packedQty: item.packedQty, shortQty: item.shortQty, status: item.status, notes: item.notes });
    products.set(item.productId, entry);
  }
  res.json({ route: { id: route.id, routeCode: route.routeCode, routeName: route.routeName, routeDate: route.routeDate, status: route.status }, products: [...products.values()].sort((a,b) => a.productName.localeCompare(b.productName)) });
}));

app.patch('/api/order-items/:id', authenticate, allow('MANAGER','PACKER'), asyncRoute(async (req, res) => {
  const input = z.object({ status: z.enum(['PENDING','DONE','SHORT']), packedQty: z.number().min(0), shortQty: z.number().min(0).default(0), notes: z.string().max(500).optional().nullable() }).parse(req.body);
  const existing = await prisma.orderItem.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) return res.status(404).json({ error: 'Order item not found' });
  if (input.packedQty + input.shortQty > existing.quantity + 0.0001) return res.status(400).json({ error: 'Packed and short quantities cannot exceed required quantity' });
  res.json(await prisma.orderItem.update({ where: { id: existing.id }, data: input, include: { product: true, customer: true } }));
}));

app.get('/api/routes/:id/picking-board', authenticate, allow('MANAGER','PICKER'), asyncRoute(async (req, res) => {
  const route = await prisma.route.findUnique({ where: { id: Number(req.params.id) }, include: { customers: { orderBy: { stopOrder: 'asc' }, include: { items: { include: { product: true } } } } } });
  if (!route) return res.status(404).json({ error: 'Route not found' });
  res.json(route);
}));

app.patch('/api/customers/:id/pick-status', authenticate, allow('MANAGER','PICKER'), asyncRoute(async (req, res) => {
  const { status } = z.object({ status: z.enum(['PENDING','DONE','SHORT']) }).parse(req.body);
  res.json(await prisma.customer.update({ where: { id: Number(req.params.id) }, data: { pickStatus: status } }));
}));

app.get('/api/routes/:id/driver-board', authenticate, allow('MANAGER','DRIVER'), asyncRoute(async (req, res) => {
  const route = await prisma.route.findUnique({ where: { id: Number(req.params.id) }, include: { customers: { orderBy: { stopOrder: 'asc' }, include: { items: { include: { product: true } } } } } });
  if (!route) return res.status(404).json({ error: 'Route not found' });
  res.json(route);
}));

app.patch('/api/customers/:id/delivery-status', authenticate, allow('MANAGER','DRIVER'), asyncRoute(async (req, res) => {
  const input = z.object({ status: z.enum(['PENDING','EN_ROUTE','ARRIVED','DELIVERED','ISSUE']), notes: z.string().max(1000).optional().nullable() }).parse(req.body);
  const timestamps = input.status === 'ARRIVED' ? { arrivedAt: new Date() } : input.status === 'DELIVERED' ? { deliveredAt: new Date() } : {};
  res.json(await prisma.customer.update({ where: { id: Number(req.params.id) }, data: { deliveryStatus: input.status, deliveryNotes: input.notes, ...timestamps } }));
}));

app.post('/api/customers/:id/proof', authenticate, allow('MANAGER','DRIVER'), upload.single('photo'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Photo is required' });
  res.json(await prisma.customer.update({ where: { id: Number(req.params.id) }, data: { proofPhotoPath: `/uploads/${req.file.filename}` } }));
}));

app.get('/api/documents', authenticate, allow('MANAGER'), asyncRoute(async (_req, res) => {
  const documents = await prisma.document.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(documents.map(document => ({ ...document, extraction: document.extractionRaw ? JSON.parse(document.extractionRaw) : null })));
}));

app.post('/api/documents/upload', authenticate, allow('MANAGER'), upload.single('document'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Document is required' });
  if (req.file.mimetype !== 'application/pdf') return res.status(415).json({ error: 'Rockland importer currently requires a text-based PDF' });
  const document = await prisma.document.create({ data: { originalName: req.file.originalname, storedPath: req.file.path, mimeType: req.file.mimetype, status: 'PROCESSING' } });
  try {
    const parsedPdf = await pdf(fs.readFileSync(req.file.path));
    const extraction = parseRocklandText(parsedPdf.text);
    if (!extraction.ticketCount) throw new Error('No Rockland delivery tickets were detected');
    const updated = await prisma.document.update({ where: { id: document.id }, data: { status: 'REVIEW_REQUIRED', extractionRaw: JSON.stringify(extraction) } });
    res.status(201).json({ ...updated, extraction });
  } catch (error) {
    await prisma.document.update({ where: { id: document.id }, data: { status: 'FAILED', extractionRaw: JSON.stringify({ error: error.message }) } });
    throw error;
  }
}));

app.post('/api/documents/:id/import', authenticate, allow('MANAGER'), asyncRoute(async (req, res) => {
  const document = await prisma.document.findUnique({ where: { id: Number(req.params.id) } });
  if (!document?.extractionRaw) return res.status(404).json({ error: 'Extraction not found' });
  if (document.status === 'IMPORTED') return res.status(409).json({ error: 'Document has already been imported' });
  const extraction = JSON.parse(document.extractionRaw);
  const selectedTickets = z.object({ ticketNumbers: z.array(z.string()).optional() }).parse(req.body || {}).ticketNumbers;
  const tickets = selectedTickets?.length ? extraction.tickets.filter(ticket => selectedTickets.includes(ticket.ticketNumber)) : extraction.tickets;
  const imported = { routes: 0, customers: 0, items: 0, skipped: 0 };

  for (const ticket of tickets) {
    if (!ticket.routeCode || !ticket.customer?.name || !ticket.items?.length) { imported.skipped += 1; continue; }
    const route = await prisma.route.upsert({
      where: { routeCode: ticket.routeCode },
      update: { routeName: ticket.routeName || undefined, routeDate: parseDate(ticket.date) },
      create: { routeCode: ticket.routeCode, routeName: ticket.routeName, routeDate: parseDate(ticket.date) }
    });
    imported.routes += 1;
    if (ticket.ticketNumber && await prisma.customer.findUnique({ where: { externalTicketId: ticket.ticketNumber } })) { imported.skipped += 1; continue; }
    const stopOrder = await prisma.customer.count({ where: { routeId: route.id } }) + 1;
    const customer = await prisma.customer.create({ data: {
      routeId: route.id,
      externalTicketId: ticket.ticketNumber,
      name: ticket.customer.name,
      address: ticket.customer.address,
      contactName: ticket.customer.contact,
      phone: ticket.customer.phone,
      instructions: ticket.customer.instructions,
      stopOrder
    } });
    imported.customers += 1;
    for (const item of ticket.items) {
      const product = await prisma.product.upsert({
        where: { name: item.description },
        update: { sku: item.itemCode || undefined, vendor: item.vendor || undefined },
        create: { name: item.description, sku: item.itemCode, vendor: item.vendor }
      });
      await prisma.orderItem.create({ data: { customerId: customer.id, productId: product.id, quantity: item.quantity, uom: item.uom } });
      imported.items += 1;
    }
  }
  await prisma.document.update({ where: { id: document.id }, data: { status: 'IMPORTED' } });
  res.json(imported);
}));

app.get('/api/reports/dashboard', authenticate, allow('MANAGER'), asyncRoute(async (_req, res) => {
  const [routes, customers, items, shortages, delivered, documents] = await Promise.all([prisma.route.count(), prisma.customer.count(), prisma.orderItem.count(), prisma.orderItem.count({ where: { shortQty: { gt: 0 } } }), prisma.customer.count({ where: { deliveryStatus: 'DELIVERED' } }), prisma.document.count()]);
  res.json({ routes, customers, orderLines: items, shortages, delivered, documents, deliveryCompletion: customers ? Math.round((delivered / customers) * 100) : 0 });
}));

app.get('/api/reports/shortages', authenticate, asyncRoute(async (_req, res) => {
  const rows = await prisma.orderItem.findMany({ where: { shortQty: { gt: 0 } }, orderBy: { updatedAt: 'desc' }, include: { product: true, customer: { include: { route: true } } } });
  res.json(rows.map(item => ({ id: item.id, route: item.customer.route.routeCode, customer: item.customer.name, product: item.product.name, uom: item.uom, required: item.quantity, packed: item.packedQty, short: item.shortQty, notes: item.notes, updatedAt: item.updatedAt })));
}));

app.get('/api/reports/export.csv', authenticate, allow('MANAGER'), asyncRoute(async (_req, res) => {
  const rows = await prisma.customer.findMany({ include: { route: true, items: { include: { product: true } } }, orderBy: [{ routeId: 'asc' }, { stopOrder: 'asc' }] });
  const csv = ['route,stop,ticket,customer,address,pick_status,delivery_status,item_code,product,uom,required,packed,short', ...rows.flatMap(c => c.items.map(i => [c.route.routeCode,c.stopOrder,c.externalTicketId||'',JSON.stringify(c.name),JSON.stringify(c.address||''),c.pickStatus,c.deliveryStatus,i.product.sku||'',JSON.stringify(i.product.name),i.uom,i.quantity,i.packedQty,i.shortQty].join(',')))].join('\n');
  res.type('text/csv').attachment('bread-route-report.csv').send(csv);
}));

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request', details: error.issues });
  if (error.code === 'P2002') return res.status(409).json({ error: 'A unique value already exists', field: error.meta?.target });
  res.status(500).json({ error: error.message || 'Internal server error' });
});

if (process.env.NODE_ENV !== 'test') app.listen(port, () => console.log(`Bread Route Manager running at http://localhost:${port}`));
export { app, prisma };
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });
