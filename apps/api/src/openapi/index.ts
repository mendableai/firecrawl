import { WithWebsocketMethod } from 'express-ws';
import { Application } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  failOnErrors: true,
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Firecrawl API',
      description: 'API for web scraping and crawling',
      version: '1.0.0',
    },
    servers: [
      {
        url: '/api/v1',
        description: 'Version 1'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer'
        }
      }
    }
  },
  apis: [
    './src/controllers/v1/*.ts'  
  ],
};

export function setupOpenAPI(app: Application & WithWebsocketMethod) {
  const openapiSpecification = swaggerJsdoc(options);

  app.get('/api-docs/openapi.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(openapiSpecification);
  });
}