FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

# Install all project dependencies and explicitly pin the Prisma CLI.
# The build marker prevents Railway from reusing the older omit-dev layer.
ARG BUILD_REVISION=prisma-6-fix-2
RUN echo "$BUILD_REVISION" && npm install --include=dev && npm install --no-save prisma@6.11.1

COPY . .

RUN npx --no-install prisma generate --schema=prisma/schema.prisma

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "npx --no-install prisma db push --schema=prisma/schema.prisma && node prisma/seed.js && node src/index.js"]