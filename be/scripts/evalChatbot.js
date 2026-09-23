/**
 * Evaluator chatbot NOVA.
 *
 * Mặc định chạy offline trên DB test EcomTest với bộ fixture cố định và KHÔNG gọi API trả phí.
 * Ca phủ danh mục được sinh động từ catalog thật nên thêm type/brand mới không phải sửa code.
 *
 * Ví dụ:
 *   node scripts/evalChatbot.js
 *   node scripts/evalChatbot.js --split=holdout
 *   node scripts/evalChatbot.js --live --max-live=25     (chỉ khi đã có GEMINI_API_KEY và chấp nhận chi phí)
 *
 * An toàn: mọi thao tác ghi chỉ chạy khi tên DB thực tế là EcomTest.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.CHAT_RATE_LIMIT_MAX = process.env.CHAT_RATE_LIMIT_MAX || '10000';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const request = require('supertest');

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes('--' + name);
const getArg = (name, fallback) => {
    const found = args.find((item) => item.startsWith('--' + name + '='));
    return found ? found.split('=').slice(1).join('=') : fallback;
};

const DB_NAME = getArg('db', 'EcomTest');
const SPLIT = getArg('split', 'all');
const LIVE = hasFlag('live');
const MAX_LIVE = Number(getArg('max-live', '25'));
const OUT_DIR = path.resolve(__dirname, '..', getArg('out', 'tests/artifacts/chatbot'));
const DATASET_PATH = path.resolve(__dirname, '..', getArg('dataset', 'tests/fixtures/chat-eval-dataset.json'));

const { removeVietnameseTones } = require('../utils/textNormalization');

const SESSION_PREFIX = 'chat-eval-' + Date.now();
const VISITOR = 'visitor-eval-' + Date.now();

const inSplit = (split) => SPLIT === 'all' || split === SPLIT;
const pickSplit = (seed) => {
    // Chia 75/25 ổn định theo tên, để lần chạy sau vẫn cùng một tập holdout.
    let hash = 0;
    for (const character of String(seed)) hash = (hash * 31 + character.charCodeAt(0)) % 1000;
    return hash % 4 === 0 ? 'holdout' : 'dev';
};

/** Sinh ca phủ danh mục từ catalog thật: không hardcode số type/brand. */
async function deriveCatalogCases(catalog, Product) {
    const cases = [];

    catalog.types.forEach((type) => {
        const split = pickSplit('type:' + type);
        cases.push({
            id: 'catalog-type-' + type,
            group: 'catalog_type',
            split,
            message: 'Bên mình có bán ' + type + ' không?',
            expected: { task: 'search', resolution: 'resolved', types: [type] },
        });
        cases.push({
            id: 'catalog-type-plain-' + type,
            group: 'catalog_type',
            split,
            // "shop còn X không" là câu hỏi tồn kho viết không dấu.
            message: 'shop con ' + removeVietnameseTones(type).toLowerCase() + ' khong',
            expected: { task: 'details', fields: ['stock'], resolution: 'resolved', types: [type] },
        });
    });

    for (const brand of catalog.brands) {
        const sample = await Product.findOne({ brand, display: true }).select('type').lean();
        if (!sample?.type) continue;
        cases.push({
            id: 'catalog-brand-' + brand,
            group: 'catalog_brand',
            split: pickSplit('brand:' + brand),
            message: 'Bên mình bán ' + sample.type + ' hãng ' + brand + ' không?',
            expected: { task: 'search', resolution: 'resolved', types: [sample.type], brands: [brand] },
        });
    }

    return cases;
}

const sameSet = (actual = [], expected = []) => expected.every((item) => actual.includes(item));

function scoreRouting(analysis, expected) {
    const failures = [];
    if (expected.primaryIntent && analysis.primaryIntent !== expected.primaryIntent) {
        failures.push('primaryIntent=' + analysis.primaryIntent + ' (mong đợi ' + expected.primaryIntent + ')');
    }
    if (expected.notIntent && analysis.primaryIntent === expected.notIntent) {
        failures.push('primaryIntent không được là ' + expected.notIntent);
    }
    if (expected.task && analysis.task !== expected.task) {
        failures.push('task=' + analysis.task + ' (mong đợi ' + expected.task + ')');
    }
    if (expected.fields && !sameSet(analysis.requestedFields, expected.fields)) {
        failures.push('fields=[' + analysis.requestedFields.join(',') + '] (mong đợi [' + expected.fields.join(',') + '])');
    }
    if (expected.warrantyScope && analysis.warrantyScope !== expected.warrantyScope) {
        failures.push('warrantyScope=' + analysis.warrantyScope + ' (mong đợi ' + expected.warrantyScope + ')');
    }
    if (expected.resolution && !String(expected.resolution).startsWith('out_of_scope_after_lookup')
        && analysis.resolution !== expected.resolution) {
        failures.push('resolution=' + analysis.resolution + ' (mong đợi ' + expected.resolution + ')');
    }
    if (expected.types && !sameSet(analysis.entities.types, expected.types)) {
        failures.push('types=[' + analysis.entities.types.join(',') + '] (mong đợi [' + expected.types.join(',') + '])');
    }
    if (expected.brands && !sameSet(analysis.entities.brands, expected.brands)) {
        failures.push('brands=[' + analysis.entities.brands.join(',') + '] (mong đợi [' + expected.brands.join(',') + '])');
    }
    if (expected.codes && !sameSet(analysis.entities.codes, expected.codes)) {
        failures.push('codes=[' + analysis.entities.codes.join(',') + '] (mong đợi [' + expected.codes.join(',') + '])');
    }
    return failures;
}

function scoreRetrieval(retrieval, expected) {
    if (!expected.types || expected.types.length === 0) return null;
    const top3 = retrieval.products.slice(0, 3);
    const hit = top3.some((product) => expected.types.includes(product.type));
    const returned = retrieval.products;
    const relevant = returned.filter((product) => expected.types.includes(product.type));
    const forbidden = expected.forbiddenTypes
        ? returned.filter((product) => expected.forbiddenTypes.includes(product.type))
        : [];
    return {
        hit,
        returnedCount: returned.length,
        relevantCount: relevant.length,
        forbiddenCount: forbidden.length,
        topTypes: top3.map((product) => product.type),
    };
}

function summarizeGroups(results) {
    const groups = {};
    results.forEach((result) => {
        const bucket = groups[result.group] || (groups[result.group] = { total: 0, passed: 0 });
        bucket.total += 1;
        if (result.passed) bucket.passed += 1;
    });
    Object.values(groups).forEach((bucket) => {
        bucket.accuracy = bucket.total ? Number((bucket.passed / bucket.total).toFixed(4)) : 0;
    });
    return groups;
}

function summarizeSplits(results) {
    const splits = {};
    results.forEach((result) => {
        const bucket = splits[result.split] || (splits[result.split] = { total: 0, passed: 0 });
        bucket.total += 1;
        if (result.passed) bucket.passed += 1;
    });
    Object.values(splits).forEach((bucket) => {
        bucket.accuracy = bucket.total ? Number((bucket.passed / bucket.total).toFixed(4)) : 0;
    });
    return splits;
}

async function runSingleTurn({ cases, catalog, analyzeChatMessage, retrieveProducts, fixtureIds }) {
    const results = [];
    const retrievalStats = { evaluated: 0, hits: 0, returned: 0, relevant: 0, forbidden: 0 };

    for (const testCase of cases) {
        const context = testCase.context || {};
        const currentProductId = typeof context.currentProductId === 'string' && context.currentProductId.startsWith('FIXTURE:')
            ? fixtureIds.get(context.currentProductId.slice('FIXTURE:'.length))
            : context.currentProductId;

        const analysis = analyzeChatMessage(testCase.message, {
            catalog,
            hasStoredFocus: context.hasStoredFocus === true,
            currentProductId,
        });
        const failures = scoreRouting(analysis, testCase.expected || {});

        let retrievalResult = null;
        if (testCase.expected?.types || testCase.expected?.codes) {
            const retrieval = await retrieveProducts({ message: testCase.message, catalog, limit: 5 });
            retrievalResult = scoreRetrieval(retrieval, testCase.expected);
            if (retrievalResult) {
                retrievalStats.evaluated += 1;
                if (retrievalResult.hit) retrievalStats.hits += 1;
                retrievalStats.returned += retrievalResult.returnedCount;
                retrievalStats.relevant += retrievalResult.relevantCount;
                retrievalStats.forbidden += retrievalResult.forbiddenCount;
                if (!retrievalResult.hit) failures.push('retrieval miss: top=[' + retrievalResult.topTypes.join(',') + ']');
                if (retrievalResult.forbiddenCount > 0) failures.push('trả về nhóm bị cấm');
            }
        }

        results.push({
            id: testCase.id,
            group: testCase.group,
            split: testCase.split,
            message: testCase.message,
            passed: failures.length === 0,
            failures,
            retrieval: retrievalResult,
        });
    }

    return {
        results,
        retrieval: {
            evaluated: retrievalStats.evaluated,
            hitAt3: retrievalStats.evaluated ? Number((retrievalStats.hits / retrievalStats.evaluated).toFixed(4)) : null,
            precisionAtK: retrievalStats.returned ? Number((retrievalStats.relevant / retrievalStats.returned).toFixed(4)) : null,
            averageK: retrievalStats.evaluated ? Number((retrievalStats.returned / retrievalStats.evaluated).toFixed(2)) : null,
            forbiddenHits: retrievalStats.forbidden,
        },
    };
}

async function runMultiTurn({ scenarios, app, ChatMessage }) {
    const results = [];

    for (const scenario of scenarios) {
        const chatSessionId = SESSION_PREFIX + '-' + scenario.id;
        const failures = [];
        let lastShown = [];

        for (const [index, turn] of scenario.turns.entries()) {
            const response = await request(app).post('/chat/send').send({
                message: turn.message,
                chatSessionId,
                visitorId: VISITOR,
            });
            const body = response.body || {};
            const products = Array.isArray(body.products) ? body.products : [];
            const expect = turn.expect || {};
            const label = 'lượt ' + (index + 1);

            if (response.status !== 200) failures.push(label + ': HTTP ' + response.status);
            if (expect.answerType && body.answerType !== expect.answerType) {
                failures.push(label + ': answerType=' + body.answerType + ' (mong đợi ' + expect.answerType + ')');
            }
            // Khách đã trả lời rồi mà bot vẫn hỏi lại là lỗi nặng: cần khẳng định được "không phải clarification".
            if (expect.notAnswerType && body.answerType === expect.notAnswerType) {
                failures.push(label + ': answerType=' + body.answerType + ' (không được phép)');
            }
            if (expect.replyNotEquals && String(body.reply || '').trim() === String(expect.replyNotEquals).trim()) {
                failures.push(label + ': lặp lại nguyên văn câu hỏi của lượt trước');
            }
            if (expect.anyProductNameContains
                && !products.some((product) => String(product.name || '').includes(expect.anyProductNameContains))) {
                failures.push(label + ': không có sản phẩm nào chứa "' + expect.anyProductNameContains + '"');
            }
            if (expect.minProducts && products.length < expect.minProducts) {
                failures.push(label + ': chỉ có ' + products.length + ' sản phẩm');
            }
            if (expect.productCount && products.length !== expect.productCount) {
                failures.push(label + ': có ' + products.length + ' sản phẩm (mong đợi ' + expect.productCount + ')');
            }
            if (expect.allType && !products.every((product) => product.type === expect.allType)) {
                failures.push(label + ': lẫn nhóm khác ' + expect.allType);
            }
            if (expect.replyContains && !String(body.reply || '').includes(expect.replyContains)) {
                failures.push(label + ': reply thiếu "' + expect.replyContains + '"');
            }
            if (Number.isInteger(expect.matchesShownIndex)) {
                const expectedId = lastShown[expect.matchesShownIndex];
                if (!expectedId || products[0]?.productId !== expectedId) {
                    failures.push(label + ': không giữ đúng món thứ ' + (expect.matchesShownIndex + 1));
                }
            }
            if (products.length > 0) lastShown = products.map((product) => product.productId);
        }

        await ChatMessage.deleteMany({ chatSessionId });
        results.push({ id: scenario.id, split: scenario.split, passed: failures.length === 0, failures });
    }

    return results;
}

async function main() {
    const uri = 'mongodb://localhost:27017/' + DB_NAME;
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    const actualDbName = mongoose.connection.name;
    if (actualDbName !== 'EcomTest') {
        throw new Error('Evaluator chỉ được ghi vào EcomTest, DB hiện tại là "' + actualDbName + '".');
    }

    // Mặc định không gọi API trả phí: bỏ key khỏi tiến trình để nhánh cục bộ chạy.
    const savedApiKey = process.env.GEMINI_API_KEY;
    if (!LIVE) process.env.GEMINI_API_KEY = '';
    if (LIVE && !savedApiKey) throw new Error('Chế độ --live cần GEMINI_API_KEY trong môi trường.');

    const app = require('../index');
    const { Product } = require('../models/product');
    const { ChatMessage } = require('../models/chatmessage');
    const { analyzeChatMessage } = require('../services/chatIntent');
    const { getCatalogMetadata, resetCatalogCache } = require('../services/chatCatalog');
    const { retrieveProducts } = require('../services/chatRetrieval');
    const { seedChatFixtures, cleanChatFixtures } = require('../tests/fixtures/chatProducts');

    const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
    const fixtures = await seedChatFixtures();
    const fixtureIds = new Map([...fixtures.entries()].map(([key, product]) => [key, product._id.toString()]));

    try {
        resetCatalogCache();
        const catalog = await getCatalogMetadata({ forceRefresh: true });
        const derivedCases = await deriveCatalogCases(catalog, Product);
        const allCases = [...dataset.cases, ...derivedCases].filter((testCase) => inSplit(testCase.split));
        const scenarios = dataset.multiTurn.filter((scenario) => inSplit(scenario.split))
            .slice(0, LIVE ? Math.max(1, Math.floor(MAX_LIVE / 3)) : undefined);

        const singleTurn = await runSingleTurn({
            cases: allCases, catalog, analyzeChatMessage, retrieveProducts, fixtureIds,
        });
        const multiTurn = await runMultiTurn({ scenarios, app, ChatMessage });

        const report = {
            generatedAt: new Date().toISOString(),
            datasetVersion: dataset.version,
            catalogSnapshot: {
                db: actualDbName,
                typeCount: catalog.types.length,
                brandCount: catalog.brands.length,
                capturedAt: catalog.capturedAt,
            },
            mode: LIVE ? 'live' : 'offline',
            split: SPLIT,
            singleTurn: {
                total: singleTurn.results.length,
                passed: singleTurn.results.filter((result) => result.passed).length,
                accuracy: singleTurn.results.length
                    ? Number((singleTurn.results.filter((result) => result.passed).length / singleTurn.results.length).toFixed(4))
                    : 0,
                byGroup: summarizeGroups(singleTurn.results),
                bySplit: summarizeSplits(singleTurn.results),
                retrieval: singleTurn.retrieval,
                failures: singleTurn.results.filter((result) => !result.passed)
                    .map((result) => ({ id: result.id, message: result.message, failures: result.failures })),
            },
            multiTurn: {
                total: multiTurn.length,
                passed: multiTurn.filter((result) => result.passed).length,
                accuracy: multiTurn.length
                    ? Number((multiTurn.filter((result) => result.passed).length / multiTurn.length).toFixed(4))
                    : 0,
                failures: multiTurn.filter((result) => !result.passed),
            },
        };

        fs.mkdirSync(OUT_DIR, { recursive: true });
        const reportPath = path.join(OUT_DIR, 'eval-report-' + (LIVE ? 'live' : 'offline') + '-' + SPLIT + '.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

        console.log(JSON.stringify({
            datasetVersion: report.datasetVersion,
            mode: report.mode,
            split: report.split,
            singleTurn: {
                total: report.singleTurn.total,
                passed: report.singleTurn.passed,
                accuracy: report.singleTurn.accuracy,
                bySplit: report.singleTurn.bySplit,
                byGroup: report.singleTurn.byGroup,
                retrieval: report.singleTurn.retrieval,
            },
            multiTurn: {
                total: report.multiTurn.total,
                passed: report.multiTurn.passed,
                accuracy: report.multiTurn.accuracy,
            },
            reportPath,
        }, null, 2));
        if (report.singleTurn.failures.length > 0) {
            console.log('\nCa trượt (' + report.singleTurn.failures.length + '):');
            report.singleTurn.failures.slice(0, 40).forEach((failure) => {
                console.log('  [' + failure.id + '] ' + failure.message + ' → ' + failure.failures.join('; '));
            });
        }
        if (report.multiTurn.failures.length > 0) {
            console.log('\nChuỗi trượt:');
            report.multiTurn.failures.forEach((failure) => {
                console.log('  [' + failure.id + '] ' + failure.failures.join('; '));
            });
        }
    } finally {
        await cleanChatFixtures();
        await ChatMessage.deleteMany({ chatSessionId: { $regex: '^' + SESSION_PREFIX } });
        if (!LIVE) process.env.GEMINI_API_KEY = savedApiKey;
        await mongoose.disconnect();
    }
}

if (require.main === module) {
    main().catch(async (error) => {
        console.error('Eval failed:', error.message);
        await mongoose.disconnect().catch(() => { });
        process.exitCode = 1;
    });
}

module.exports = { deriveCatalogCases, scoreRetrieval, scoreRouting };
