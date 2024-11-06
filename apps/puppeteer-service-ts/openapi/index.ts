import { Application } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  failOnErrors: true,
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Puppeteer Service API',
      description: 'API for browser automation and scraping',
      version: '1.0.0',
    },
    servers: [
      {
        url: '/',
        description: 'Puppeteer Service'
      }
    ]
  },
  apis: ['./api.ts']
};

export function setupOpenAPI(app: Application) {
  const openapiSpecification = swaggerJsdoc(options);

  app.get('/api-docs/openapi.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(openapiSpecification);
  });
}