FROM node:20-alpine

WORKDIR /app

COPY package.json ./

RUN npm config set registry https://registry.npmjs.org/ \
    && npm install --omit=dev --no-package-lock

COPY . .

# Deployment trigger: force Railway to build the latest Dockerfile revision.
RUN npx --yes prisma@6.11.1 generate --schema=prisma/schema.prisma

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "npx --yes prisma@6.11.1 db push --schema=prisma/schema.prisma && node prisma/seed.js && node src/index.js"]