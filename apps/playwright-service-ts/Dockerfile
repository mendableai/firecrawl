FROM node:18-slim

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install

COPY . .

# Install Playwright dependencies
RUN npx playwright install --with-deps

RUN npm run build

ENV PORT=3000

EXPOSE ${PORT}

CMD [ "npm", "start" ]
