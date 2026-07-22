import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'bread-route-manager' });
});

app.get('/api/routes', async (_req, res, next) => {
  try {
    const routes = await prisma.route.findMany({
      orderBy: [{ routeDate: 'desc' }, { routeCode: 'asc' }],
      include: {
        customers: {
          orderBy: { stopOrder: 'asc' },
          include: { items: { include: { product: true } } }
        },
        assignments: true
      }
    });
    res.json(routes);
  } catch (error) {
    next(error);
  }
});

app.get('/api/routes/:id/packing-board', async (req, res, next) => {
  try {
    const routeId = Number(req.params.id);
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: {
        customers: {
          orderBy: { stopOrder: 'asc' },
          include: { items: { include: { product: true } } }
        }
      }
    });

    if (!route) return res.status(404).json({ error: 'Route not found' });

    const products = new Map();
    for (const customer of route.customers) {
      for (const item of customer.items) {
        const entry = products.get(item.productId) || {
          productId: item.productId,
          productName: item.product.name,
          required: 0,
          packed: 0,
          short: 0,
          customers: []
        };
        entry.required += item.quantity;
        entry.packed += item.packedQty;
        entry.short += item.shortQty;
        entry.customers.push({
          itemId: item.id,
          customerId: customer.id,
          customerName: customer.name,
          quantity: item.quantity,
          packedQty: item.packedQty,
          shortQty: item.shortQty,
          status: item.status,
          notes: item.notes
        });
        products.set(item.productId, entry);
      }
    }

    res.json({
      route: { id: route.id, routeCode: route.routeCode, routeDate: route.routeDate, status: route.status },
      products: [...products.values()].sort((a, b) => a.productName.localeCompare(b.productName))
    });
  } catch (error) {
    next(error);
  }
});

const updateItemSchema = z.object({
  status: z.enum(['PENDING', 'DONE', 'SHORT']),
  packedQty: z.number().int().min(0),
  shortQty: z.number().int().min(0).default(0),
  notes: z.string().max(500).optional().nullable()
});

app.patch('/api/order-items/:id', async (req, res, next) => {
  try {
    const input = updateItemSchema.parse(req.body);
    const id = Number(req.params.id);
    const existing = await prisma.orderItem.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Order item not found' });
    if (input.packedQty + input.shortQty > existing.quantity) {
      return res.status(400).json({ error: 'Packed and short quantities cannot exceed required quantity' });
    }
    const item = await prisma.orderItem.update({ where: { id }, data: input, include: { product: true, customer: true } });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/shortages', async (_req, res, next) => {
  try {
    const shortages = await prisma.orderItem.findMany({
      where: { shortQty: { gt: 0 } },
      orderBy: { updatedAt: 'desc' },
      include: { product: true, customer: { include: { route: true } } }
    });
    res.json(shortages.map(item => ({
      id: item.id,
      route: item.customer.route.routeCode,
      customer: item.customer.name,
      product: item.product.name,
      required: item.quantity,
      packed: item.packedQty,
      short: item.shortQty,
      notes: item.notes,
      updatedAt: item.updatedAt
    })));
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request', details: error.issues });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => console.log(`Bread Route Manager running at http://localhost:${port}`));

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
