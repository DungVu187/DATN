const mongoose = require("mongoose");
const { User } = require("../models/user");

const shouldApply = process.argv.slice(2).includes("--apply");
const databaseName = process.env.DB_NAME || "Ecom";
const mongoUri = process.env.MONGODB_URI || `mongodb://localhost:27017/${databaseName}`;

const run = async () => {
  try {
    await mongoose.connect(mongoUri);

    const staffCount = await User.countDocuments({ role: "staff" });
    if (!shouldApply) {
      process.stdout.write(
        `Dry run: sẽ reset permissions và functions của ${staffCount} tài khoản staff.\nChạy lại với --apply để thực hiện thay đổi.\n`
      );
      return;
    }

    const result = await User.updateMany(
      { role: "staff" },
      { $set: { permissions: [], functions: [] } }
    );
    process.stdout.write(
      `Đã reset quyền staff. Matched: ${result.matchedCount}, modified: ${result.modifiedCount}.\n`
    );
  } catch (error) {
    process.stderr.write(`Không thể reset quyền staff: ${error.message}\n`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
