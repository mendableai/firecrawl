import { Application } from "express";
import swaggerJsdoc from "swagger-jsdoc";
import redoc from "redoc-express";

const options = {
  failOnErrors: true,
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Puppeteer Service API",
      description: "API for browser automation and scraping",
      version: "1.0.0",
    },
    servers: [
      {
        url: "/",
        description: "Puppeteer Service",
      },
    ],
  },
  apis: ["./api.ts"],
};

export function setupOpenAPI(app: Application) {
  const openapiSpecification = swaggerJsdoc(options);

  app.get("/api-docs/openapi.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(openapiSpecification);
  });

  app.get(
    "/redoc",
    redoc({
      title: "API Docs",
      specUrl: "/api-docs/openapi.json",
      nonce: "", // <= it is optional,we can omit this key and value
      // we are now start supporting the redocOptions object
      // you can omit the options object if you don't need it
      // https://redocly.com/docs/api-reference-docs/configuration/functionality/
      redocOptions: {},
    })
  );
}
