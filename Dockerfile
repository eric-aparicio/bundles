FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
