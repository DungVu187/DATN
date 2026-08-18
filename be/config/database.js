const LOCAL_MONGO_ORIGIN = "mongodb://localhost:27017";

const normalizeDatabaseName = (value) => String(value || "").trim();

const validateDatabaseName = (databaseName) => {
  if (!databaseName) {
    throw new Error("Thiếu cấu hình DB_NAME hoặc MONGODB_URI.");
  }

  if (!/^[A-Za-z0-9_-]+$/.test(databaseName)) {
    throw new Error("DB_NAME chỉ được chứa chữ cái, chữ số, dấu gạch ngang và gạch dưới.");
  }

  return databaseName;
};

const getDatabaseNameFromUri = (uri) => {
  const match = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^/?#]+)(?:[?#]|$)/i.exec(uri);
  if (!match) {
    throw new Error("MONGODB_URI phải bao gồm tên database, ví dụ .../Ecom.");
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(match[1]);
  } catch (_error) {
    throw new Error("Tên database trong MONGODB_URI không hợp lệ.");
  }

  return validateDatabaseName(databaseName);
};

const resolveMongoUri = (environment = process.env) => {
  const explicitUri = String(environment.MONGODB_URI || "").trim();
  if (explicitUri) {
    getDatabaseNameFromUri(explicitUri);
    return explicitUri;
  }

  const databaseName = validateDatabaseName(
    normalizeDatabaseName(environment.DB_NAME)
  );
  return `${LOCAL_MONGO_ORIGIN}/${databaseName}`;
};

module.exports = {
  getDatabaseNameFromUri,
  resolveMongoUri,
  validateDatabaseName,
};
