import { deduplicateMultiEntityResults } from "./dedup-multi-entity";

describe("deduplicateMultiEntityResults", () => {
  test("should deduplicate array input", async () => {
    const input = [
      { name: "John Doe", role: "Developer" },
      { name: "John Doe", role: "Senior Developer" },
      { name: "Jane Smith", role: "Manager" },
      { name: "Jane Smith", department: "Engineering" },
    ];

    const result = await deduplicateMultiEntityResults(input) as any[];
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.name === "John Doe")?.role).toBe("Senior Developer");
    expect(result.find((r) => r.name === "Jane Smith")).toHaveProperty("department");
  });

  test("should deduplicate object with arrays", async () => {
    const input = {
      employees: [
        { name: "John Doe", role: "Developer" },
        { name: "John Doe", role: "Senior Developer" },
        { name: "Jane Smith", role: "Manager" },
      ],
      departments: [
        { name: "Engineering", head: "John Doe" },
        { name: "Engineering", location: "NY" },
        { name: "HR", head: "Jane Smith" },
      ],
    };

    const result = await deduplicateMultiEntityResults(input) as { [key: string]: any[] };
    expect(result.employees).toHaveLength(2);
    expect(result.departments).toHaveLength(2);
    expect(result.employees.find((e) => e.name === "John Doe")?.role).toBe("Senior Developer");
    expect(result.departments.find((d) => d.name === "Engineering")).toHaveProperty("location");
  });

  test("should handle mixed content types", async () => {
    const input: { [key: string]: any[] | any } = {
      employees: [
        { name: "John Doe", skills: ["JavaScript", "Python"] },
        { name: "John Doe", skills: ["Python", "Java"] },
      ],
      config: { version: "1.0" }, // non-array value
    };

    const result = await deduplicateMultiEntityResults(input) as { [key: string]: any[] | any };
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0].skills).toEqual(["JavaScript", "Python", "Java"]);
    expect(result.config).toEqual({ version: "1.0" });
  });

  test("should handle empty arrays", async () => {
    const input = {
      employees: [],
      departments: [{ name: "Engineering" }],
    };

    const result = await deduplicateMultiEntityResults(input) as { [key: string]: any[] };
    expect(result.employees).toHaveLength(0);
    expect(result.departments).toHaveLength(1);
  });

  test("should handle semantic duplicates", async () => {
    const input = [
      { name: "John Doe", description: "A software engineer" },
      { name: "John Doe", description: "A senior software engineer with 10 years experience" },
      { name: "Johnny Doe", description: "A software developer" }, // Similar but different enough
    ];

    const result = await deduplicateMultiEntityResults(input) as any[];
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.name === "John Doe")?.description).toBe(
      "A senior software engineer with 10 years experience"
    );
  });

  test("should merge null values", async () => {
    const input = {
      employees: [
        { name: "John Doe", email: "john@example.com", phone: null },
        { name: "John Doe", email: null, phone: "123-456-7890" },
      ],
    };

    const result = await deduplicateMultiEntityResults(input) as { [key: string]: any[] };
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0]).toEqual({
      name: "John Doe",
      email: "john@example.com",
      phone: "123-456-7890",
    });
  });
}); 