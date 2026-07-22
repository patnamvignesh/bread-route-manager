FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Use the application's pinned Prisma CLI and the correct schema.
RUN ./node_modules/.bin/prisma generate --schema=prisma/schema.prisma

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "./node_modules/.bin/prisma db push --schema=prisma/schema.prisma && node prisma/seed.js && node src/index.js"]