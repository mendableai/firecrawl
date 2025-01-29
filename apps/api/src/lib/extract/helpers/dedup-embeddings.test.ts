import { deduplicateRecords } from "../../ranker";

// Test Suite
describe("Record Deduplication Tests", () => {
  // Helper function to run dedup and sort results for consistent comparison
  const runDedup = async (records: any[]) => {
    const results = await deduplicateRecords(records, 0.7, 0.85);
    return results.sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    );
  };

  test("Basic string field merging", async () => {
    const input = [
      { name: "John Doe", description: "A software engineer" },
      {
        name: "John Doe",
        description: "A senior software engineer with 10 years experience",
      },
    ];
    const result = await runDedup(input);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe(
      "A senior software engineer with 10 years experience",
    );
  },20000);

  test("Array field merging", async () => {
    const input = [
      { name: "Jane", skills: ["JavaScript", "Python"] },
      { name: "Jane", skills: ["Python", "Java", "Go"] },
    ];
    const result = await runDedup(input);
    expect(result).toHaveLength(1);
    expect(result[0].skills).toEqual(["JavaScript", "Python", "Java", "Go"]);
  },20000);

  test("Nested object merging", async () => {
    const input = [
      {
        name: "Company",
        details: { address: "123 St", employees: 100 },
      },
      {
        name: "Company",
        details: { address: "123 Street", employees: 150, founded: 2020 },
      },
    ];
    const result = await runDedup(input);
    expect(result).toHaveLength(1);
    expect(result[0].details).toEqual({
      address: "123 Street",
      employees: 150,
      founded: 2020,
    });
  }, 20000);

  test("Mixed field types", async () => {
    const input = [
      {
        name: "Product A",
        price: 100,
        tags: ["electronics"],
        inStock: true,
        date: "2023-01-01",
      },
      {
        name: "Product A",
        price: 120,
        tags: ["gadget"],
        date: "2024-01-01",
        description: "Latest model",
      },
    ];
    const result = await runDedup(input);
    expect(result).toHaveLength(2);
  }, 20000);

  test("Multiple clusters", async () => {
    const input = [
      { name: "John", role: "dev" },
      { name: "John", role: "senior dev" },
      { name: "Jane", dept: "HR" },
      { name: "Jane", location: "NY" },
      { name: "Bob", age: 30 },
    ];
    const result = await runDedup(input);
    expect(result).toHaveLength(3);
    expect(result.find((r) => r.name === "John")?.role).toBe("senior dev");
    expect(result.find((r) => r.name === "Jane")).toHaveProperty("location");
  }, 1000);

  test("Edge cases", async () => {
    const input = [
      { id: 1, values: [null, undefined, "", 0] },
      { id: 1, values: [1, 2, 3] },
      { id: 2, data: { a: null, b: undefined } },
      { id: 2, data: { a: 1, c: 3 } },
    ];
    const result = await runDedup(input);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.id === 1)?.values).toEqual([
      null,
      undefined,
      "",
      0,
      1,
      2,
      3,
    ]);
    expect(result.find((r) => r.id === 2)?.data).toEqual({
      a: 1,
      b: undefined,
      c: 3,
    });
  }, 20000);

  test("Date handling", async () => {
    const date1 = new Date("2023-01-01");
    const date2 = new Date("2023-02-01");
    const input = [
      { event: "Conference", date: date1 },
      { event: "Conference", date: date2, location: "NY" },
    ];
    const result = await runDedup(input);
    expect(result).toHaveLength(1);
    expect(result[0].date).toEqual(date2);
    expect(result[0].location).toBe("NY");
  }, 20000);

  test("Empty and null values", async () => {
    const input = [
      { name: "Test", value: null },
      { name: "Test", value: "" },
      { name: "Test", value: "actual value" },
    ];
    const result = await runDedup(input);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("actual value");
  }, 20000);

  test("Complex nested structures", async () => {
    const input = [
      {
        company: "TechCorp",
        departments: [
          { name: "Engineering", employees: ["Alice"] },
          { name: "Sales", employees: ["Bob"] },
        ],
      },
      {
        company: "TechCorp",
        departments: [
          { name: "Engineering", employees: ["Charlie"] },
          { name: "Marketing", employees: ["Dave"] },
        ],
      },
    ];
    const result = await runDedup(input);
    expect(result).toHaveLength(1);
    expect(result[0].departments).toHaveLength(3);
    const engineering = result[0].departments.find(
      (d: any) => d.name === "Engineering",
    );
    expect(engineering.employees).toEqual(["Alice", "Charlie"]);
  }, 20000);

  test("Large number of similar records", async () => {
    const input = Array.from({ length: 20 }, (_, i) => ({
      id: Math.floor(i / 4),
      name: `Record ${Math.floor(i / 4)}`,
      value: i,
      tags: [`tag${i}`],
    }));
    const result = await runDedup(input);
    expect(result).toHaveLength(5); // Should group into 5 clusters
    expect(
      result.every((r) => Array.isArray(r.tags) && r.tags.length === 4),
    ).toBe(true);
  }, 20000);

  test("Special characters and varying text", async () => {
    const input = [
      { name: "café", address: "123 1st St." },
      { name: "cafe", address: "123 First Street" },
      { name: "CAFÉ", address: "123 1st Street, Suite 100" },
    ];
    const result = await runDedup(input);
    expect(result).toHaveLength(1);
    expect(result[0].address).toBe("123 1st Street, Suite 100");
  }, 20000);
});

// Optional: Add performance test
describe("Performance Tests", () => {
  test("Handle large dataset efficiently", async () => {
    const generateRecord = (i: number) => ({
      id: Math.floor(i / 3),
      name: `Name ${Math.floor(i / 3)}`,
      description: `Description ${i}`,
      tags: [`tag${i}`, `category${i}`],
      metadata: {
        created: new Date(),
        version: i % 3,
        status: i % 2 === 0 ? "active" : "inactive",
      },
    });

    const input = Array.from({ length: 300 }, (_, i) => generateRecord(i));
    const startTime = Date.now();
    const result = await deduplicateRecords(input, 0.7, 0.85);
    const duration = Date.now() - startTime;

    expect(result.length).toBeLessThan(input.length);
    expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
  }, 20000);
});
