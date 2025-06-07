FROM node:20-alpine

WORKDIR /app

# Копируем зависимости и схему
COPY package*.json ./
COPY prisma ./prisma

RUN npm install
RUN npx prisma generate

# Копируем остальной код
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
