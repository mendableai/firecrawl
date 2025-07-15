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

  it("should spread pages schema", async () => {
    const schema = {
      type: "object",
      properties: {
        pages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: {
                type: "string",
              },
            },
          },
        },
      },
      required: ["pages"],
    };

    const keys = ["pages"];
    const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
      schema,
      keys,
    );

    expect(singleAnswerSchema).toEqual({});
    expect(multiEntitySchema).toEqual(schema);
  });

  it("should spread pages schema", async () => {
    const schema = {
      type: "object",
      properties: {
        pages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: {
                type: "string",
              },
            },
          },
        },
      },
      required: ["pages"],
    };

    const keys = ["pages.title"];
    const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
      schema,
      keys,
    );

    expect(singleAnswerSchema).toEqual({});
    expect(multiEntitySchema).toEqual(schema);
  });

  it("should handle deeply nested array properties", async () => {
    const schema = {
      type: "object",
      properties: {
        company: {
          type: "object",
          properties: {
            name: { type: "string" },
            departments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  employees: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        role: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      required: ["company"],
    };

    const keys = ["company.departments.employees"];
    const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
      schema,
      keys,
    );

    expect(singleAnswerSchema).toEqual({});
    expect(multiEntitySchema).toEqual(schema);
  });

  it("should handle multiple nested paths", async () => {
    const schema = {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: {
            name: { type: "string" },
            contacts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  email: { type: "string" },
                  phone: { type: "string" },
                },
              },
            },
          },
        },
        orders: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    quantity: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
      required: ["user", "orders"],
    };

    const keys = ["user.contacts", "orders.items"];
    const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
      schema,
      keys,
    );

    expect(singleAnswerSchema).toEqual({});
    expect(multiEntitySchema).toEqual(schema);
  });

  it("should handle mixed single and array properties", async () => {
    const schema = {
      type: "object",
      properties: {
        metadata: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
          },
        },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              content: { type: "string" },
            },
          },
        },
      },
      required: ["metadata", "sections"],
    };

    const keys = ["sections"];
    const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
      schema,
      keys,
    );

    expect(singleAnswerSchema).toEqual({
      type: "object",
      properties: {
        metadata: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
          },
        },
      },
      required: ["metadata"],
    });

    expect(multiEntitySchema).toEqual({
      type: "object",
      properties: {
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              content: { type: "string" },
            },
          },
        },
      },
      required: ["sections"],
    });
  });

  it("should handle empty keys array", async () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name"],
    };

    const keys: string[] = [];
    const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
      schema,
      keys,
    );

    expect(singleAnswerSchema).toEqual(schema);
    expect(multiEntitySchema).toEqual({});
  });

  it("should handle non-existent paths", async () => {
    const schema = {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        },
      },
    };

    const keys = ["user.nonexistent.path"];
    const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
      schema,
      keys,
    );

    expect(singleAnswerSchema).toEqual({});
    expect(multiEntitySchema).toEqual(schema);
  });

  // it("should split nested object and array properties", async () => {
  //   const schema = {
  //     type: "object",
  //     properties: {
  //       company: {
  //         type: "object",
  //         properties: {
  //           name: { type: "string" },
  //           address: {
  //             type: "object",
  //             properties: {
  //               street: { type: "string" },
  //               city: { type: "string" },
  //             },
  //           },
  //           employees: {
  //             type: "array",
  //             items: {
  //               type: "object",
  //               properties: {
  //                 name: { type: "string" },
  //                 position: { type: "string" },
  //               },
  //             },
  //           },
  //         },
  //       },
  //     },
  //     required: ["company"],
  //   };

  //   const keys = ["company.employees"];
  //   const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
  //     schema,
  //     keys,
  //   );

  //   expect(singleAnswerSchema).toEqual({
  //     type: "object",
  //     properties: {
  //       company: {
  //         type: "object",
  //         properties: {
  //           name: { type: "string" },
  //           address: {
  //             type: "object",
  //             properties: {
  //               street: { type: "string" },
  //               city: { type: "string" },
  //             },
  //           },
  //         },
  //       },
  //     },
  //     required: ["company"],
  //   });

  //   expect(multiEntitySchema).toEqual({
  //     type: "object",
  //     properties: {
  //       company: {
  //         type: "object",
  //         properties: {
  //           employees: {
  //             type: "array",
  //             items: {
  //               type: "object",
  //               properties: {
  //                 name: { type: "string" },
  //                 position: { type: "string" },
  //               },
  //             },
  //           },
  //         },
  //       },
  //     },
  //     required: ["company"],
  //   });
  // });

  // it("should handle multiple root level properties with nested paths", async () => {
  //   const schema = {
  //     type: "object",
  //     properties: {
  //       user: {
  //         type: "object",
  //         properties: {
  //           id: { type: "string" },
  //           profile: {
  //             type: "object",
  //             properties: {
  //               name: { type: "string" },
  //               email: { type: "string" },
  //             },
  //           },
  //           posts: {
  //             type: "array",
  //             items: {
  //               type: "object",
  //               properties: {
  //                 title: { type: "string" },
  //                 content: { type: "string" },
  //               },
  //             },
  //           },
  //         },
  //       },
  //       settings: {
  //         type: "object",
  //         properties: {
  //           theme: { type: "string" },
  //           notifications: {
  //             type: "object",
  //             properties: {
  //               email: { type: "boolean" },
  //               push: { type: "boolean" },
  //             },
  //           },
  //         },
  //       },
  //     },
  //     required: ["user", "settings"],
  //   };

  //   const keys = ["user.posts", "settings.notifications"];
  //   const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
  //     schema,
  //     keys,
  //   );

  //   expect(singleAnswerSchema).toEqual({
  //     type: "object",
  //     properties: {
  //       user: {
  //         type: "object",
  //         properties: {
  //           id: { type: "string" },
  //           profile: {
  //             type: "object",
  //             properties: {
  //               name: { type: "string" },
  //               email: { type: "string" },
  //             },
  //           },
  //         },
  //       },
  //       settings: {
  //         type: "object",
  //         properties: {
  //           theme: { type: "string" },
  //         },
  //       },
  //     },
  //     required: ["user", "settings"],
  //   });

  //   expect(multiEntitySchema).toEqual({
  //     type: "object",
  //     properties: {
  //       user: {
  //         type: "object",
  //         properties: {
  //           posts: {
  //             type: "array",
  //             items: {
  //               type: "object",
  //               properties: {
  //                 title: { type: "string" },
  //                 content: { type: "string" },
  //               },
  //             },
  //           },
  //         },
  //       },
  //       settings: {
  //         type: "object",
  //         properties: {
  //           notifications: {
  //             type: "object",
  //             properties: {
  //               email: { type: "boolean" },
  //               push: { type: "boolean" },
  //             },
  //           },
  //         },
  //       },
  //     },
  //     required: ["user", "settings"],
  //   });
  // });

  // it("should handle array properties at different nesting levels", async () => {
  //   const schema = {
  //     type: "object",
  //     properties: {
  //       categories: {
  //         type: "array",
  //         items: {
  //           type: "object",
  //           properties: {
  //             name: { type: "string" },
  //             subcategories: {
  //               type: "array",
  //               items: {
  //                 type: "object",
  //                 properties: {
  //                   name: { type: "string" },
  //                   products: {
  //                     type: "array",
  //                     items: {
  //                       type: "object",
  //                       properties: {
  //                         name: { type: "string" },
  //                         price: { type: "number" },
  //                       },
  //                     },
  //                   },
  //                 },
  //               },
  //             },
  //           },
  //         },
  //       },
  //       featured: {
  //         type: "object",
  //         properties: {
  //           category: { type: "string" },
  //           items: {
  //             type: "array",
  //             items: {
  //               type: "object",
  //               properties: {
  //                 id: { type: "string" },
  //                 name: { type: "string" },
  //               },
  //             },
  //           },
  //         },
  //       },
  //     },
  //   };

  //   const keys = ["categories.subcategories", "featured.items"];
  //   const { singleAnswerSchema, multiEntitySchema } = await spreadSchemas(
  //     schema,
  //     keys,
  //   );

  //   expect(singleAnswerSchema).toEqual({
  //     type: "object",
  //     properties: {
  //       featured: {
  //         type: "object",
  //         properties: {
  //           category: { type: "string" },
  //         },
  //       },
  //     },
  //   });

  //   expect(multiEntitySchema).toEqual({
  //     type: "object",
  //     properties: {
  //       categories: {
  //         type: "array",
  //         items: {
  //           type: "object",
  //           properties: {
  //             name: { type: "string" },
  //             subcategories: {
  //               type: "array",
  //               items: {
  //                 type: "object",
  //                 properties: {
  //                   name: { type: "string" },
  //                   products: {
  //                     type: "array",
  //                     items: {
  //                       type: "object",
  //                       properties: {
  //                         name: { type: "string" },
  //                         price: { type: "number" },
  //                       },
  //                     },
  //                   },
  //                 },
  //               },
  //             },
  //           },
  //         },
  //       },
  //       featured: {
  //         type: "object",
  //         properties: {
  //           items: {
  //             type: "array",
  //             items: {
  //               type: "object",
  //               properties: {
  //                 id: { type: "string" },
  //                 name: { type: "string" },
  //               },
  //             },
  //           },
  //         },
  //       },
  //     },
  //   });
  // });
});
