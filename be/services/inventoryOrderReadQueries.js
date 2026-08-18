const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildInventoryOrderListOptions({
  page = 1,
  orderName,
  userName,
  status,
  startDate,
  endDate,
  byCompletedDate,
} = {}) {
  const limit = 20;
  const skip = (page - 1) * limit;
  const query = {};

  if (orderName) query.orderName = { $regex: escapeRegex(orderName), $options: 'i' };
  if (userName) query.userName = { $regex: escapeRegex(userName), $options: 'i' };

  if (byCompletedDate === 'true') {
    query.status = true;
  } else if (status) {
    query.status = status === 'true';
  }

  if (startDate || endDate) {
    const dateFilter = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setUTCHours(0 - 7, 0, 0, 0);
      dateFilter.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setUTCHours(23 - 7, 59, 59, 999);
      dateFilter.$lte = end;
    }

    if (byCompletedDate === 'true') {
      query.$or = [
        { completedAt: dateFilter },
        { completedAt: { $exists: false }, createdAt: dateFilter },
        { completedAt: null, createdAt: dateFilter },
      ];
    } else {
      query.createdAt = dateFilter;
    }
  }

  return {
    limit,
    page,
    query,
    skip,
    sortField: byCompletedDate === 'true' ? 'completedAt' : 'createdAt',
  };
}

async function listInventoryOrders(OrderModel, queryParams) {
  const { limit, page, query, skip, sortField } = buildInventoryOrderListOptions(queryParams);
  const totalOrders = await OrderModel.countDocuments(query);
  const orders = await OrderModel.find(query)
    .skip(skip)
    .limit(limit)
    .sort({ [sortField]: -1 });

  return {
    orders,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalOrders / limit),
      totalItems: totalOrders,
    },
  };
}

function buildInventoryOrderProductSummaryOptions({ page = 1 } = {}) {
  const limit = 10;
  const skip = (page - 1) * limit;
  return {
    countPipeline: [
      { $unwind: '$productList' },
      { $group: { _id: '$productList.productId' } },
      { $count: 'total' },
    ],
    limit,
    page,
    pipeline: [
      { $unwind: '$productList' },
      {
        $group: {
          _id: '$productList.productId',
          totalOrdered: { $sum: '$productList.quantity' },
          productDetails: { $first: '$productList' },
        },
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productInfo',
        },
      },
      { $unwind: '$productInfo' },
      {
        $project: {
          _id: 1,
          name: '$productInfo.name',
          brand: '$productInfo.brand',
          variant: '$productInfo.variant',
          totalOrdered: 1,
        },
      },
      { $sort: { name: 1 } },
      { $skip: skip },
      { $limit: limit },
    ],
  };
}

async function listInventoryOrderProducts(OrderModel, queryParams) {
  const { countPipeline, limit, page, pipeline } =
    buildInventoryOrderProductSummaryOptions(queryParams);
  const products = await OrderModel.aggregate(pipeline);
  const totalProducts = await OrderModel.aggregate(countPipeline);
  const totalItems = totalProducts.length > 0 ? totalProducts[0].total : 0;

  return {
    products,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalItems / limit),
      totalItems,
    },
  };
}

module.exports = {
  buildInventoryOrderListOptions,
  buildInventoryOrderProductSummaryOptions,
  listInventoryOrderProducts,
  listInventoryOrders,
};
