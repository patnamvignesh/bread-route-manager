import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { signToken, requireAuth, requireRole } from './auth.js';
import { extractInvoice } from './extract.js';
import { pseudoGeocode, serviceMinutes, routeMetrics, optimizeOrder, balanceStops } from './dispatch.js';

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 4000);
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 20 * 1024 * 1024 } });

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',').map(value => value.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || (/^https:\/\/[-a-z0-9]+\.vercel\.app$/i.test(origin) && process.env.ALLOW_VERCEL_PREVIEWS === 'true')) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(uploadDir));
app.get('/api/health', (_, res) => res.json({ ok: true, openaiConfigured: Boolean(process.env.OPENAI_API_KEY) }));

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = await prisma.user.findUnique({ where: { email }, include: { driver: true } });
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) return res.status(401).json({ error: 'Incorrect email or password' });
  res.json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role, driverId: user.driver?.id || null } });
});

app.get('/api/drivers', requireAuth, requireRole('MANAGER'), async (_, res) => {
  const drivers = await prisma.driver.findMany({ include: { user: { select: { name: true, email: true } }, stops: { where: { serviceDate: { gte: new Date(new Date().setHours(0,0,0,0)) } } } } });
  res.json(drivers);
});

app.get('/api/stops', requireAuth, async (req, res) => {
  const where = req.auth.role === 'DRIVER'
    ? { driver: { userId: Number(req.auth.sub) } }
    : {};
  res.json(await prisma.deliveryStop.findMany({ where, include: { customer: true, driver: { include: { user: { select: { name: true } } } } }, orderBy: [{ driverId: 'asc' }, { sequence: 'asc' }, { createdAt: 'asc' }] }));
});

app.patch('/api/stops/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const allowed = ['driverId','status','notes','deliveredBoxes','proofPhotoUrl','sequence'];
  const data = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  if (data.status === 'ARRIVED') data.arrivedAt = new Date();
  if (data.status === 'DELIVERED') data.deliveredAt = new Date();
  if ('driverId' in data) data.driverId = data.driverId ? Number(data.driverId) : null;
  const stop = await prisma.deliveryStop.update({ where: { id }, data, include: { customer: true } });
  res.json(stop);
});

app.post('/api/invoices/upload', requireAuth, requireRole('MANAGER'), upload.single('invoice'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Invoice file is required' });
  const record = await prisma.invoiceUpload.create({ data: { filename: req.file.originalname, storedName: req.file.filename, mimeType: req.file.mimetype, uploadedById: Number(req.auth.sub) } });
  try {
    const stops = await extractInvoice(req.file);
    await prisma.extractedStop.createMany({ data: stops.map(s => ({ ...s, uploadId: record.id })) });
    res.status(201).json(await prisma.invoiceUpload.findUnique({ where: { id: record.id }, include: { extracted: true } }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Extraction failed', detail: error.message });
  }
});

app.get('/api/invoices', requireAuth, requireRole('MANAGER'), async (_, res) => {
  res.json(await prisma.invoiceUpload.findMany({ include: { extracted: true }, orderBy: { uploadedAt: 'desc' } }));
});

app.patch('/api/extracted/:id', requireAuth, requireRole('MANAGER'), async (req, res) => {
  const id = Number(req.params.id);
  const data = { ...req.body };
  delete data.id; delete data.uploadId; delete data.deliveryStopId;
  if (data.invoiceValue !== undefined) data.invoiceValue = Number(data.invoiceValue);
  if (data.boxCount !== undefined) data.boxCount = Number(data.boxCount);
  res.json(await prisma.extractedStop.update({ where: { id }, data }));
});

app.post('/api/extracted/:id/approve', requireAuth, requireRole('MANAGER'), async (req, res) => {
  const id = Number(req.params.id);
  const extracted = await prisma.extractedStop.findUnique({ where: { id } });
  if (!extracted) return res.status(404).json({ error: 'Extracted stop not found' });
  if (extracted.deliveryStopId) return res.status(409).json({ error: 'Already approved' });
  const customer = await prisma.customer.upsert({
    where: { name_address: { name: extracted.customerName, address: extracted.address } },
    update: {},
    create: { name: extracted.customerName, address: extracted.address, ...pseudoGeocode(extracted.address) }
  });
  const stop = await prisma.deliveryStop.create({
    data: {
      serviceDate: new Date(), customerId: customer.id, invoiceNumber: extracted.invoiceNumber,
      invoiceValue: extracted.invoiceValue, boxCount: extracted.boxCount, routeHint: extracted.routeHint, estimatedServiceMinutes: serviceMinutes(extracted.boxCount, extracted.invoiceValue),
      extractedStop: { connect: { id: extracted.id } }
    }, include: { customer: true }
  });
  await prisma.extractedStop.update({ where: { id }, data: { reviewStatus: 'APPROVED' } });
  res.json(stop);
});


app.get('/api/dispatch', requireAuth, requireRole('MANAGER'), async (_req, res) => {
  const drivers = await prisma.driver.findMany({ include: { user: { select: { name: true, email: true } }, stops: { where: { status: { not: 'DELIVERED' } }, include: { customer: true }, orderBy: { sequence: 'asc' } } } });
  const unassigned = await prisma.deliveryStop.findMany({ where: { driverId: null, status: { not: 'DELIVERED' } }, include: { customer: true } });
  res.json({ drivers: drivers.map(d => ({ ...d, metrics: routeMetrics(d.stops) })), unassigned });
});

app.post('/api/dispatch/balance', requireAuth, requireRole('MANAGER'), async (_req, res) => {
  const drivers = await prisma.driver.findMany({ include: { user: true } });
  const stops = await prisma.deliveryStop.findMany({ where: { status: { in: ['UNASSIGNED','ASSIGNED'] } }, include: { customer: true } });
  const buckets = balanceStops(stops, drivers);
  for (const [driverId, ordered] of buckets) {
    for (let i=0;i<ordered.length;i++) await prisma.deliveryStop.update({ where: { id: ordered[i].id }, data: { driverId, sequence: i+1, status: 'ASSIGNED' } });
  }
  res.json({ ok: true });
});

app.post('/api/dispatch/optimize/:driverId', requireAuth, requireRole('MANAGER'), async (req, res) => {
  const driverId = Number(req.params.driverId);
  const stops = await prisma.deliveryStop.findMany({ where: { driverId, status: { not: 'DELIVERED' } }, include: { customer: true } });
  const ordered = optimizeOrder(stops);
  for (let i=0;i<ordered.length;i++) await prisma.deliveryStop.update({ where: { id: ordered[i].id }, data: { sequence: i+1 } });
  res.json({ ok: true, metrics: routeMetrics(ordered) });
});

app.patch('/api/drivers/:id', requireAuth, requireRole('MANAGER'), async (req, res) => {
  const data = {};
  for (const key of ['active','targetMinutes','maxBoxes']) if (req.body[key] !== undefined) data[key] = key === 'active' ? Boolean(req.body[key]) : Number(req.body[key]);
  res.json(await prisma.driver.update({ where: { id: Number(req.params.id) }, data }));
});


app.post('/api/driver/location', requireAuth, requireRole('DRIVER'), async (req, res) => {
  const driver = await prisma.driver.findUnique({ where: { userId: Number(req.auth.sub) } });
  if (!driver) return res.status(404).json({ error: 'Driver profile not found' });
  const { latitude, longitude, accuracy, speed, heading } = req.body || {};
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return res.status(400).json({ error: 'Valid coordinates are required' });
  const now = new Date();
  await prisma.driver.update({ where: { id: driver.id }, data: { currentLat: Number(latitude), currentLng: Number(longitude), locationUpdatedAt: now, online: true, shiftStartedAt: driver.shiftStartedAt || now } });
  await prisma.driverLocation.create({ data: { driverId: driver.id, latitude: Number(latitude), longitude: Number(longitude), accuracy: accuracy == null ? null : Number(accuracy), speed: speed == null ? null : Number(speed), heading: heading == null ? null : Number(heading) } });
  res.json({ ok: true, updatedAt: now });
});

app.get('/api/driver/live', requireAuth, requireRole('MANAGER'), async (_req, res) => {
  const drivers = await prisma.driver.findMany({ include: { user: { select: { name: true } }, stops: { where: { status: { not: 'DELIVERED' } }, include: { customer: true }, orderBy: { sequence: 'asc' } } } });
  res.json(drivers.map(d => ({ id:d.id,name:d.user.name,color:d.color,currentLat:d.currentLat,currentLng:d.currentLng,locationUpdatedAt:d.locationUpdatedAt,online:d.online,currentStop:d.stops.find(s=>s.status==='ARRIVED'||s.status==='EN_ROUTE')||d.stops[0]||null,remainingStops:d.stops.length })));
});

app.post('/api/stops/:id/photo', requireAuth, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Photo is required' });
  const url = `/uploads/${req.file.filename}`;
  res.json(await prisma.deliveryStop.update({ where: { id: Number(req.params.id) }, data: { proofPhotoUrl: url } }));
});


function dayRange(dateValue) {
  const start = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date();
  start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(end.getDate()+1);
  return { start, end };
}
function reportPayload(stops) {
  const delivered = stops.filter(s=>s.status==='DELIVERED');
  const issues = stops.filter(s=>s.status==='ISSUE');
  const assigned = stops.filter(s=>s.driverId);
  const byDriver = new Map();
  for (const s of stops) {
    const key=s.driver?.id||0, name=s.driver?.user?.name||'Unassigned';
    if(!byDriver.has(key)) byDriver.set(key,{driverId:key||null,driverName:name,assignedStops:0,completedStops:0,issueStops:0,boxes:0,deliveredBoxes:0,invoiceValue:0,firstDelivery:null,lastDelivery:null});
    const r=byDriver.get(key); r.assignedStops++; r.boxes+=s.boxCount; r.invoiceValue+=s.invoiceValue;
    if(s.status==='DELIVERED'){r.completedStops++;r.deliveredBoxes+=s.deliveredBoxes ?? s.boxCount;if(!r.firstDelivery||s.deliveredAt<r.firstDelivery)r.firstDelivery=s.deliveredAt;if(!r.lastDelivery||s.deliveredAt>r.lastDelivery)r.lastDelivery=s.deliveredAt}
    if(s.status==='ISSUE')r.issueStops++;
  }
  const alerts=[];
  for(const s of stops){
    if(s.status==='ISSUE') alerts.push({severity:'high',title:`Issue at ${s.customer.name}`,detail:s.notes||'Driver marked this stop as an issue.',stopId:s.id});
    if(s.status==='DELIVERED'&&!s.proofPhotoUrl) alerts.push({severity:'medium',title:`Missing proof photo`,detail:`${s.customer.name} was completed without a proof photo.`,stopId:s.id});
    if(s.deliveredBoxes!=null&&s.deliveredBoxes<s.boxCount) alerts.push({severity:'high',title:`Short delivery at ${s.customer.name}`,detail:`Expected ${s.boxCount}; delivered ${s.deliveredBoxes}.`,stopId:s.id});
  }
  return {summary:{totalStops:stops.length,assignedStops:assigned.length,completedStops:delivered.length,issueStops:issues.length,totalBoxes:stops.reduce((n,s)=>n+s.boxCount,0),deliveredBoxes:delivered.reduce((n,s)=>n+(s.deliveredBoxes??s.boxCount),0),invoiceValue:stops.reduce((n,s)=>n+s.invoiceValue,0),completionRate:stops.length?Math.round(delivered.length/stops.length*100):0},drivers:[...byDriver.values()],alerts,stops};
}

app.get('/api/reports/daily', requireAuth, requireRole('MANAGER'), async (req,res)=>{
  const {start,end}=dayRange(req.query.date);
  const stops=await prisma.deliveryStop.findMany({where:{serviceDate:{gte:start,lt:end}},include:{customer:true,driver:{include:{user:{select:{name:true}}}}},orderBy:[{driverId:'asc'},{sequence:'asc'}]});
  res.json({...reportPayload(stops),date:start.toISOString().slice(0,10)});
});
app.get('/api/reports/history', requireAuth, requireRole('MANAGER'), async (req,res)=>{
  const days=Math.min(90,Math.max(7,Number(req.query.days)||30));
  const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-days+1);
  const stops=await prisma.deliveryStop.findMany({where:{serviceDate:{gte:start}},select:{serviceDate:true,status:true,boxCount:true,deliveredBoxes:true,invoiceValue:true}});
  const rows=[];
  for(let i=0;i<days;i++){const d=new Date(start);d.setDate(d.getDate()+i);const key=d.toISOString().slice(0,10);const x=stops.filter(s=>s.serviceDate.toISOString().slice(0,10)===key);rows.push({date:key,stops:x.length,completed:x.filter(s=>s.status==='DELIVERED').length,issues:x.filter(s=>s.status==='ISSUE').length,boxes:x.reduce((n,s)=>n+s.boxCount,0),invoiceValue:x.reduce((n,s)=>n+s.invoiceValue,0)});}
  res.json(rows);
});
app.get('/api/reports/export.csv', requireAuth, requireRole('MANAGER'), async (req,res)=>{
  const {start,end}=dayRange(req.query.date);
  const stops=await prisma.deliveryStop.findMany({where:{serviceDate:{gte:start,lt:end}},include:{customer:true,driver:{include:{user:{select:{name:true}}}}},orderBy:[{driverId:'asc'},{sequence:'asc'}]});
  const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;
  const header=['Driver','Sequence','Customer','Address','Invoice','Invoice Value','Expected Boxes','Delivered Boxes','Status','Arrived At','Delivered At','Issue/Notes','Proof Photo'];
  const lines=[header.map(esc).join(','),...stops.map(s=>[s.driver?.user?.name||'Unassigned',s.sequence,s.customer.name,s.customer.address,s.invoiceNumber,s.invoiceValue,s.boxCount,s.deliveredBoxes,s.status,s.arrivedAt?.toISOString()||'',s.deliveredAt?.toISOString()||'',s.notes||'',s.proofPhotoUrl||''].map(esc).join(','))];
  res.setHeader('Content-Type','text/csv');res.setHeader('Content-Disposition',`attachment; filename="bread-route-${start.toISOString().slice(0,10)}.csv"`);res.send(lines.join('\n'));
});

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });
app.listen(port, () => console.log(`Bread Route API running at http://localhost:${port}`));
