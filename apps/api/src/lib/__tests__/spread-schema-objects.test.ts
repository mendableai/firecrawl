import { spreadSchemas } from "../extract/helpers/spread-schemas";

describe("spreadSchemas", () => {
  it("should spread kyb schema (id: 1)", async () => {
    const keys = ["owners"];
    const schema = {
      type: "object",
      properties: {
        business: {
          type: "object",
          properties: {
            name: { type: "string" },
            registration_number: { type: "string" },
            tax_id: { type: "string" },
            type: { type: "string" },
            industry: { type: "string" },
            address: {
              type: "object",
              properties: {
                street: { type: "string" },
                city: { type: "string" },
                state: { type: "string" },
                country: { type: "string" },
                postal_code: { type: "string" },
              },
            },
            incorporation_date: { type: "string", format: "date" },
            phone: { type: "string" },
            email: { type: "string", format: "email" },
          },
        },
        owners: {
          type: "array",
          items: {
            type: "object",
            properties: {
              full_name: { type: "string" },
              role: { type: "string" },
              address: {
                type: "object",
                properties: {
                  street: { type: "string" },
                  city: { type: "string" },
                  state: { type: "string" },
                  country: { type: "string" },
                  postal_code: { type: "string" },
                },
              },
              phone: { type: "string" },
              email: { type: "string", format: "email" },
            },
          },
        },
      },
    };

    const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
      schema,
      keys,
    );

    expect(singleAnswerSchema).toEqual({
      type: "object",
      properties: {
        business: {
          type: "object",
          properties: {
            name: { type: "string" },
            registration_number: { type: "string" },
            tax_id: { type: "string" },
            type: { type: "string" },
            industry: { type: "string" },
            address: {
              type: "object",
              properties: {
                street: { type: "string" },
                city: { type: "string" },
                state: { type: "string" },
                country: { type: "string" },
                postal_code: { type: "string" },
              },
            },
            incorporation_date: { type: "string", format: "date" },
            phone: { type: "string" },
            email: { type: "string", format: "email" },
          },
        },
      },
    });

    expect(multiEntitySchema).toEqual({
      type: "object",
      properties: {
        owners: {
          type: "array",
          items: {
            type: "object",
            properties: {
              full_name: { type: "string" },
              role: { type: "string" },
              address: {
                type: "object",
                properties: {
                  street: { type: "string" },
                  city: { type: "string" },
                  state: { type: "string" },
                  country: { type: "string" },
                  postal_code: { type: "string" },
                },
              },
              phone: { type: "string" },
              email: { type: "string", format: "email" },
            },
          },
        },
      },
    });
  });

  it("should spread lawyers schema (id: 9)", async () => {
    const keys = ["lawyers"];
    const schema = {
      type: "object",
      properties: {
        lawyers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: ["string", "null"], format: "email" },
              title: { type: ["string", "null"] },
              phone_number: { type: ["string", "null"], alias: "phone-number" },
              practice_areas: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    area: { type: "string" },
                  },
                },
                alias: "practice-areas",
              },
            },
          },
        },
      },
    };

    const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
      schema,
      keys,
    );

    expect(singleAnswerSchema).toEqual({});
    expect(multiEntitySchema).toEqual(schema);
  });

  it("shoud spread (id: 26)", async () => {
    const schema = {
      type: "object",
      properties: {
        products: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              price: { type: "string" },
              description: { type: "string" },
            },
          },
        },
      },
    };

    const keys = ["products"];
    const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
      schema,
      keys,
    );

    expect(singleAnswerSchema).toEqual({});
    expect(multiEntitySchema).toEqual(schema);
  });

  it("shoud spread categories and products", async () => {
    const schema = {
      type: "object",
      properties: {
        categories: {
          type: "array",
          items: {
            type: "string",
          },
        },
        products: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              price: { type: "string" },
              description: { type: "string" },
            },
          },
        },
      },
    };

    const keys = ["products", "categories"];
    const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
      schema,
      keys,
    );

    expect(singleAnswerSchema).toEqual({});
    expect(multiEntitySchema).toEqual(schema);
  });

  it("should spread (id: 29)", async () => {
    const schema = {
      type: "object",
      properties: {
        is_active: { type: "boolean" },
        is_partner: { type: "boolean" },
        is_msp: { type: "boolean" },
        is_auditor: { type: "boolean" },
        is_vciso: { type: "boolean" },
        offers_soc_2: { type: "boolean" },
        offers_iso_27001: { type: "boolean" },
        offers_cmmc: { type: "boolean" },
        has_soc_2_cert: { type: "boolean" },
        offers_office365: { type: "boolean" },
        offers_endpoint_security: { type: "boolean" },
      },
    };

    const keys = [];
    const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
      schema,
      keys,
    );

    expect(singleAnswerSchema).toEqual(schema);
    expect(multiEntitySchema).toEqual({});
  });

  it("should spread kyb schema (id: 29)", async () => {
    const schema = {
      type: "object",
      properties: {
        lawyers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: ["string", "null"] },
              "phone-number": { type: "string" },
              "practice-areas": {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    area: { type: "string" },
                  },
                },
              },
              title: { type: ["string", "null"] },
            },
          },
        },
      },
    };

    const keys = ["lawyers"];
    const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
      schema,
      keys,
    );

    expect(singleAnswerSchema).toEqual({});
    expect(multiEntitySchema).toEqual(schema);
  });
});
