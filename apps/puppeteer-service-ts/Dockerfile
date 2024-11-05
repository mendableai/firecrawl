FROM node:18-slim

WORKDIR /usr/src/app

RUN npm install -g pnpm

COPY . .

RUN pnpm install

# Install Playwright dependencies
RUN npx playwright install --with-deps

RUN pnpm run build

ARG PORT
ENV PORT=${PORT}

EXPOSE ${PORT}

CMD [ "pnpm", "start" ]
