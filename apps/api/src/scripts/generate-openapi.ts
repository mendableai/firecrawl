import { writeFileSync } from 'fs';
import { resolve } from 'path';
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
  apis: ['./src/controllers/v1/*.ts'] 
};

async function generateOpenAPI() {
  try {
    const openapiSpecification = swaggerJsdoc(options);
    
    writeFileSync(
      resolve(__dirname, '../v1-openapi.json'),
      JSON.stringify(openapiSpecification, null, 2)
    );
    
    console.log('OpenAPI spec generated successfully!');
  } catch (error) {
    console.error('Error generating OpenAPI spec:', error);
    process.exit(1);
  }
}

generateOpenAPI();