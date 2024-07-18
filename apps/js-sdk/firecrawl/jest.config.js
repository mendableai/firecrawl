/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  testEnvironment: "node",
  "moduleNameMapper": {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  "extensionsToTreatAsEsm": [".ts"],
  "transform": {
    "^.+\\.(mt|t|cj|j)s$": [
      "ts-jest",
      {
        "useESM": true
      }
    ]
  },
};