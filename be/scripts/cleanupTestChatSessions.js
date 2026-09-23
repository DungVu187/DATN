require('dotenv').config();
const mongoose = require('mongoose');
const { ChatMessage } = require('../models/chatmessage');
const { resolveMongoUri } = require('../config/database');

/**
 * Chạy kiểm thử/đo đạc chatbot sinh ra rất nhiều phiên chat giả trong DB thật.
 * Script này dọn chúng đi, nhận diện theo TIỀN TỐ do script kiểm thử tự đặt —
 * phiên của khách thật luôn có dạng "chat-<uuid>" do frontend sinh nên không dính.
 *
 * Mặc định chỉ ĐẾM (dry-run). Muốn xoá thật thì truyền --apply.
 */
const TEST_SESSION_PATTERN = /^(grd-|tmp-|real\d*-|final-|probe-|eval-|t\d-|s\d-|s-\d|chat-live-)/;

async function main() {
    const apply = process.argv.includes('--apply');

    try {
        await mongoose.connect(resolveMongoUri());
        console.log(`Database: ${mongoose.connection.name}`);

        const filter = { chatSessionId: { $regex: TEST_SESSION_PATTERN } };
        const junkSessions = await ChatMessage.distinct('chatSessionId', filter);
        const junkRecords = await ChatMessage.countDocuments(filter);
        const totalRecords = await ChatMessage.countDocuments();

        console.log(`Phien rac: ${junkSessions.length} | ban ghi rac: ${junkRecords} / ${totalRecords}`);
        junkSessions.forEach((sessionId) => console.log(`- ${sessionId}`));

        if (junkRecords === 0) {
            console.log('Khong co gi de don.');
            return;
        }

        if (!apply) {
            console.log('\nDry-run: chua xoa gi. Chay lai voi --apply de xoa that.');
            return;
        }

        const result = await ChatMessage.deleteMany(filter);
        const remainingSessions = await ChatMessage.distinct('chatSessionId');
        console.log(`\nDa xoa ${result.deletedCount} ban ghi.`);
        console.log(`Phien con lai (${remainingSessions.length}): ${remainingSessions.join(', ')}`);
    } catch (err) {
        console.error('Loi khi don phien chat kiem thu:', err);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

main();
