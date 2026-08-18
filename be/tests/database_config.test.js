const {
  resolveMongoUri,
  validateDatabaseName,
} = require("../config/database");

describe("database configuration", () => {
  test("uses the explicit MONGODB_URI when provided", () => {
    expect(
      resolveMongoUri({
        MONGODB_URI: "mongodb://db-user:db-pass@mongo.internal:27017/Ecom",
        DB_NAME: "IgnoredDatabase",
      })
    ).toBe("mongodb://db-user:db-pass@mongo.internal:27017/Ecom");
  });

  test("builds a local URI from DB_NAME", () => {
    expect(resolveMongoUri({ DB_NAME: "Ecom" })).toBe(
      "mongodb://localhost:27017/Ecom"
    );
  });

  test("accepts a mongodb+srv URI that includes a database", () => {
    expect(
      resolveMongoUri({
        MONGODB_URI: "mongodb+srv://db-user:db-pass@cluster.example/Ecom?retryWrites=true",
      })
    ).toBe(
      "mongodb+srv://db-user:db-pass@cluster.example/Ecom?retryWrites=true"
    );
  });

  test.each([
    "mongodb://localhost:27017/",
    "mongodb://localhost:27017/?authSource=admin",
    "https://localhost:27017/Ecom",
  ])("rejects a MONGODB_URI without a valid database: %s", (uri) => {
    expect(() => resolveMongoUri({ MONGODB_URI: uri })).toThrow(
      "MONGODB_URI phải bao gồm tên database"
    );
  });

  test("trims DB_NAME before building the local URI", () => {
    expect(resolveMongoUri({ DB_NAME: "  Ecom  " })).toBe(
      "mongodb://localhost:27017/Ecom"
    );
  });

  test("fails fast when no database target is configured", () => {
    expect(() => resolveMongoUri({})).toThrow(
      "Thiếu cấu hình DB_NAME hoặc MONGODB_URI."
    );
  });

  test.each(["Ecom/main", "Ecom.main", "Ecom main", "Ecom$main"])(
    "rejects an unsafe database name: %s",
    (databaseName) => {
      expect(() => validateDatabaseName(databaseName)).toThrow(
        "DB_NAME chỉ được chứa chữ cái, chữ số, dấu gạch ngang và gạch dưới."
      );
    }
  );
});
