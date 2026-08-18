const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const { User } = require('../components/user');
const { Manage } = require('../components/manage');
const { ActivityLog } = require('../components/activitylog');

beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/EcomTest');
});

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

afterEach(async () => {
  await User.deleteMany({});
  await Manage.deleteMany({});
  await ActivityLog.deleteMany({});
});

const createStaffAgent = async ({ phone, permissions = [] }) => {
  await new User({
    phone,
    password: 'password123',
    name: `Staff ${phone}`,
    role: 'staff',
    functions: ['product_management'],
    permissions,
  }).save();

  const agent = request.agent(app);
  const loginRes = await agent
    .post('/users/admin/login')
    .send({ phone, password: 'password123' });

  expect(loginRes.status).toBe(200);
  expect(loginRes.headers['set-cookie']).toBeDefined();
  return agent;
};

describe('Manage storefront authorization', () => {
  it('returns four default policies publicly without a manage document', async () => {
    const res = await request(app).get('/manages/policies');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.data).toHaveLength(4);
    expect(res.body.data.map((policy) => policy.key)).toEqual([
      'purchase',
      'warranty',
      'shipping',
      'privacy',
    ]);
    expect(res.body.data[0].sections.length).toBeGreaterThan(0);
    expect(res.body.data[0].translations.vi.title).toBe('Chính sách mua hàng');
    expect(res.body.data[0].translations.zh.title).toBe('购买政策');
    expect(res.body.data[0].translations.en.title).toBe('Purchase Policy');
  });

  it('allows storefront managers to update structured policies', async () => {
    const agent = await createStaffAgent({
      phone: '0944000006',
      permissions: ['storefront.manage'],
    });
    const defaults = await request(app).get('/manages/policies');
    const policies = defaults.body.data.map((policy) => ({
      key: policy.key,
      title: policy.title,
      summary: policy.summary,
      sections: policy.sections.map(({ title, content }) => ({ title, content })),
    }));
    policies[0].sections[0].content = 'Nội dung mua hàng đã chỉnh sửa';

    const res = await agent
      .put('/manages/update-policies')
      .send({ policies });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.data).toHaveLength(4);
    expect(res.body.data[0].sections[0].content).toBe('Nội dung mua hàng đã chỉnh sửa');
    expect(res.body.data[0].updatedAt).toBeTruthy();

    const publicRes = await request(app).get('/manages/policies');
    expect(publicRes.body.data[0].sections[0].content).toBe('Nội dung mua hàng đã chỉnh sửa');
  });

  it('rejects invalid structured policy payloads', async () => {
    const agent = await createStaffAgent({
      phone: '0944000007',
      permissions: ['storefront.manage'],
    });

    const res = await agent
      .put('/manages/update-policies')
      .send({ policies: [{ key: 'purchase', title: '', summary: '', sections: [] }] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(0);
  });

  it('stores and returns all three policy languages', async () => {
    const agent = await createStaffAgent({
      phone: '0944000010',
      permissions: ['storefront.manage'],
    });
    const defaults = await request(app).get('/manages/policies');
    const policies = defaults.body.data.map((policy) => ({
      key: policy.key,
      title: policy.translations.vi.title,
      summary: policy.translations.vi.summary,
      sections: policy.translations.vi.sections,
      translations: policy.translations,
    }));
    policies[0].translations.zh.summary = '面向中国客户的购买说明。';
    policies[0].translations.en.summary = 'Purchasing guidance for international customers.';

    const res = await agent
      .put('/manages/update-policies')
      .send({ policies });

    expect(res.status).toBe(200);
    expect(res.body.data[0].translations.zh.summary).toBe('面向中国客户的购买说明。');
    expect(res.body.data[0].translations.en.summary).toBe('Purchasing guidance for international customers.');

    const publicRes = await request(app).get('/manages/policies');
    expect(publicRes.body.data[0].translations.zh.summary).toBe('面向中国客户的购买说明。');
    expect(publicRes.body.data[0].translations.en.summary).toBe('Purchasing guidance for international customers.');
  });

  it('blocks staff missing storefront.manage on structured policy updates', async () => {
    const agent = await createStaffAgent({
      phone: '0944000008',
      permissions: [],
    });

    const res = await agent
      .put('/manages/update-policies')
      .send({ policies: [] });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('storefront.manage');
  });

  it('allows staff with storefront.manage to update introduction', async () => {
    const agent = await createStaffAgent({
      phone: '0944000001',
      permissions: ['storefront.manage'],
    });

    const res = await agent
      .put('/manages/update-introduction')
      .send({
        introduction: 'Giới thiệu cửa hàng',
        translations: {
          vi: 'Giới thiệu cửa hàng',
          zh: '商城介绍',
          en: 'Storefront introduction',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.data.introduction).toBe('Giới thiệu cửa hàng');
    expect(res.body.data.introductionTranslations.zh).toBe('商城介绍');
    expect(res.body.data.introductionTranslations.en).toBe('Storefront introduction');
  });

  it('blocks staff missing storefront.manage on update introduction', async () => {
    const agent = await createStaffAgent({
      phone: '0944000002',
      permissions: [],
    });

    const res = await agent
      .put('/manages/update-introduction')
      .send({ introduction: 'Blocked intro' });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('storefront.manage');
  });

  it('keeps GET /manages public', async () => {
    await Manage.create({ introduction: 'Public intro' });

    const res = await request(app).get('/manages/');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.data.introduction).toBe('Public intro');
  });

  it('allows storefront managers to configure home categories', async () => {
    const agent = await createStaffAgent({
      phone: '0944000003',
      permissions: ['storefront.manage'],
    });

    const res = await agent
      .put('/manages/update-home-categories')
      .send({
        configured: true,
        sidebarTitle: 'Thiết bị nổi bật',
        sidebarTitleTranslations: {
          vi: 'Thiết bị nổi bật',
          zh: '精选设备',
          en: 'Featured Equipment',
        },
        showSidebar: true,
        showQuickCategories: true,
        items: [
          {
            id: 'lighting',
            label: 'Đèn báo',
            labelTranslations: {
              vi: 'Đèn báo',
              zh: '指示灯',
              en: 'Indicator Lights',
            },
            type: 'Đèn',
            link: '',
            icon: 'ri-tb-bulb',
            image: '/images/category-light.jpg',
            showSidebar: true,
            showQuick: true,
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.data.homeCategoryConfig.sidebarTitle).toBe('Thiết bị nổi bật');
    expect(res.body.data.homeCategoryConfig.items).toHaveLength(1);
    expect(res.body.data.homeCategoryConfig.items[0].type).toBe('Đèn');
    expect(res.body.data.homeCategoryConfig.items[0].icon).toBe('ri-tb-bulb');
    expect(res.body.data.homeCategoryConfig.sidebarTitleTranslations.en).toBe('Featured Equipment');
    expect(res.body.data.homeCategoryConfig.items[0].labelTranslations.zh).toBe('指示灯');
  });

  it('stores localized homepage section titles without changing the product filter name', async () => {
    const agent = await createStaffAgent({
      phone: '0944000011',
      permissions: ['storefront.manage'],
    });

    const res = await agent
      .put('/manages/update-section/section2')
      .send({
        name: 'Biến tần',
        nameTranslations: {
          vi: 'Biến tần',
          zh: '变频器',
          en: 'Variable Frequency Drives',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.section2.name).toBe('Biến tần');
    expect(res.body.data.section2.nameTranslations.zh).toBe('变频器');
    expect(res.body.data.section2.nameTranslations.en).toBe('Variable Frequency Drives');
  });

  it('rejects invalid home category configuration', async () => {
    const agent = await createStaffAgent({
      phone: '0944000004',
      permissions: ['storefront.manage'],
    });

    const res = await agent
      .put('/manages/update-home-categories')
      .send({
        items: [{ label: 'Thiếu đích đến', icon: 'fa-microchip' }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(0);
  });

  it('blocks staff missing storefront.manage on home category updates', async () => {
    const agent = await createStaffAgent({
      phone: '0944000005',
      permissions: [],
    });

    const res = await agent
      .put('/manages/update-home-categories')
      .send({ items: [] });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('storefront.manage');
  });
});
