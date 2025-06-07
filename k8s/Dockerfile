FROM node:20-alpine

WORKDIR /k8s

COPY package*.json ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate

COPY . .

EXPOSE 3001
CMD ["npm", "run", "dev"]
