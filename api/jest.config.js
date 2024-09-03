module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["./jest.setup.js"],
  // ignore dist folder root dir
  modulePathIgnorePatterns: ["<rootDir>/dist/"],

};
