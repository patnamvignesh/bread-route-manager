import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { pseudoGeocode, serviceMinutes } from '../src/dispatch.js';
const prisma = new PrismaClient();
const colors = ['#2563eb','#16a34a','#9333ea','#ea580c'];
async function main() {
  const managerHash = await bcrypt.hash('Manager123!', 12);
  const driverHash = await bcrypt.hash('Driver123!', 12);
  await prisma.user.upsert({ where:{email:'manager@bread.local'}, update:{}, create:{name:'Route Manager',email:'manager@bread.local',passwordHash:managerHash,role:'MANAGER'} });
  const names=['Demo Driver','Marcus Reed','Luis Gomez','Sam Patel'];
  for(let i=0;i<names.length;i++){
    const email=i===0?'driver@bread.local':`driver${i+1}@bread.local`;
    const u=await prisma.user.upsert({where:{email},update:{name:names[i]},create:{name:names[i],email,passwordHash:driverHash,role:'DRIVER'}});
    await prisma.driver.upsert({where:{userId:u.id},update:{color:colors[i]},create:{userId:u.id,phone:`555-010${i}`,color:colors[i],targetMinutes:330,maxBoxes:150}});
  }
  if(await prisma.deliveryStop.count()===0){
    const samples=[
      ['Main Street Market','955 Main St, Hartford, CT',18,1240],['Marlborough Bakery','2 East Hampton Rd, Marlborough, CT',12,785],['Parkville Grocery','1600 Park St, Hartford, CT',9,420],['New Britain Deli','88 Broad St, New Britain, CT',15,910],['West Hartford Foods','1014 Farmington Ave, West Hartford, CT',22,1540],['Wethersfield Market','1075 Silas Deane Hwy, Wethersfield, CT',11,660],['Manchester Mart','811 Main St, Manchester, CT',17,1120],['Glastonbury Deli','2249 New London Tpke, Glastonbury, CT',8,390],['Rocky Hill Foods','1860 Silas Deane Hwy, Rocky Hill, CT',13,850],['East Hartford Grocery','985 Main St, East Hartford, CT',16,980],['Bloomfield Market','34 Jerome Ave, Bloomfield, CT',10,510],['Newington Bakery','1095 Main St, Newington, CT',14,745]
    ];
    for(let i=0;i<samples.length;i++){
      const [name,address,boxes,value]=samples[i]; const pos=pseudoGeocode(address);
      const c=await prisma.customer.create({data:{name,address,...pos}});
      await prisma.deliveryStop.create({data:{serviceDate:new Date(),customerId:c.id,invoiceNumber:`DEMO-${100+i}`,invoiceValue:value,boxCount:boxes,estimatedServiceMinutes:serviceMinutes(boxes,value),sequence:i+1}});
    }
  }
}
main().finally(()=>prisma.$disconnect());
