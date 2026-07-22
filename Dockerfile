FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push && node prisma/seed.js && node src/index.js"]
