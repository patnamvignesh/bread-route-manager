import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  await prisma.orderItem.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.route.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('Demo123!', 10);
  const manager = await prisma.user.create({ data: { name: 'Warehouse Manager', email: 'manager@bread.local', passwordHash, role: 'MANAGER' } });
  const packer = await prisma.user.create({ data: { name: 'Demo Packer', email: 'packer@bread.local', passwordHash, role: 'PACKER' } });
  await prisma.user.create({ data: { name: 'Demo Picker', email: 'picker@bread.local', passwordHash, role: 'PICKER' } });
  await prisma.user.create({ data: { name: 'Demo Driver', email: 'driver@bread.local', passwordHash, role: 'DRIVER' } });

  const products = await Promise.all([
    ['Italian Bread', 'BR-ITALIAN'],
    ['Kaiser Rolls', 'RL-KAISER'],
    ['Whole Wheat Bread', 'BR-WHEAT'],
    ['Sub Rolls', 'RL-SUB']
  ].map(([name, sku]) => prisma.product.create({ data: { name, sku } })));

  const route = await prisma.route.create({
    data: {
      routeCode: '0202',
      routeDate: new Date(),
      assignments: { create: [{ userId: packer.id, workType: 'PACKER' }, { userId: manager.id, workType: 'MANAGER' }] },
      customers: {
        create: [
          { name: 'Marlborough Bakery', address: 'Marlborough, CT', stopOrder: 1 },
          { name: 'Main Street Market', address: 'Hartford, CT', stopOrder: 2 },
          { name: 'Village Deli', address: 'New Britain, CT', stopOrder: 3 }
        ]
      }
    },
    include: { customers: true }
  });

  const quantities = [[18, 8, 6, 12], [12, 10, 8, 6], [8, 6, 10, 8]];
  for (let c = 0; c < route.customers.length; c += 1) {
    for (let p = 0; p < products.length; p += 1) {
      await prisma.orderItem.create({
        data: { customerId: route.customers[c].id, productId: products[p].id, quantity: quantities[c][p] }
      });
    }
  }
}

main().finally(() => prisma.$disconnect());
