const path = require('path');
const {
    createInvoiceScanFileDescriptor,
    rollbackInvoiceScanFile,
    storeInvoiceScanFile,
} = require('../services/invoiceScanFileLifecycle');

const UPLOAD_ROOT = path.resolve('invoice-scan-test-root');
const NOW = 1700000000123;
const RANDOM_VALUE = 0.123456789;
const EXPECTED_FILENAME = 'invoice-scan-1700000000123-123456789.webp';

describe('Invoice scan file lifecycle', () => {
    it('keeps the legacy filename and URL contract', () => {
        expect(createInvoiceScanFileDescriptor({
            uploadRoot: UPLOAD_ROOT,
            now: () => NOW,
            random: () => RANDOM_VALUE,
        })).toEqual({
            filename: EXPECTED_FILENAME,
            filePath: path.join(UPLOAD_ROOT, EXPECTED_FILENAME),
            imageUrl: '/invoice-images/' + EXPECTED_FILENAME,
        });
    });

    it('creates the directory and persists the original upload bytes', async () => {
        const buffer = Buffer.from('invoice-bytes');
        const fsImpl = {
            mkdir: jest.fn().mockResolvedValue(undefined),
            writeFile: jest.fn().mockResolvedValue(undefined),
            unlink: jest.fn(),
        };

        await expect(storeInvoiceScanFile({ buffer }, {
            fsImpl,
            uploadRoot: UPLOAD_ROOT,
            now: () => NOW,
            random: () => RANDOM_VALUE,
        })).resolves.toEqual({
            filename: EXPECTED_FILENAME,
            filePath: path.join(UPLOAD_ROOT, EXPECTED_FILENAME),
            imageUrl: '/invoice-images/' + EXPECTED_FILENAME,
        });

        expect(fsImpl.mkdir).toHaveBeenCalledWith(UPLOAD_ROOT, { recursive: true });
        expect(fsImpl.writeFile).toHaveBeenCalledWith(
            path.join(UPLOAD_ROOT, EXPECTED_FILENAME),
            buffer,
        );
        expect(fsImpl.unlink).not.toHaveBeenCalled();
    });

    it('attempts cleanup and preserves the write error when persistence fails', async () => {
        const writeError = Object.assign(new Error('write failed'), { code: 'EIO' });
        const fsImpl = {
            mkdir: jest.fn().mockResolvedValue(undefined),
            writeFile: jest.fn().mockRejectedValue(writeError),
            unlink: jest.fn().mockResolvedValue(undefined),
        };

        await expect(storeInvoiceScanFile({ buffer: Buffer.from('invoice') }, {
            fsImpl,
            uploadRoot: UPLOAD_ROOT,
            now: () => NOW,
            random: () => RANDOM_VALUE,
        })).rejects.toBe(writeError);
        expect(fsImpl.unlink).toHaveBeenCalledWith(path.join(UPLOAD_ROOT, EXPECTED_FILENAME));
    });

    it('returns true for rollback success and false when the file is already absent', async () => {
        const storedFile = { filePath: path.join(UPLOAD_ROOT, EXPECTED_FILENAME) };
        const successFs = { unlink: jest.fn().mockResolvedValue(undefined) };
        const missingFs = {
            unlink: jest.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' })),
        };

        await expect(rollbackInvoiceScanFile(storedFile, { fsImpl: successFs })).resolves.toBe(true);
        await expect(rollbackInvoiceScanFile(storedFile, { fsImpl: missingFs })).resolves.toBe(false);
    });

    it('surfaces real rollback I/O errors', async () => {
        const rollbackError = Object.assign(new Error('rollback failed'), { code: 'EACCES' });
        const fsImpl = { unlink: jest.fn().mockRejectedValue(rollbackError) };

        await expect(rollbackInvoiceScanFile({
            filePath: path.join(UPLOAD_ROOT, EXPECTED_FILENAME),
        }, { fsImpl })).rejects.toBe(rollbackError);
    });
});
