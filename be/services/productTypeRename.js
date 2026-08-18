const { Manage } = require('../models/manage');
const { Product } = require('../models/product');
const { Type } = require('../models/producttype');

const cloneValue = (value) => {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
};

const runRollbackStep = async (label, operation, rollbackErrors) => {
    try {
        await operation();
    } catch (error) {
        rollbackErrors.push({ label, error });
    }
};

const restoreProducts = async ({ productIds, oldName, nextName }) => {
    if (productIds.length === 0) return;

    await Product.updateMany(
        {
            _id: { $in: productIds },
            type: nextName,
        },
        { $set: { type: oldName } },
    );
};

const restoreManage = async ({ manageId, homeCategoryConfig, version }) => {
    if (!manageId || homeCategoryConfig === null) return;

    const setUpdate = { homeCategoryConfig };
    if (version !== undefined) {
        setUpdate.__v = version;
    }

    await Manage.updateOne(
        { _id: manageId },
        { $set: setUpdate },
    );
};

const restoreType = async ({ typeId, oldName, oldIcon, nextName, nextIcon }) => {
    const update = oldIcon === undefined
        ? {
            $set: { Type: oldName },
            $unset: { icon: 1 },
        }
        : {
            $set: {
                Type: oldName,
                icon: oldIcon,
            },
        };

    await Type.updateOne(
        {
            _id: typeId,
            Type: nextName,
            icon: nextIcon,
        },
        update,
    );
};

const applyProductTypeRename = async ({
    currentType,
    oldName,
    oldIcon,
    oldIconRaw,
    nextName,
    nextIcon,
}) => {
    let manage;
    let manageSnapshot = null;
    let manageVersion;
    let renamedProductIds = [];
    let updatedProducts = 0;
    let updatedHomeCategories = 0;

    try {
        await currentType.save();

        manage = await Manage.findOne();
        if (manage) {
            manageSnapshot = cloneValue(manage.homeCategoryConfig);
            manageVersion = manage.__v;
        }

        if (oldName !== nextName) {
            renamedProductIds = await Product.distinct('_id', { type: oldName });
            if (renamedProductIds.length > 0) {
                const updateResult = await Product.updateMany(
                    {
                        _id: { $in: renamedProductIds },
                        type: oldName,
                    },
                    { $set: { type: nextName } },
                );
                updatedProducts = updateResult.modifiedCount || 0;
            }
        }

        const categoryItems = manage?.homeCategoryConfig?.items;
        if (Array.isArray(categoryItems)) {
            categoryItems.forEach((item) => {
                if (item.type !== oldName) return;

                let changed = false;
                if (oldName !== nextName) {
                    item.type = nextName;
                    changed = true;
                    if (item.label === oldName) {
                        item.label = nextName;
                    }
                }
                if (oldIcon !== nextIcon && item.icon === oldIcon) {
                    item.icon = nextIcon;
                    changed = true;
                }
                if (changed) updatedHomeCategories += 1;
            });

            if (updatedHomeCategories > 0) {
                manage.markModified('homeCategoryConfig.items');
                await manage.save();
            }
        }
    } catch (error) {
        const rollbackErrors = [];
        await runRollbackStep(
            'products',
            () => restoreProducts({ productIds: renamedProductIds, oldName, nextName }),
            rollbackErrors,
        );
        await runRollbackStep(
            'manage',
            () => restoreManage({
                manageId: manage?._id,
                homeCategoryConfig: manageSnapshot,
                version: manageVersion,
            }),
            rollbackErrors,
        );
        await runRollbackStep(
            'type',
            () => restoreType({
                typeId: currentType._id,
                oldName,
                oldIcon: oldIconRaw,
                nextName,
                nextIcon,
            }),
            rollbackErrors,
        );

        if (rollbackErrors.length > 0) {
            const consistencyError = new Error('Product Type rename rollback không hoàn tất.');
            consistencyError.cause = error;
            consistencyError.rollbackErrors = rollbackErrors;
            throw consistencyError;
        }

        throw error;
    }

    return { updatedProducts, updatedHomeCategories };
};

module.exports = {
    applyProductTypeRename,
    cloneValue,
    restoreManage,
    restoreProducts,
    restoreType,
};
