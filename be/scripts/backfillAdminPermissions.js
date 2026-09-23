require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('../models/user');
const { getGrantablePermissions, getPermissionLabel } = require('../config/permissions');
const { resolveMongoUri } = require('../config/database');

/**
 * Trước B6 mọi tài khoản admin đi tắt qua ADMIN_FULL_ACCESS nên không ai cần mảng
 * `permissions`. Bỏ đường tắt xong, admin cũ mang mảng rỗng sẽ bị 403 ở mọi module
 * ngoài account.manage. Script cấp bù trọn bộ quyền grantable cho các admin CÓ SẴN.
 *
 * Chỉ đụng vào role 'admin': superadmin vốn bypass, staff phải do người cấp tay
 * theo đúng phạm vi công việc. Quyền mới được HỢP với quyền đang có, không ghi đè.
 * Admin tạo về sau vẫn mặc định trắng quyền — đó là chủ đích của B6.
 *
 * Mặc định chỉ liệt kê (dry-run). Muốn ghi thật thì truyền --apply.
 */
async function main() {
    const apply = process.argv.includes('--apply');

    try {
        await mongoose.connect(resolveMongoUri());
        console.log(`Database: ${mongoose.connection.name}`);

        const grantable = getGrantablePermissions();
        const admins = await User.find({ role: 'admin' }).select('phone name permissions');

        if (admins.length === 0) {
            console.log('Khong co tai khoan admin nao.');
            return;
        }

        let changed = 0;
        for (const admin of admins) {
            const current = Array.isArray(admin.permissions) ? admin.permissions : [];
            const missing = grantable.filter((permission) => !current.includes(permission));

            console.log(`\n${admin.phone} - ${admin.name || '(khong ten)'}`);
            console.log(`  dang co: ${current.length}/${grantable.length} quyen`);

            if (missing.length === 0) {
                console.log('  du quyen, bo qua.');
                continue;
            }

            console.log(`  can cap bu ${missing.length} quyen:`);
            missing.forEach((permission) => console.log(`    + ${permission} (${getPermissionLabel(permission)})`));

            if (apply) {
                admin.permissions = [...current, ...missing];
                await admin.save();
                console.log(`  => da cap, tong cong ${admin.permissions.length} quyen.`);
            }
            changed += 1;
        }

        if (changed > 0 && !apply) {
            console.log('\nDry-run: chua ghi gi. Chay lai voi --apply de cap that.');
        }
    } catch (err) {
        console.error('Loi khi cap bu quyen admin:', err);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

main();
