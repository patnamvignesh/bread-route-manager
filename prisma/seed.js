import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  await prisma.document.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.route.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('Demo123!', 10);
  const manager = await prisma.user.create({ data: { name: 'Warehouse Manager', email: 'manager@bread.local', passwordHash, role: 'MANAGER' } });
  const packer = await prisma.user.create({ data: { name: 'Demo Packer', email: 'packer@bread.local', passwordHash, role: 'PACKER' } });
  const picker = await prisma.user.create({ data: { name: 'Demo Picker', email: 'picker@bread.local', passwordHash, role: 'PICKER' } });
  const driver = await prisma.user.create({ data: { name: 'Demo Driver', email: 'driver@bread.local', passwordHash, role: 'DRIVER' } });

  const products = await Promise.all([
    ['Italian Bread', 'BR-ITALIAN'],
    ['Kaiser Rolls', 'RL-KAISER'],
    ['Whole Wheat Bread', 'BR-WHEAT'],
    ['Sub Rolls', 'RL-SUB'],
    ['Cinnamon Danish', 'PA-DANISH']
  ].map(([name, sku]) => prisma.product.create({ data: { name, sku, category: sku.startsWith('PA') ? 'PASTRY' : 'BREAD' } })));

  const route = await prisma.route.create({
    data: {
      routeCode: '0202',
      routeDate: new Date(),
      assignments: { create: [
        { userId: manager.id, workType: 'MANAGER' },
        { userId: packer.id, workType: 'PACKER' },
        { userId: picker.id, workType: 'PICKER' },
        { userId: driver.id, workType: 'DRIVER' }
      ] },
      customers: { create: [
        { name: 'Marlborough Bakery', address: '7 Main St, Marlborough, CT', stopOrder: 1, instructions: 'Rear receiving door. Ask for bakery manager.' },
        { name: 'Main Street Market', address: '118 Main St, Hartford, CT', stopOrder: 2, instructions: 'Deliver before 8:00 AM.' },
        { name: 'Village Deli', address: '42 Broad St, New Britain, CT', stopOrder: 3, instructions: 'Leave bread racks beside walk-in cooler.' }
      ] }
    },
    include: { customers: true }
  });

  const quantities = [[18,8,6,12,4],[12,10,8,6,3],[8,6,10,8,2]];
  for (let c = 0; c < route.customers.length; c += 1) {
    for (let p = 0; p < products.length; p += 1) {
      await prisma.orderItem.create({ data: { customerId: route.customers[c].id, productId: products[p].id, quantity: quantities[c][p] } });
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
