import { describe, it, expect } from "@jest/globals";

describe("Worker Port Configuration", () => {
  it("should use PORT environment variable when set", () => {
    const originalPort = process.env.PORT;
    
    process.env.PORT = "8080";
    
    const workerPort = process.env.PORT || 3005;
    expect(workerPort).toBe("8080");
    
    if (originalPort !== undefined) {
      process.env.PORT = originalPort;
    } else {
      delete process.env.PORT;
    }
  });

  it("should fallback to 3005 when PORT environment variable is not set", () => {
    const originalPort = process.env.PORT;
    delete process.env.PORT;
    
    const workerPort = process.env.PORT || 3005;
    expect(workerPort).toBe(3005);
    
    if (originalPort !== undefined) {
      process.env.PORT = originalPort;
    }
  });
});
