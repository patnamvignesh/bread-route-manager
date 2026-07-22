FROM node:20-alpine

WORKDIR /app

# Copy package.json only. The committed lockfile contains environment-specific
# registry URLs and must not be used by Railway.
COPY package.json ./

RUN npm config set registry https://registry.npmjs.org/ \
    && npm install --include=dev --no-package-lock \
    && test -f node_modules/prisma/build/index.js

COPY . .

RUN node node_modules/prisma/build/index.js generate --schema=prisma/schema.prisma

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "node node_modules/prisma/build/index.js db push --schema=prisma/schema.prisma && node prisma/seed.js && node src/index.js"]