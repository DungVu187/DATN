const {
  buildInventoryOrderListOptions,
  buildInventoryOrderProductSummaryOptions,
  listInventoryOrderProducts,
  listInventoryOrders,
} = require('../services/inventoryOrderReadQueries');

describe('inventory order read queries', () => {
  it('builds escaped filters and UTC+7 completed-date fallback', () => {
    const options = buildInventoryOrderListOptions({
      page: '2',
      orderName: 'PO.*',
      userName: 'Staff (A)',
      status: 'false',
      startDate: '2026-07-01',
      endDate: '2026-07-01',
      byCompletedDate: 'true',
    });

    expect(options).toMatchObject({
      limit: 20,
      page: '2',
      skip: 20,
      sortField: 'completedAt',
    });
    expect(options.query.status).toBe(true);
    expect(options.query.orderName.$regex).toBe('PO\\.\\*');
    expect(options.query.userName.$regex).toBe('Staff \\(A\\)');
    expect(options.query.$or).toHaveLength(3);
    expect(options.query.$or[0].completedAt.$gte.toISOString()).toBe('2026-06-30T17:00:00.000Z');
    expect(options.query.$or[0].completedAt.$lte.toISOString()).toBe('2026-07-01T16:59:59.999Z');
  });

  it('preserves list query chaining and pagination envelope', async () => {
    const queryChain = {
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([{ orderName: 'Second page' }]),
    };
    const OrderModel = {
      countDocuments: jest.fn().mockResolvedValue(21),
      find: jest.fn().mockReturnValue(queryChain),
    };

    const result = await listInventoryOrders(OrderModel, { page: '2', status: 'false' });

    expect(OrderModel.countDocuments).toHaveBeenCalledWith({ status: false });
    expect(OrderModel.find).toHaveBeenCalledWith({ status: false });
    expect(queryChain.skip).toHaveBeenCalledWith(20);
    expect(queryChain.limit).toHaveBeenCalledWith(20);
    expect(queryChain.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(result).toEqual({
      orders: [{ orderName: 'Second page' }],
      pagination: { currentPage: 2, totalPages: 2, totalItems: 21 },
    });
  });

  it('builds the legacy product summary aggregation', () => {
    const options = buildInventoryOrderProductSummaryOptions({ page: '3' });

    expect(options.limit).toBe(10);
    expect(options.pipeline).toEqual(expect.arrayContaining([
      { $unwind: '$productList' },
      { $sort: { name: 1 } },
      { $skip: 20 },
      { $limit: 10 },
    ]));
    expect(options.pipeline[1].$group).toEqual({
      _id: '$productList.productId',
      totalOrdered: { $sum: '$productList.quantity' },
      productDetails: { $first: '$productList' },
    });
    expect(options.countPipeline).toEqual([
      { $unwind: '$productList' },
      { $group: { _id: '$productList.productId' } },
      { $count: 'total' },
    ]);
  });

  it('runs product and count pipelines with the legacy envelope', async () => {
    const aggregate = jest.fn()
      .mockResolvedValueOnce([{ _id: 'p1', totalOrdered: 4 }])
      .mockResolvedValueOnce([{ total: 11 }]);

    const result = await listInventoryOrderProducts({ aggregate }, { page: '2' });

    expect(aggregate).toHaveBeenCalledTimes(2);
    expect(aggregate.mock.calls[0][0]).toEqual(expect.arrayContaining([
      { $skip: 10 },
      { $limit: 10 },
    ]));
    expect(result).toEqual({
      products: [{ _id: 'p1', totalOrdered: 4 }],
      pagination: { currentPage: 2, totalPages: 2, totalItems: 11 },
    });
  });
});
