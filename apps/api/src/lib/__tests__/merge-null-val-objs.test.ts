import { mergeNullValObjs } from "../extract/helpers/merge-null-val-objs";

describe("mergeNullValObjs", () => {
  it("should merge the objects with null values", async () => {
    const objArray = {
      lawyers: [
        {
          name: "Frank Giunta",
          email: null,
          title: "Personal Injury Attorney",
          "phone-number": "214.370.5200",
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
        {
          name: "Frank Giunta",
          email: null,
          title: "Personal Injury Attorney",
          "phone-number": "214.370.5200",
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
          name: "Frank Giunta",
          email: null,
          title: "Personal Injury Attorney",
          "phone-number": "214.370.5200",
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
      ],
    };

    const result = mergeNullValObjs(objArray);

    expect(result).toEqual(expected);
  });

  it("should handle empty object array", async () => {
    const objArray = {
      lawyers: [],
    };

    const expected = {
      lawyers: [],
    };

    const result = mergeNullValObjs(objArray);

    expect(result).toEqual(expected);
  });

  it("should handle object array with no null values", async () => {
    const objArray = {
      lawyers: [
        {
          name: "John Doe",
          email: "john.doe@example.com",
          title: "Attorney",
          "phone-number": "123.456.7890",
          "practice-areas": [
            {
              area: "Corporate Law",
            },
          ],
        },
      ],
    };

    const expected = {
      lawyers: [
        {
          name: "John Doe",
          email: "john.doe@example.com",
          title: "Attorney",
          "phone-number": "123.456.7890",
          "practice-areas": [
            {
              area: "Corporate Law",
            },
          ],
        },
      ],
    };

    const result = mergeNullValObjs(objArray);

    expect(result).toEqual(expected);
  });

  it("should merge objects with different null values", async () => {
    const objArray = {
      lawyers: [
        {
          name: "Jane Smith",
          email: "null",
          title: "Attorney",
          description: null,
          "phone-number": "987.654.3210",
          "practice-areas": [
            {
              area: "Family Law",
            },
          ],
        },
        {
          name: "Jane Smith",
          email: "jane.smith@example.com",
          title: null,
          description: "Jane Smith is an attorney specializing in Family Law.",
          "phone-number": "987.654.3210",
          "practice-areas": [
            {
              area: "Family Law",
            },
          ],
        },
      ],
    };

    const expected = {
      lawyers: [
        {
          name: "Jane Smith",
          email: "jane.smith@example.com",
          title: "Attorney",
          description: "Jane Smith is an attorney specializing in Family Law.",
          "phone-number": "987.654.3210",
          "practice-areas": [
            {
              area: "Family Law",
            },
          ],
        },
      ],
    };

    const result = mergeNullValObjs(objArray);

    expect(result).toEqual(expected);
  });

  it("should merge objects with different null values", async () => {
    const objArray = {
      lawyers: [
        {
          name: "Frank Giunta",
          email: "frank.giunta@example.com",
          title: "Personal Injury Attorney",
          "phone-number": "214.370.5200",
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
        {
          name: "Frank Giunta",
          email: null,
          title: "Personal Injury Attorney",
          "phone-number": "214.370.5200",
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
        {
          name: "Dale R. Rose",
          email: null,
          title: "Personal Injury Attorney",
          "phone-number": "972.562.0266",
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
          name: "Frank Giunta",
          email: "frank.giunta@example.com",
          title: "Personal Injury Attorney",
          "phone-number": "214.370.5200",
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
        {
          name: "Dale R. Rose",
          email: null,
          title: "Personal Injury Attorney",
          "phone-number": "972.562.0266",
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
      ],
    };

    const result = mergeNullValObjs(objArray);

    expect(result).toEqual(expected);
  });

  it("should correctly merge and deduplicate objects", async () => {
    const objArray = {
      lawyers: [
        {
          name: "Frank Giunta",
          email: null,
          title: "Personal Injury Attorney",
          "phone-number": "214.370.5200",
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
        {
          name: "Frank Giunta",
          email: null,
          title: "Personal Injury Attorney",
          "phone-number": "214.370.5200",
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
        {
          name: "Dale R. Rose",
          email: null,
          title: "Personal Injury Attorney",
          "phone-number": "972.562.0266",
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
          name: "Frank Giunta",
          email: null,
          title: "Personal Injury Attorney",
          "phone-number": "214.370.5200",
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
        {
          name: "Dale R. Rose",
          email: null,
          title: "Personal Injury Attorney",
          "phone-number": "972.562.0266",
          "practice-areas": [
            {
              area: "Personal Injury",
            },
          ],
        },
      ],
    };

    const result = mergeNullValObjs(objArray);

    expect(result).toEqual(expected);
  });

  it("should merge arrays of similar objects", async () => {
    const objArray = {
      lawyers: [
        {
          name: "Allen Cox",
          email: null,
          title: "Personal Injury Lawyer",
          "phone-number": "972.606.9000",
          "practice-areas": [{ area: "Personal Injury" }],
        },
        {
          name: "Allen Cox",
          email: "allen.cox@example.com",
          title: "Personal Injury Lawyer",
          "phone-number": null,
          "practice-areas": [
            { area: "Automobile accidents" },
            { area: "Truck accidents" },
            { area: "Amusement park injury" },
            { area: "Bus accident" },
            { area: "Industrial accidents" },
            { area: "Product defects" },
            { area: "Food poisoning" },
            { area: "Workplace accidents" },
            { area: "Wrongful death" },
            { area: "Swimming pool accidents" },
            { area: "Premises accidents" },
            { area: "Aircraft accidents" },
            { area: "Animal and dog bites" },
          ],
        },
      ],
    };

    const expected = {
      lawyers: [
        {
          name: "Allen Cox",
          email: "allen.cox@example.com",
          title: "Personal Injury Lawyer",
          "phone-number": "972.606.9000",
          "practice-areas": [
            { area: "Personal Injury" },
            { area: "Automobile accidents" },
            { area: "Truck accidents" },
            { area: "Amusement park injury" },
            { area: "Bus accident" },
            { area: "Industrial accidents" },
            { area: "Product defects" },
            { area: "Food poisoning" },
            { area: "Workplace accidents" },
            { area: "Wrongful death" },
            { area: "Swimming pool accidents" },
            { area: "Premises accidents" },
            { area: "Aircraft accidents" },
            { area: "Animal and dog bites" },
          ],
        },
      ],
    };

    const result = mergeNullValObjs(objArray);

    expect(result).toEqual(expected);
  });

  it("should merge arrays of similar objects with different key names", async () => {
    const objArray = {
      attorneys: [
        {
          fullName: "Allen Cox",
          contactEmail: null,
          position: "Personal Injury Lawyer",
          contactNumber: "972.606.9000",
          specializations: [{ field: "Personal Injury" }],
        },
        {
          fullName: "Allen Cox",
          contactEmail: "allen.cox@example.com",
          position: "Personal Injury Lawyer",
          contactNumber: null,
          specializations: [
            { field: "Automobile accidents" },
            { field: "Truck accidents" },
            { field: "Amusement park injury" },
            { field: "Bus accident" },
            { field: "Industrial accidents" },
            { field: "Product defects" },
            { field: "Food poisoning" },
            { field: "Workplace accidents" },
            { field: "Wrongful death" },
            { field: "Swimming pool accidents" },
            { field: "Premises accidents" },
            { field: "Aircraft accidents" },
            { field: "Animal and dog bites" },
          ],
        },
      ],
    };

    const expected = {
      attorneys: [
        {
          fullName: "Allen Cox",
          contactEmail: "allen.cox@example.com",
          position: "Personal Injury Lawyer",
          contactNumber: "972.606.9000",
          specializations: [
            { field: "Personal Injury" },
            { field: "Automobile accidents" },
            { field: "Truck accidents" },
            { field: "Amusement park injury" },
            { field: "Bus accident" },
            { field: "Industrial accidents" },
            { field: "Product defects" },
            { field: "Food poisoning" },
            { field: "Workplace accidents" },
            { field: "Wrongful death" },
            { field: "Swimming pool accidents" },
            { field: "Premises accidents" },
            { field: "Aircraft accidents" },
            { field: "Animal and dog bites" },
          ],
        },
      ],
    };

    const result = mergeNullValObjs(objArray);

    expect(result).toEqual(expected);
  });

  it("should deal with not array values", async () => {
    const objArray = {
      lawyers: {
        name: "not an array",
      },
      attorneys: {
        name: "not an array",
      },
    };

    const expected = {
      lawyers: {
        name: "not an array",
      },
      attorneys: {
        name: "not an array",
      },
    };

    // @ts-expect-error
    const result = mergeNullValObjs(objArray);

    expect(result).toEqual(expected);
  });

  it("should deal with arrays of strings", async () => {
    const objArray = {
      lawyers: ["res1", "res2", "res3"],
    };

    const expected = {
      lawyers: ["res1", "res2", "res3"],
    };

    const result = mergeNullValObjs(objArray);

    expect(result).toEqual(expected);
  });
});
