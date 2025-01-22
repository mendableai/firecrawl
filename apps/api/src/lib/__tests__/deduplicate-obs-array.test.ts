import { deduplicateObjectsArray } from "../extract/helpers/deduplicate-objs-array";

describe("deduplicateObjectsArray", () => {
  it("should deduplicate the array", async () => {
    const objArray = {
      lawyers: [
        {
          name: "James D. Schull",
          email: null,
          title: "Personal Injury Attorney",
          "phone-number": null,
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
        {
          name: "James D. Schull",
          email: null,
          title: "Personal Injury Attorney",
          "phone-number": null,
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
        {
          name: "James D. Schull",
          email: null,
          title: "Personal Injury Attorney",
          "phone-number": null,
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
      ],
    };

    const expected = {
      lawyers: [
        {
          name: "James D. Schull",
          email: null,
          title: "Personal Injury Attorney",
          "phone-number": null,
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
      ],
    };

    const result = await deduplicateObjectsArray(objArray);

    expect(result).toEqual(expected);
  });

  it("should not deduplicate if not necessary", async () => {
    const objArray = {
      lawyers: [
        {
          name: "James D. Schull",
          email: null,
          title: "Personal Injury Attorney",
          "phone-number": null,
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
        {
          name: "John Doe",
          email: null,
          title: "Personal Injury Attorney",
          "phone-number": null,
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
      ],
    };

    const result = await deduplicateObjectsArray(objArray);

    expect(result).toEqual(objArray);
  });

  it("should handle an empty array", async () => {
    const objArray = { lawyers: [] };

    const expected = { lawyers: [] };

    const result = await deduplicateObjectsArray(objArray);

    expect(result).toEqual(expected);
  });

  it("should handle objects with different properties", async () => {
    const objArray = {
      lawyers: [
        {
          name: "James D. Schull",
          email: "james@example.com",
          title: "Personal Injury Attorney",
        },
        {
          name: "James D. Schull",
          email: "james@example.com",
          title: "Personal Injury Attorney",
          "phone-number": "123-456-7890",
        },
      ],
    };

    const expected = {
      lawyers: [
        {
          name: "James D. Schull",
          email: "james@example.com",
          title: "Personal Injury Attorney",
        },
        {
          name: "James D. Schull",
          email: "james@example.com",
          title: "Personal Injury Attorney",
          "phone-number": "123-456-7890",
        },
      ],
    };

    const result = await deduplicateObjectsArray(objArray);

    expect(result).toEqual(expected);
  });

  it("should handle objects with same properties but different values", async () => {
    const objArray = {
      lawyers: [
        {
          name: "James D. Schull",
          email: "james1@example.com",
          title: "Personal Injury Attorney",
        },
        {
          name: "James D. Schull",
          email: "james2@example.com",
          title: "Personal Injury Attorney",
        },
      ],
    };

    const expected = {
      lawyers: [
        {
          name: "James D. Schull",
          email: "james1@example.com",
          title: "Personal Injury Attorney",
        },
        {
          name: "James D. Schull",
          email: "james2@example.com",
          title: "Personal Injury Attorney",
        },
      ],
    };

    const result = await deduplicateObjectsArray(objArray);

    expect(result).toEqual(expected);
  });

  it("should handle nested identical objects", async () => {
    const objArray = {
      lawyers: [
        {
          name: "James D. Schull",
          email: null,
          title: "Personal Injury Attorney",
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
        {
          name: "James D. Schull",
          email: null,
          title: "Personal Injury Attorney",
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
      ],
    };

    const expected = {
      lawyers: [
        {
          name: "James D. Schull",
          email: null,
          title: "Personal Injury Attorney",
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
      ],
    };

    const result = await deduplicateObjectsArray(objArray);

    expect(result).toEqual(expected);
  });
});
