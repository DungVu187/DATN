const fs = require("fs");
const path = require("path");

const userModel = require("../models/user");
const activityLogModel = require("../models/activitylog");
const productModel = require("../models/product");
const productSearch = require("../utils/productSearch");
const productListingUtils = require("../utils/productListing");
const productPresentation = require("../services/productPresentation");
const productUpdatePolicy = require("../utils/productUpdatePolicy");
const productPayload = require("../validators/productPayload");
const productVariantActions = require("../validators/productVariantActions");
const productReviewValidator = require("../validators/productReviews");
const productReviewController = require("../controllers/productReviews");
const productBatchValidator = require("../validators/productBatchOperations");
const productBatchController = require("../controllers/productBatchOperations");
const productAdminActionValidator = require("../validators/productAdminActions");
const productAdminActionController = require("../controllers/productAdminActions");
const productReadController = require("../controllers/productReadOperations");
const productTypeOperationController = require("../controllers/productTypeOperations");
const productTypeRenameService = require("../services/productTypeRename");
const productVariantPricingController = require("../controllers/productVariantPricingActions");
const productVariantPricingService = require("../services/productVariantPricing");
const productCreationController = require("../controllers/productCreation");
const productCreationService = require("../services/productCreation");
const productUpdateController = require("../controllers/productUpdate");
const productUpdateService = require("../services/productUpdate");
const productCodeLookup = require("../services/productCodeLookup");
const productCodeNormalization = require("../utils/productCodeNormalization");
const productVariantOperationController = require("../controllers/productVariantOperations");
const productVariantOperationService = require("../services/productVariantOperations");
const productStockAdjustmentController = require("../controllers/productStockAdjustment");
const productStockAdjustmentService = require("../services/productStockAdjustment");
const productListingController = require("../controllers/productListing");
const productListingService = require("../services/productListing");
const productMediaController = require("../controllers/productMedia");
const productMediaService = require("../services/productMedia");
const productAccess = require("../services/productAccess");
const storageHistoryModel = require("../models/storagehistory");
const ipOrderModel = require("../models/iporder");
const epOrderModel = require("../models/eporder");
const orderModel = require("../models/order");
const orderReadQueryController = require("../controllers/orderReadQueries");
const orderReadFilters = require("../services/orderReadFilters");
const orderDetailReadController = require("../controllers/orderDetailReads");
const orderItemOperationsController = require("../controllers/orderItemOperations");
const orderCreationController = require("../controllers/orderCreation");
const orderMetadataController = require("../controllers/orderMetadata");
const orderMediaController = require("../controllers/orderMedia");
const orderMediaService = require("../services/orderMedia");
const orderLifecycleController = require("../controllers/orderLifecycle");
const orderLifecycleService = require("../services/orderLifecycle");
const ipOrderReadController = require("../controllers/ipOrderReadQueries");
const epOrderReadController = require("../controllers/epOrderReadQueries");
const inventoryOrderReadQueries = require("../services/inventoryOrderReadQueries");
const ipOrderDetailController = require("../controllers/ipOrderDetailReads");
const ipOrderMetadataController = require("../controllers/ipOrderMetadata");
const ipOrderLineOperationsController = require("../controllers/ipOrderLineOperations");
const ipOrderMutationsController = require("../controllers/ipOrderMutations");
const epOrderDetailController = require("../controllers/epOrderDetailReads");
const epOrderMetadataController = require("../controllers/epOrderMetadata");
const epOrderLineOperationsController = require("../controllers/epOrderLineOperations");
const epOrderMutationsController = require("../controllers/epOrderMutations");
const inventoryOrderMediaController = require("../controllers/inventoryOrderMedia");
const inventoryOrderMedia = require("../services/inventoryOrderMedia");
const inventoryOrderLifecycleController = require("../controllers/inventoryOrderLifecycle");
const ipOrderStockCompletionController = require("../controllers/ipOrderStockCompletion");
const epOrderStockCompletionController = require("../controllers/epOrderStockCompletion");
const inventoryOrderDetail = require("../services/inventoryOrderDetail");
const epOrderPricing = require("../services/epOrderPricing");
const orderAccess = require("../services/orderAccess");
const orderPresentation = require("../services/orderPresentation");
const orderItemWorkflows = require("../services/orderItemWorkflows");
const orderItemValidator = require("../validators/orderItem");
const orderPolicy = require("../services/orderPolicy");
const orderRouteErrors = require("../utils/orderRouteErrors");
const manageModel = require("../models/manage");
const productTypeModel = require("../models/producttype");
const productTypeUtils = require("../utils/productType");
const chipModel = require("../models/chip");
const brandNormalization = require("../utils/brandNormalization");
const productInvoiceMatching = require("../services/productInvoiceMatching");
const productInvoiceGemini = require("../services/productInvoiceGemini");
const productInvoicePrompt = require("../services/productInvoicePrompt");
const invoiceScanFileLifecycle = require("../services/invoiceScanFileLifecycle");
const productInvoiceScanController = require("../controllers/productInvoiceScan");
const userComponent = require("../components/user");
const activityLogComponent = require("../components/activitylog");
const productComponent = require("../components/product");
const storageHistoryComponent = require("../components/storagehistory");
const ipOrderComponent = require("../components/iporder");
const epOrderComponent = require("../components/eporder");
const orderComponent = require("../components/order");
const manageComponent = require("../components/manage");
const productTypeComponent = require("../components/producttype");
const chipComponent = require("../components/chip");

const readBackendFile = (relativePath) => fs.readFileSync(
  path.join(__dirname, "..", relativePath),
  "utf8"
);

describe("backend model boundaries", () => {
  it("keeps route-module model exports backward compatible", () => {
    expect(userComponent.User).toBe(userModel.User);
    expect(activityLogComponent.ActivityLog).toBe(activityLogModel.ActivityLog);
    expect(productComponent.Product).toBe(productModel.Product);
    expect(productComponent.buildTokenQuery).toBe(productSearch.buildTokenQuery);
    expect(productComponent.greedyNarrowTokens).toBe(productSearch.greedyNarrowTokens);
    expect(storageHistoryComponent.StorageHistory).toBe(storageHistoryModel.StorageHistory);
    expect(ipOrderComponent.IpOrder).toBe(ipOrderModel.IpOrder);
    expect(epOrderComponent.EpOrder).toBe(epOrderModel.EpOrder);
    expect(orderComponent.Order).toBe(orderModel.Order);
    expect(manageComponent.Manage).toBe(manageModel.Manage);
    expect(productTypeComponent.Type).toBe(productTypeModel.Type);
    expect(productTypeComponent.normalizeProductTypeName).toBe(productTypeUtils.normalizeProductTypeName);
    expect(productTypeComponent.serializeProductType).toBe(productTypeUtils.serializeProductType);
    expect(chipComponent.Chip).toBe(chipModel.Chip);
    expect(productComponent.normalizeBrandKey).toBe(brandNormalization.normalizeBrandKey);
    expect(productComponent.resolveBrand).toBe(brandNormalization.resolveBrand);
  });

  it("keeps schemas and model-specific behavior in the model layer", () => {
    expect(userModel.User.schema).toBe(userModel.userSchema);
    expect(typeof userModel.User.prototype.comparePassword).toBe("function");
    expect(activityLogModel.ActivityLog.schema).toBe(activityLogModel.activityLogSchema);
    expect(productModel.Product.schema).toBe(productModel.productSchema);
    expect(productModel.productSchema.path("variant").schema.path("earn").options.default)
      .toBe(productModel.DEFAULT_PRODUCT_EARN);
    expect(storageHistoryModel.StorageHistory.schema).toBe(storageHistoryModel.storageHistorySchema);
    expect(ipOrderModel.IpOrder.schema).toBe(ipOrderModel.ipOrderSchema);
    expect(epOrderModel.EpOrder.schema).toBe(epOrderModel.epOrderSchema);
    expect(orderModel.Order.schema).toBe(orderModel.orderSchema);
    expect(orderModel.Counter.schema).toBe(orderModel.counterSchema);
    expect(manageModel.Manage.schema).toBe(manageModel.manageSchema);
    expect(manageModel.manageSchema.path("introductionTranslations").schema)
      .toBe(manageModel.localizedTextSchema);
    expect(manageModel.manageSchema.path("homeCategoryConfig.items").schema)
      .toBe(manageModel.homeCategoryItemSchema);
    expect(productTypeModel.Type.schema).toBe(productTypeModel.productTypeSchema);
    const iconValidator = productTypeModel.productTypeSchema.path("icon").validators
      .find((validator) => validator.type === "user defined").validator;
    expect(iconValidator("ri-tb-box-multiple")).toBe(true);
    expect(iconValidator("<script>alert(1)</script>")).toBe(false);
    expect(chipModel.Chip.schema).toBe(chipModel.chipSchema);
    expect(chipModel.Brand.schema).toBe(chipModel.brandSchema);
    expect(chipModel.Section.schema).toBe(chipModel.sectionSchema);

    const ttlIndex = activityLogModel.activityLogSchema.indexes().find(
      ([fields, options]) => fields.createdAt === 1 && options.expireAfterSeconds === 7776000
    );
    expect(ttlIndex).toBeDefined();
  });

  it("prevents route files from defining these mongoose models again", () => {
    const userRouteSource = readBackendFile("components/user.js");
    const activityLogRouteSource = readBackendFile("components/activitylog.js");
    const productRouteSource = readBackendFile("components/product.js");
    const storageHistoryRouteSource = readBackendFile("components/storagehistory.js");
    const ipOrderRouteSource = readBackendFile("components/iporder.js");
    const epOrderRouteSource = readBackendFile("components/eporder.js");
    const orderRouteSource = readBackendFile("components/order.js");
    const manageRouteSource = readBackendFile("components/manage.js");
    const productTypeRouteSource = readBackendFile("components/producttype.js");
    const chipRouteSource = readBackendFile("components/chip.js");

    expect(userRouteSource).not.toMatch(/new mongoose\.Schema|mongoose\.model|require\(["']\.\/activitylog["']\)/);
    expect(activityLogRouteSource).not.toMatch(/new mongoose\.Schema|mongoose\.model/);
    expect(productRouteSource).not.toMatch(/new mongoose\.Schema|mongoose\.model\(["']Product["']/);
    expect(storageHistoryRouteSource).not.toMatch(/new mongoose\.Schema|mongoose\.model/);
    expect(ipOrderRouteSource).toMatch(/require\(["']\.\.\/models\/iporder["']\)/);
    expect(ipOrderRouteSource).not.toMatch(/new mongoose\.Schema|mongoose\.model\(["']IpOrder["']/);
    expect(epOrderRouteSource).toMatch(/require\(["']\.\.\/models\/eporder["']\)/);
    expect(epOrderRouteSource).not.toMatch(/new mongoose\.Schema|mongoose\.model\(["']EpOrder["']/);
    expect(orderRouteSource).toMatch(/require\(["']\.\.\/models\/order["']\)/);
    expect(orderRouteSource).not.toMatch(/new mongoose\.Schema|mongoose\.model\(["'](?:Order|Counter)["']/);
    expect(manageRouteSource).toMatch(/require\(["']\.\.\/models\/manage["']\)/);
    expect(manageRouteSource).not.toMatch(/new mongoose\.Schema|mongoose\.model\(["']Manage["']/);
    expect(productTypeRouteSource).not.toMatch(/new mongoose\.Schema|mongoose\.model/);
    expect(chipRouteSource).not.toMatch(/new mongoose\.Schema|mongoose\.model/);
  });

  it("keeps IPOrder and EPOrder read summaries outside the facades", () => {
    const ipRouteSource = readBackendFile("components/iporder.js");
    const epRouteSource = readBackendFile("components/eporder.js");
    const ipControllerSource = readBackendFile("controllers/ipOrderReadQueries.js");
    const epControllerSource = readBackendFile("controllers/epOrderReadQueries.js");
    const serviceSource = readBackendFile("services/inventoryOrderReadQueries.js");
    const routeExpectations = [
      [ipRouteSource, "require('../controllers/ipOrderReadQueries')", 'router.get("/orders", [authenticateAdmin, checkPermission("iporder.view")], listIpOrders);', 'router.get("/products", [authenticateAdmin, checkPermission("iporder.view")], listIpOrderProducts);'],
      [epRouteSource, "require('../controllers/epOrderReadQueries')", 'router.get("/orders", [authenticateAdmin, checkPermission("eporder.view")], listEpOrders);', 'router.get("/products", [authenticateAdmin, checkPermission("eporder.view")], listEpOrderProducts);'],
    ];

    routeExpectations.forEach(([routeSource, controllerImport, listRoute, productsRoute]) => {
      expect(routeSource).toContain(controllerImport);
      expect(routeSource).toContain(listRoute);
      expect(routeSource).toContain(productsRoute);
      expect(routeSource).not.toContain('escapeRegex');
      const listStart = routeSource.indexOf(listRoute);
      const nextPost = routeSource.indexOf('router.post(', listStart);
      const productsStart = routeSource.indexOf(productsRoute);
      const uploadStart = routeSource.indexOf('router.post(\n  "/upload-image"', productsStart);
      expect(listStart).toBeGreaterThan(-1);
      expect(nextPost).toBeGreaterThan(listStart);
      expect(productsStart).toBeGreaterThan(-1);
      expect(uploadStart).toBeGreaterThan(productsStart);
      expect(routeSource.slice(listStart, nextPost)).not.toContain('async');
      expect(routeSource.slice(listStart, nextPost)).not.toContain('countDocuments');
      expect(routeSource.slice(productsStart, uploadStart)).not.toContain('aggregate');
    });

    expect(typeof ipOrderReadController.listIpOrders).toBe('function');
    expect(typeof ipOrderReadController.listIpOrderProducts).toBe('function');
    expect(typeof epOrderReadController.listEpOrders).toBe('function');
    expect(typeof epOrderReadController.listEpOrderProducts).toBe('function');
    expect(typeof inventoryOrderReadQueries.buildInventoryOrderListOptions).toBe('function');
    expect(typeof inventoryOrderReadQueries.buildInventoryOrderProductSummaryOptions).toBe('function');
    expect(ipControllerSource).toContain("require('../models/iporder')");
    expect(epControllerSource).toContain("require('../models/eporder')");
    expect(ipControllerSource).toContain("require('../services/inventoryOrderReadQueries')");
    expect(epControllerSource).toContain("require('../services/inventoryOrderReadQueries')");
    expect(serviceSource).not.toContain('../components/');
    expect(serviceSource).not.toContain('req.');
    expect(serviceSource).not.toContain('res.');
  });

  it("keeps IPOrder and EPOrder detail reads outside the facades", () => {
    const ipRouteSource = readBackendFile("components/iporder.js");
    const epRouteSource = readBackendFile("components/eporder.js");
    const ipControllerSource = readBackendFile("controllers/ipOrderDetailReads.js");
    const epControllerSource = readBackendFile("controllers/epOrderDetailReads.js");
    const detailServiceSource = readBackendFile("services/inventoryOrderDetail.js");
    const pricingServiceSource = readBackendFile("services/epOrderPricing.js");
    const routeChecks = [
      [ipRouteSource, 'router.get("/orders/:id", [authenticateAdmin, checkPermission("iporder.view")], getIpOrderDetail);'],
      [epRouteSource, 'router.get("/orders/:id", [authenticateAdmin, checkPermission("eporder.view")], getEpOrderDetail);'],
    ];

    routeChecks.forEach(([routeSource, route]) => {
      expect(routeSource).toContain(route);
      const routeIndex = routeSource.indexOf(route);
      const nextPut = routeSource.indexOf('router.put(', routeIndex);
      expect(routeIndex).toBeGreaterThan(-1);
      expect(nextPut).toBeGreaterThan(routeIndex);
      expect(routeSource.slice(routeIndex, nextPut)).not.toContain('async');
      expect(routeSource.slice(routeIndex, nextPut)).not.toContain('Product.findById');
      expect(routeSource.slice(routeIndex, nextPut)).not.toContain('Error fetching order');
    });

    expect(typeof ipOrderDetailController.getIpOrderDetail).toBe('function');
    expect(typeof epOrderDetailController.getEpOrderDetail).toBe('function');
    expect(typeof inventoryOrderDetail.enrichInventoryOrderLines).toBe('function');
    expect(typeof epOrderPricing.getExistingPricingBase).toBe('function');
    expect(ipControllerSource).toContain("require('../models/iporder')");
    expect(epControllerSource).toContain("require('../models/eporder')");
    expect(ipControllerSource).toContain("require('../services/inventoryOrderDetail')");
    expect(epControllerSource).toContain("require('../services/inventoryOrderDetail')");
    expect(epControllerSource).toContain("require('../services/epOrderPricing')");
    expect(detailServiceSource).toContain("require('../models/product')");
    expect(detailServiceSource).not.toContain('../components/');
    expect(pricingServiceSource).toContain("require('./productPricing')");
    expect(pricingServiceSource).not.toContain('../components/');
    expect(epRouteSource).not.toContain('const getExistingPricingBase =');
    expect(epRouteSource).not.toContain('const normalizeProfitPercent =');
  });

  it("keeps IPOrder metadata update outside the facade", () => {
    const routeSource = readBackendFile("components/iporder.js");
    const controllerSource = readBackendFile("controllers/ipOrderMetadata.js");
    const route = 'router.put("/orders/:id", [authenticateAdmin, checkPermission("iporder.edit")], updateIpOrderMetadata);';
    const nameRoute = 'router.put(\n  "/orders/:id/name",\n  [authenticateAdmin, checkPermission("iporder.edit")],\n  updateIpOrderName\n);';

    expect(routeSource).toContain("require('../controllers/ipOrderMetadata')");
    expect(routeSource).toContain(route);
    expect(routeSource).toContain(nameRoute);
    expect(typeof ipOrderMetadataController.updateIpOrderMetadata).toBe('function');
    expect(typeof ipOrderMetadataController.updateIpOrderName).toBe('function');
    expect(controllerSource).toContain("require('../models/iporder')");
    expect(controllerSource).not.toContain('../components/');
    const routeIndex = routeSource.indexOf(route);
    const nextDelete = routeSource.indexOf('router.delete(', routeIndex);
    expect(routeIndex).toBeGreaterThan(-1);
    expect(nextDelete).toBeGreaterThan(routeIndex);
    expect(routeSource.slice(routeIndex, nextDelete)).not.toContain('async');
    expect(routeSource.slice(routeIndex, nextDelete)).not.toContain('IpOrder.findById');
    expect(routeSource.slice(routeIndex, nextDelete)).not.toContain('order.total');
  });

  it("keeps EPOrder metadata and pricing persistence outside the facade", () => {
    const routeSource = readBackendFile("components/eporder.js");
    const controllerSource = readBackendFile("controllers/epOrderMetadata.js");
    const pricingSource = readBackendFile("services/epOrderPricing.js");
    const route = 'router.put("/orders/:id", [authenticateAdmin, checkPermission("eporder.edit")], updateEpOrderMetadata);';
    const nameRoute = 'router.put(\n  "/orders/:id/name",\n  [authenticateAdmin, checkPermission("eporder.edit")],\n  updateEpOrderName\n);';

    expect(routeSource).toContain("require('../controllers/epOrderMetadata')");
    expect(routeSource).toContain(route);
    expect(routeSource).toContain(nameRoute);
    expect(typeof epOrderMetadataController.updateEpOrderMetadata).toBe('function');
    expect(typeof epOrderMetadataController.updateEpOrderName).toBe('function');
    expect(typeof epOrderPricing.resolveNewExportPricing).toBe('function');
    expect(typeof epOrderPricing.resolveUpdatedExportPricing).toBe('function');
    expect(typeof epOrderPricing.ensureOrderPricingSnapshots).toBe('function');
    expect(typeof epOrderPricing.saveExportOrder).toBe('function');
    expect(controllerSource).toContain("require('../models/eporder')");
    expect(controllerSource).toContain("require('../services/epOrderPricing')");
    expect(controllerSource).not.toContain('../components/');
    expect(pricingSource).toContain("require('../models/product')");
    expect(pricingSource).not.toContain('../components/');
    expect(routeSource).not.toContain('const ensureOrderPricingSnapshots =');
    expect(routeSource).not.toContain('const saveExportOrder =');
    const routeIndex = routeSource.indexOf(route);
    const nextDelete = routeSource.indexOf('router.delete(', routeIndex);
    expect(routeIndex).toBeGreaterThan(-1);
    expect(nextDelete).toBeGreaterThan(routeIndex);
    expect(routeSource.slice(routeIndex, nextDelete)).not.toContain('async');
    expect(routeSource.slice(routeIndex, nextDelete)).not.toContain('EpOrder.findById');
  });

  it("keeps IPOrder and EPOrder line operations outside the facades", () => {
    const ipRouteSource = readBackendFile("components/iporder.js");
    const epRouteSource = readBackendFile("components/eporder.js");
    const ipControllerSource = readBackendFile("controllers/ipOrderLineOperations.js");
    const epControllerSource = readBackendFile("controllers/epOrderLineOperations.js");
    const ipRoute = 'router.delete(\n  "/orders/:id/products/:productIndex",\n  [authenticateAdmin, checkPermission("iporder.edit")],\n  deleteIpOrderLine\n);';
    const epRoute = 'router.delete(\n  "/orders/:id/products/:productIndex",\n  [authenticateAdmin, checkPermission("eporder.edit")],\n  deleteEpOrderLine\n);';
    const ipReorderRoute = 'router.put(\n  "/orders/:id/reorder",\n  [authenticateAdmin, checkPermission("iporder.edit")],\n  reorderIpOrderLines\n);';
    const epReorderRoute = 'router.put(\n  "/orders/:id/reorder",\n  [authenticateAdmin, checkPermission("eporder.edit")],\n  reorderEpOrderLines\n);';

    expect(ipRouteSource).toContain("require('../controllers/ipOrderLineOperations')");
    expect(epRouteSource).toContain("require('../controllers/epOrderLineOperations')");
    expect(ipRouteSource).toContain(ipRoute);
    expect(epRouteSource).toContain(epRoute);
    expect(ipRouteSource).toContain(ipReorderRoute);
    expect(epRouteSource).toContain(epReorderRoute);
    expect(typeof ipOrderLineOperationsController.deleteIpOrderLine).toBe('function');
    expect(typeof epOrderLineOperationsController.deleteEpOrderLine).toBe('function');
    expect(typeof ipOrderLineOperationsController.reorderIpOrderLines).toBe('function');
    expect(typeof epOrderLineOperationsController.reorderEpOrderLines).toBe('function');
    expect(ipControllerSource).toContain("require('../models/iporder')");
    expect(epControllerSource).toContain("require('../models/eporder')");
    expect(epControllerSource).toContain("require('../services/epOrderPricing')");
    expect(ipControllerSource).not.toContain('../components/');
    expect(epControllerSource).not.toContain('../components/');

    const ipRouteIndex = ipRouteSource.indexOf(ipRoute);
    const epRouteIndex = epRouteSource.indexOf(epRoute);
    const ipNextRoute = ipRouteSource.indexOf('router.put("/orders/:id"', ipRouteIndex);
    const epNextRoute = epRouteSource.indexOf('router.put("/orders/:id"', epRouteIndex);
    expect(ipRouteSource.slice(ipRouteIndex, ipNextRoute)).not.toContain('async');
    expect(epRouteSource.slice(epRouteIndex, epNextRoute)).not.toContain('async');
    expect(ipRouteSource.slice(ipRouteIndex, ipNextRoute)).not.toContain('productList.splice');
    expect(epRouteSource.slice(epRouteIndex, epNextRoute)).not.toContain('productList.splice');
    expect(ipRouteSource).not.toContain('const toLineKey =');
    expect(epRouteSource).not.toContain('const toLineKey =');
  });

  it("keeps IPOrder and EPOrder create/add/update mutations outside the facades", () => {
    const ipRouteSource = readBackendFile("components/iporder.js");
    const epRouteSource = readBackendFile("components/eporder.js");
    const ipControllerSource = readBackendFile("controllers/ipOrderMutations.js");
    const epControllerSource = readBackendFile("controllers/epOrderMutations.js");
    const ipCreateRoute = 'router.post(\n  "/orders",\n  [authenticateAdmin, checkPermission("iporder.create")],\n  createIpOrder\n);';
    const epCreateRoute = 'router.post(\n  "/orders",\n  [authenticateAdmin, checkPermission("eporder.create")],\n  createEpOrder\n);';
    const ipAddRoute = 'router.post(\n  "/orders/:id/products",\n  [authenticateAdmin, checkPermission("iporder.edit")],\n  addIpOrderLine\n);';
    const epAddRoute = 'router.post(\n  "/orders/:id/products",\n  [authenticateAdmin, checkPermission("eporder.edit")],\n  addEpOrderLine\n);';
    const ipUpdateRoute = 'router.put(\n  "/orders/:id/products/:productIndex",\n  [authenticateAdmin, checkPermission("iporder.edit")],\n  updateIpOrderLine\n);';
    const epUpdateRoute = 'router.put(\n  "/orders/:id/products/:productIndex",\n  [authenticateAdmin, checkPermission("eporder.edit")],\n  updateEpOrderLine\n);';

    expect(ipRouteSource).toContain("require('../controllers/ipOrderMutations')");
    expect(epRouteSource).toContain("require('../controllers/epOrderMutations')");
    expect(ipRouteSource).toContain(ipCreateRoute);
    expect(epRouteSource).toContain(epCreateRoute);
    expect(ipRouteSource).toContain(ipAddRoute);
    expect(epRouteSource).toContain(epAddRoute);
    expect(ipRouteSource).toContain(ipUpdateRoute);
    expect(epRouteSource).toContain(epUpdateRoute);
    expect(typeof ipOrderMutationsController.createIpOrder).toBe('function');
    expect(typeof ipOrderMutationsController.addIpOrderLine).toBe('function');
    expect(typeof ipOrderMutationsController.updateIpOrderLine).toBe('function');
    expect(typeof epOrderMutationsController.createEpOrder).toBe('function');
    expect(typeof epOrderMutationsController.addEpOrderLine).toBe('function');
    expect(typeof epOrderMutationsController.updateEpOrderLine).toBe('function');
    expect(ipControllerSource).toContain('require("../models/iporder")');
    expect(epControllerSource).toContain('require("../models/eporder")');
    expect(ipControllerSource).toContain('require("../services/inventory")');
    expect(epControllerSource).toContain('require("../services/inventory")');
    expect(epControllerSource).toContain('require("../services/epOrderPricing")');
    expect(ipControllerSource).not.toContain('../components/');
    expect(epControllerSource).not.toContain('../components/');
    expect(ipRouteSource).not.toMatch(/async\s*\(req,\s*res\)/);
    expect(epRouteSource).not.toMatch(/async\s*\(req,\s*res\)/);
    expect(ipRouteSource).not.toContain('applyStockAdjustments');
    expect(epRouteSource).not.toContain('applyStockAdjustments');
    expect(ipRouteSource).not.toContain('StorageHistory');
    expect(epRouteSource).not.toContain('StorageHistory');
  });

  it("keeps IPOrder and EPOrder invoice media outside the facades", () => {
    const ipRouteSource = readBackendFile("components/iporder.js");
    const epRouteSource = readBackendFile("components/eporder.js");
    const controllerSource = readBackendFile("controllers/inventoryOrderMedia.js");
    const serviceSource = readBackendFile("services/inventoryOrderMedia.js");

    expect(ipRouteSource).toContain("require('../services/inventoryOrderMedia')");
    expect(epRouteSource).toContain("require('../services/inventoryOrderMedia')");
    expect(ipRouteSource).toContain("require('../controllers/inventoryOrderMedia')");
    expect(epRouteSource).toContain("require('../controllers/inventoryOrderMedia')");
    expect(typeof inventoryOrderMediaController.uploadInventoryOrderImage).toBe('function');
    expect(typeof inventoryOrderMediaController.deleteIpOrderImage).toBe('function');
    expect(typeof inventoryOrderMediaController.deleteEpOrderImage).toBe('function');
    expect(typeof inventoryOrderMedia.uploadInventoryOrderInvoice.single).toBe('function');
    expect(typeof inventoryOrderMedia.deleteInventoryOrderImageFile).toBe('function');
    expect(controllerSource).toContain("require('../services/inventoryOrderMedia')");
    expect(serviceSource).toContain('multer.diskStorage');
    expect(serviceSource).toContain('fileFilter');
    const ipMediaStart = ipRouteSource.indexOf('router.post(\n  "/upload-image"');
    const epMediaStart = epRouteSource.indexOf('router.post(\n  "/upload-image"');
    const ipMediaSource = ipRouteSource.slice(ipMediaStart, ipRouteSource.indexOf('module.exports', ipMediaStart));
    const epMediaSource = epRouteSource.slice(epMediaStart, epRouteSource.indexOf('module.exports', epMediaStart));
    expect(ipMediaStart).toBeGreaterThan(-1);
    expect(epMediaStart).toBeGreaterThan(-1);
    expect(ipMediaSource).toMatch(/uploadInventoryOrderInvoice\.single\("invoice"\)/);
    expect(epMediaSource).toMatch(/uploadInventoryOrderInvoice\.single\("invoice"\)/);
    expect(ipMediaSource).toContain('uploadInventoryOrderImage');
    expect(epMediaSource).toContain('uploadInventoryOrderImage');
    expect(ipMediaSource).toContain('deleteIpOrderImage');
    expect(epMediaSource).toContain('deleteEpOrderImage');
    expect(ipMediaSource).not.toMatch(/multer\.diskStorage|fileFilter|fs\.promises|path\.(basename|join)|async\s*\(req,\s*res\)/);
    expect(epMediaSource).not.toMatch(/multer\.diskStorage|fileFilter|fs\.promises|path\.(basename|join)|async\s*\(req,\s*res\)/);
  });

  it("keeps IPOrder and EPOrder order deletion outside the facades", () => {
    const ipRouteSource = readBackendFile("components/iporder.js");
    const epRouteSource = readBackendFile("components/eporder.js");
    const controllerSource = readBackendFile("controllers/inventoryOrderLifecycle.js");
    const ipRoute = 'router.delete(\n  "/orders/:id",\n  [authenticateAdmin, checkPermission("iporder.delete")],\n  deleteIpOrder\n);';
    const epRoute = 'router.delete(\n  "/orders/:id",\n  [authenticateAdmin, checkPermission("eporder.delete")],\n  deleteEpOrder\n);';

    expect(ipRouteSource).toContain("require('../controllers/inventoryOrderLifecycle')");
    expect(epRouteSource).toContain("require('../controllers/inventoryOrderLifecycle')");
    expect(ipRouteSource).toContain(ipRoute);
    expect(epRouteSource).toContain(epRoute);
    expect(typeof inventoryOrderLifecycleController.deleteIpOrder).toBe('function');
    expect(typeof inventoryOrderLifecycleController.deleteEpOrder).toBe('function');
    expect(typeof inventoryOrderLifecycleController.updateIpOrderStatus).toBe('function');
    expect(typeof inventoryOrderLifecycleController.updateEpOrderStatus).toBe('function');
    expect(typeof inventoryOrderLifecycleController.updateIpOrderLineStatus).toBe('function');
    expect(typeof inventoryOrderLifecycleController.updateEpOrderLineStatus).toBe('function');
    expect(controllerSource).toContain("require('../models/iporder')");
    expect(controllerSource).toContain("require('../models/eporder')");
    expect(controllerSource).not.toContain('../components/');

    const ipRouteIndex = ipRouteSource.indexOf(ipRoute);
    const epRouteIndex = epRouteSource.indexOf(epRoute);
    const ipNextRoute = ipRouteSource.indexOf('router.put(\n  "/orders/:id/status"', ipRouteIndex);
    const epNextRoute = epRouteSource.indexOf('router.put(\n  "/orders/:id/status"', epRouteIndex);
    expect(ipRouteSource.slice(ipRouteIndex, ipNextRoute)).not.toContain('async');
    expect(epRouteSource.slice(epRouteIndex, epNextRoute)).not.toContain('async');
    expect(ipRouteSource.slice(ipRouteIndex, ipNextRoute)).not.toContain('findById');
    expect(epRouteSource.slice(epRouteIndex, epNextRoute)).not.toContain('findById');

    const ipStatusRoute = 'router.put(\n  "/orders/:id/status",\n  [authenticateAdmin, checkPermission("iporder.edit")],\n  updateIpOrderStatus\n);';
    const epStatusRoute = 'router.put(\n  "/orders/:id/status",\n  [authenticateAdmin, checkPermission("eporder.edit")],\n  updateEpOrderStatus\n);';
    expect(ipRouteSource).toContain(ipStatusRoute);
    expect(epRouteSource).toContain(epStatusRoute);
    const ipLineStatusRoute = 'router.put(\n  "/orders/:id/products/:productIndex/status",\n  [authenticateAdmin, checkPermission("iporder.edit")],\n  updateIpOrderLineStatus\n);';
    const epLineStatusRoute = 'router.put(\n  "/orders/:id/products/:productIndex/status",\n  [authenticateAdmin, checkPermission("eporder.edit")],\n  updateEpOrderLineStatus\n);';
    expect(ipRouteSource).toContain(ipLineStatusRoute);
    expect(epRouteSource).toContain(epLineStatusRoute);
  });

  it("keeps IPOrder and EPOrder stock completion outside the facades", () => {
    const ipRouteSource = readBackendFile("components/iporder.js");
    const epRouteSource = readBackendFile("components/eporder.js");
    const ipControllerSource = readBackendFile("controllers/ipOrderStockCompletion.js");
    const epControllerSource = readBackendFile("controllers/epOrderStockCompletion.js");
    const ipOrderRoute = 'router.put(\n  "/orders/:id/setStatusAndQuantity",\n  [authenticateAdmin, checkPermission("iporder.edit")],\n  setIpOrderStatusAndQuantity\n);';
    const epOrderRoute = 'router.put(\n  "/orders/:id/setStatusAndQuantity",\n  [authenticateAdmin, checkPermission("eporder.edit")],\n  setEpOrderStatusAndQuantity\n);';
    const ipLineRoute = 'router.put(\n  "/orders/:id/products/:productIndex/setStatusAndQuantity",\n  [authenticateAdmin, checkPermission("iporder.edit")],\n  setIpOrderLineStatusAndQuantity\n);';
    const epLineRoute = 'router.put(\n  "/orders/:id/products/:productIndex/setStatusAndQuantity",\n  [authenticateAdmin, checkPermission("eporder.edit")],\n  setEpOrderLineStatusAndQuantity\n);';

    expect(ipRouteSource).toContain("require('../controllers/ipOrderStockCompletion')");
    expect(epRouteSource).toContain("require('../controllers/epOrderStockCompletion')");
    expect(ipRouteSource).toContain(ipOrderRoute);
    expect(epRouteSource).toContain(epOrderRoute);
    expect(ipRouteSource).toContain(ipLineRoute);
    expect(epRouteSource).toContain(epLineRoute);
    expect(typeof ipOrderStockCompletionController.setIpOrderStatusAndQuantity).toBe('function');
    expect(typeof ipOrderStockCompletionController.setIpOrderLineStatusAndQuantity).toBe('function');
    expect(typeof epOrderStockCompletionController.setEpOrderStatusAndQuantity).toBe('function');
    expect(typeof epOrderStockCompletionController.setEpOrderLineStatusAndQuantity).toBe('function');
    expect(ipControllerSource).toContain('require("../models/iporder")');
    expect(epControllerSource).toContain('require("../models/eporder")');
    expect(ipControllerSource).toContain('require("../services/inventory")');
    expect(epControllerSource).toContain('require("../services/inventory")');
    expect(epControllerSource).toContain('require("../services/epOrderPricing")');
    expect(ipControllerSource).not.toContain('../components/');
    expect(epControllerSource).not.toContain('../components/');

    const ipOrderStart = ipRouteSource.indexOf(ipOrderRoute);
    const epOrderStart = epRouteSource.indexOf(epOrderRoute);
    const ipLineStart = ipRouteSource.indexOf(ipLineRoute);
    const epLineStart = epRouteSource.indexOf(epLineRoute);
    expect(ipOrderStart).toBeGreaterThan(-1);
    expect(epOrderStart).toBeGreaterThan(-1);
    expect(ipLineStart).toBeGreaterThan(ipOrderStart);
    expect(epLineStart).toBeGreaterThan(epOrderStart);
    expect(ipRouteSource.slice(ipOrderStart, ipLineStart)).not.toContain('async');
    expect(epRouteSource.slice(epOrderStart, epLineStart)).not.toContain('async');
    expect(ipRouteSource.slice(ipLineStart, ipRouteSource.indexOf('router.get("/orders/:id"', ipLineStart))).not.toContain('async');
    expect(epRouteSource.slice(epLineStart, epRouteSource.indexOf('router.get("/orders/:id"', epLineStart))).not.toContain('async');
  });

  it("keeps production Product consumers on the model layer", () => {
    const consumers = [
      "components/cart.js",
      "controllers/ipOrderMutations.js",
      "controllers/epOrderMutations.js",
      "controllers/ipOrderStockCompletion.js",
      "controllers/epOrderStockCompletion.js",
      "services/orderItemWorkflows.js",
      "services/orderPresentation.js",
      "scripts/migrateInfoDocToDocuments.js",
      "scripts/batch_populate_specs.js",
      "scripts/fix_duplicated_specs.js",
      "scripts/check_duplicate_product_codes.js",
      "scripts/auto_update_product_specs.js",
    ];

    consumers.forEach((relativePath) => {
      const source = readBackendFile(relativePath);
      expect(source).toMatch(/require\(["']\.\.\/models\/product["']\)/);
      expect(source).not.toMatch(/require\(["'](?:\.\/product|\.\.\/components\/product)["']\)/);
    });
  });

  it("keeps production StorageHistory consumers on the model layer", () => {
    const consumers = [
      "controllers/orderLifecycle.js",
      "controllers/ipOrderMutations.js",
      "controllers/epOrderMutations.js",
      "controllers/ipOrderStockCompletion.js",
      "controllers/epOrderStockCompletion.js",
      "services/productStockAdjustment.js",
    ];

    consumers.forEach((relativePath) => {
      const source = readBackendFile(relativePath);
      expect(source).toMatch(/require\(["']\.\.\/models\/storagehistory["']\)/);
      expect(source).not.toMatch(/require\(["']\.\/storagehistory["']\)/);
    });
  });

  it("keeps non-enriched Order reads outside the facade with stable precedence", () => {
    const orderRouteSource = readBackendFile("components/order.js");
    const controllerSource = readBackendFile("controllers/orderReadQueries.js");
    const filterSource = readBackendFile("services/orderReadFilters.js");
    const routeDeclarations = [
      'router.get("/", [authenticateAdmin, checkPermission(\'order.view\')], listOrders);',
      'router.get("/customer-suggestions", [authenticateAdmin, checkPermission(\'order.view\')], getCustomerSuggestions);',
      'router.get("/userOrders", [authenticateUser, requireCustomer], listUserOrders);',
      'router.get("/processing-count", getProcessingOrderCount);',
    ];

    expect(orderRouteSource).toMatch(/require\(["']\.\.\/controllers\/orderReadQueries["']\)/);
    expect(typeof orderReadQueryController.listOrders).toBe("function");
    expect(typeof orderReadQueryController.getCustomerSuggestions).toBe("function");
    expect(typeof orderReadQueryController.listUserOrders).toBe("function");
    expect(typeof orderReadQueryController.getProcessingOrderCount).toBe("function");
    expect(typeof orderReadFilters.buildAdminOrderListOptions).toBe("function");
    expect(typeof orderReadFilters.buildUserOrderFilter).toBe("function");

    routeDeclarations.forEach((routeDeclaration) => {
      expect(orderRouteSource).toContain(routeDeclaration);
      expect(orderRouteSource.split(routeDeclaration)).toHaveLength(2);
    });

    const customerSuggestionsIndex = orderRouteSource.indexOf(routeDeclarations[1]);
    const userOrdersIndex = orderRouteSource.indexOf(routeDeclarations[2]);
    const processingCountIndex = orderRouteSource.indexOf(routeDeclarations[3]);
    const catchAllDetailIndex = orderRouteSource.indexOf("router.get('/:_id'");
    expect(customerSuggestionsIndex).toBeGreaterThan(-1);
    expect(userOrdersIndex).toBeGreaterThan(customerSuggestionsIndex);
    expect(processingCountIndex).toBeGreaterThan(userOrdersIndex);
    expect(catchAllDetailIndex).toBeGreaterThan(processingCountIndex);

    expect(controllerSource).toMatch(/require\(["']\.\.\/models\/order["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/models\/user["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/orderReadFilters["']\)/);
    expect(controllerSource).not.toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(controllerSource).not.toMatch(/require\(["']\.\.\/services\/inventory["']\)/);
    expect(filterSource).not.toMatch(/require\(["']\.\.\/models\//);
    expect(filterSource).not.toMatch(/require\(["']\.\.\/components\//);
    expect(filterSource).not.toMatch(/\b(req|res)\./);

    expect(orderRouteSource).not.toContain("const escapeRegex =");
    expect(orderRouteSource).not.toContain("const { page = 1, limit = 10");
    expect(orderRouteSource).not.toContain("Error counting processing orders:");
  });

  it("keeps Order detail reads and presentation outside the facade", () => {
    const orderRouteSource = readBackendFile("components/order.js");
    const controllerSource = readBackendFile("controllers/orderDetailReads.js");
    const accessSource = readBackendFile("services/orderAccess.js");
    const presentationSource = readBackendFile("services/orderPresentation.js");
    const adminRoute = 'router.get("/admin-detail/:id", [authenticateAdmin, checkPermission(\'order.view\')], getAdminOrderDetail);';
    const customerRoute = "router.get('/:_id', [authenticateUser, requireCustomer], getOrderDetail);";

    expect(orderRouteSource).toMatch(/require\(["']\.\.\/controllers\/orderDetailReads["']\)/);
    expect(orderRouteSource).not.toMatch(/require\(["']\.\.\/services\/orderAccess["']\)/);
    expect(orderRouteSource).not.toMatch(/require\(["']\.\.\/services\/orderPresentation["']\)/);
    expect(orderRouteSource).toContain(adminRoute);
    expect(orderRouteSource).toContain(customerRoute);
    expect(orderRouteSource.split(adminRoute)).toHaveLength(2);
    expect(orderRouteSource.split(customerRoute)).toHaveLength(2);

    expect(typeof orderDetailReadController.getAdminOrderDetail).toBe("function");
    expect(typeof orderDetailReadController.getOrderDetail).toBe("function");
    expect(typeof orderAccess.canAccessOrder).toBe("function");
    expect(typeof orderPresentation.formatAdminOrderDetail).toBe("function");
    expect(typeof orderPresentation.formatAdminOrderWithItems).toBe("function");
    expect(typeof orderPresentation.formatCustomerOrderDetail).toBe("function");
    expect(typeof orderPresentation.getUpdatedImgUrl).toBe("function");

    const adminDetailIndex = orderRouteSource.indexOf(adminRoute);
    const userOrdersIndex = orderRouteSource.indexOf('router.get("/userOrders"');
    const processingCountIndex = orderRouteSource.indexOf('router.get("/processing-count"');
    const customerDetailIndex = orderRouteSource.indexOf(customerRoute);
    expect(adminDetailIndex).toBeGreaterThan(-1);
    expect(userOrdersIndex).toBeGreaterThan(adminDetailIndex);
    expect(processingCountIndex).toBeGreaterThan(userOrdersIndex);
    expect(customerDetailIndex).toBeGreaterThan(processingCountIndex);

    expect(controllerSource).toMatch(/require\(["']\.\.\/models\/order["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/orderAccess["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/orderPresentation["']\)/);
    expect(controllerSource).not.toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(presentationSource).toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(presentationSource).not.toMatch(/require\(["']\.\.\/components\//);
    expect(presentationSource).not.toMatch(/\b(req|res)\./);
    expect(accessSource).not.toMatch(/require\(["']\.\.\/(?:models|components)\//);
    expect(accessSource).not.toMatch(/\b(req|res)\./);

    expect(orderRouteSource).not.toContain("const getUpdatedImgUrl =");
    expect(orderRouteSource).not.toContain("async function enrichCartItems");
    expect(orderRouteSource).not.toContain("const formatAdminOrderDetail =");
    expect(orderRouteSource).not.toContain("const formatAdminOrderWithItems =");
    expect(orderRouteSource).not.toContain("const privilegedOrderRoles =");
    expect(orderRouteSource).not.toContain("const canAccessOrder =");
  });

  it("keeps Order item workflows outside the route facade", () => {
    const orderRouteSource = readBackendFile("components/order.js");
    const workflowSource = readBackendFile("services/orderItemWorkflows.js");
    const validatorSource = readBackendFile("validators/orderItem.js");

    expect(orderRouteSource).not.toMatch(/require\(["']\.\.\/services\/orderItemWorkflows["']\)/);
    expect(typeof orderItemWorkflows.parseOrderPrice).toBe("function");
    expect(typeof orderItemWorkflows.validateOrderItemInput).toBe("function");
    expect(orderItemWorkflows.validateOrderItemInput).toBe(orderItemValidator.validateOrderItemInput);
    expect(typeof orderItemWorkflows.computeOrderTotal).toBe("function");
    expect(typeof orderItemWorkflows.prepareOrderItemsForCreation).toBe("function");
    expect(typeof orderItemWorkflows.createReservationAdjustments).toBe("function");
    expect(typeof orderItemWorkflows.buildOrderStockAdjustments).toBe("function");

    expect(workflowSource).toMatch(/require\(["']\.\.\/validators\/orderItem["']\)/);
    expect(validatorSource).toMatch(/require\(["']mongoose["']\)/);
    expect(validatorSource).not.toMatch(/require\(["']\.\.\/models\//);
    expect(validatorSource).not.toMatch(/require\(["']\.\.\/components\//);
    expect(validatorSource).not.toMatch(/\b(req|res)\b/);
    expect(workflowSource).toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(workflowSource).toMatch(/require\(["']\.\/inventory["']\)/);
    expect(workflowSource).toMatch(/require\(["']\.\/productPricing["']\)/);
    expect(workflowSource).not.toMatch(/require\(["']\.\.\/components\//);
    expect(workflowSource).not.toMatch(/\b(req|res)\./);

    expect(orderRouteSource).not.toMatch(/require\(["']mongoose["']\)/);
    expect(orderRouteSource).not.toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(orderRouteSource).not.toMatch(/require\(["']\.\.\/services\/productPricing["']\)/);
    expect(orderRouteSource).not.toContain("const parseOrderPrice =");
    expect(orderRouteSource).not.toContain("async function computeOrderTotal");
    expect(orderRouteSource).not.toContain("async function prepareOrderItemsForCreation");
    expect(orderRouteSource).not.toContain("const createReservationAdjustments =");
    expect(orderRouteSource).not.toContain("async function buildOrderStockAdjustments");
    expect(orderRouteSource).not.toContain("const validateOrderItemInput =");
    expect(orderRouteSource).not.toContain("async function saveWithStockRollback");
  });

  it("keeps Order admin-draft creation orchestration outside the route facade", () => {
    const orderRouteSource = readBackendFile("components/order.js");
    const controllerSource = readBackendFile("controllers/orderCreation.js");
    const adminDraftRouteDeclaration = 'router.post("/admin-draft", [authenticateAdmin, checkPermission(\'order.create\')], createAdminDraftOrder);';
    const adminDraftRouteIndex = orderRouteSource.indexOf('router.post("/admin-draft"');
    const nextRouteIndex = orderRouteSource.indexOf('router.get("/admin-detail/:id"');

    expect(orderRouteSource).toMatch(/require\(["']\.\.\/controllers\/orderCreation["']\)/);
    expect(orderRouteSource).toContain(adminDraftRouteDeclaration);
    expect(orderRouteSource.split(adminDraftRouteDeclaration)).toHaveLength(2);
    expect(typeof orderCreationController.createAdminDraftOrder).toBe("function");

    expect(controllerSource).toMatch(/const\s*\{\s*Counter\s*,\s*Order\s*\}\s*=\s*require\(["']\.\.\/models\/order["']\)/);
    expect(controllerSource).not.toMatch(/require\(["']\.\.\/components\/order["']\)/);

    expect(adminDraftRouteIndex).toBeGreaterThan(-1);
    expect(nextRouteIndex).toBeGreaterThan(adminDraftRouteIndex);
    const adminDraftRouteSource = orderRouteSource.slice(adminDraftRouteIndex, nextRouteIndex);
    expect(adminDraftRouteSource).not.toMatch(/async\s*\(\s*req\s*,\s*res\s*\)/);
    expect(adminDraftRouteSource).not.toMatch(/findOneAndUpdate/);
    expect(adminDraftRouteSource).not.toMatch(/counter\.seq/);
    expect(adminDraftRouteSource).not.toMatch(/padStart/);
    expect(adminDraftRouteSource).not.toMatch(/new\s+Order\s*\(/);
    expect(adminDraftRouteSource).not.toMatch(/\.save\s*\(/);
    expect(adminDraftRouteSource).not.toMatch(/\bcatch\b/);
  });

  it("keeps Order admin-create orchestration outside the route facade", () => {
    const orderRouteSource = readBackendFile("components/order.js");
    const controllerSource = readBackendFile("controllers/orderCreation.js");
    const adminCreateRouteDeclaration = 'router.post("/admin-create-order", [authenticateAdmin, checkPermission(\'order.create\')], createAdminOrder);';
    const adminCreateRouteIndex = orderRouteSource.indexOf('router.post("/admin-create-order"');
    const nextRouteIndex = orderRouteSource.indexOf('router.post("/admin-draft"');

    expect(orderRouteSource).toMatch(/require\(["']\.\.\/controllers\/orderCreation["']\)/);
    expect(orderRouteSource).toContain(adminCreateRouteDeclaration);
    expect(orderRouteSource.split(adminCreateRouteDeclaration)).toHaveLength(2);
    expect(typeof orderCreationController.createAdminOrder).toBe("function");

    expect(controllerSource).toMatch(/const\s*\{\s*Counter\s*,\s*Order\s*\}\s*=\s*require\(["']\.\.\/models\/order["']\)/);
    expect(controllerSource).toMatch(/const\s*\{[^}]*\bprepareOrderItemsForCreation\b[^}]*\}\s*=\s*require\(["']\.\.\/services\/orderItemWorkflows["']\)/);
    expect(controllerSource).toMatch(/const\s*\{[^}]*\bcreateReservationAdjustments\b[^}]*\}\s*=\s*require\(["']\.\.\/services\/orderItemWorkflows["']\)/);
    expect(controllerSource).toMatch(/const\s*\{[^}]*\bapplyStockAdjustments\b[^}]*\brollbackOrThrow\b[^}]*\}\s*=\s*require\(["']\.\.\/services\/inventory["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/utils\/orderRouteErrors["']\)/);
    expect(controllerSource).toMatch(/\bgetRouteErrorMessage\b/);
    expect(controllerSource).toMatch(/\bgetRouteErrorStatus\b/);
    expect(controllerSource).not.toMatch(/require\(["']\.\.\/components\/order["']\)/);

    expect(adminCreateRouteIndex).toBeGreaterThan(-1);
    expect(nextRouteIndex).toBeGreaterThan(adminCreateRouteIndex);
    const adminCreateRouteSource = orderRouteSource.slice(adminCreateRouteIndex, nextRouteIndex);
    expect(adminCreateRouteSource).not.toMatch(/async\s*\(\s*req\s*,\s*res\s*\)/);
    expect(adminCreateRouteSource).not.toMatch(/!\s*userPhone|userPhone\s*\|\|/);
    expect(adminCreateRouteSource).not.toMatch(/Array\.isArray\s*\(\s*items\s*\)/);
    expect(adminCreateRouteSource).not.toMatch(/\bprepareOrderItemsForCreation\b/);
    expect(adminCreateRouteSource).not.toMatch(/\bcreateReservationAdjustments\b/);
    expect(adminCreateRouteSource).not.toMatch(/\bapplyStockAdjustments\b/);
    expect(adminCreateRouteSource).not.toMatch(/\brollbackOrThrow\b/);
    expect(adminCreateRouteSource).not.toMatch(/findOneAndUpdate/);
    expect(adminCreateRouteSource).not.toMatch(/counter\.seq/);
    expect(adminCreateRouteSource).not.toMatch(/padStart/);
    expect(adminCreateRouteSource).not.toMatch(/new\s+Order\s*\(/);
    expect(adminCreateRouteSource).not.toMatch(/\.save\s*\(/);
    expect(adminCreateRouteSource).not.toMatch(/\b(?:io\.)?to\s*\(/);
    expect(adminCreateRouteSource).not.toMatch(/\bemit\s*\(/);
    expect(adminCreateRouteSource).not.toMatch(/\bcatch\b/);
    expect(orderRouteSource).not.toMatch(/async\s+function\s+createAdminOrder\b/);
  });

  it("keeps Order customer-create orchestration outside the route facade", () => {
    const orderRouteSource = readBackendFile("components/order.js");
    const controllerSource = readBackendFile("controllers/orderCreation.js");
    const customerCreateRouteDeclaration = 'router.post("/create-order", [authenticateUser, requireCustomer], createCustomerOrder);';
    const customerCreateRouteIndex = orderRouteSource.indexOf('router.post("/create-order"');
    const nextRouteIndex = orderRouteSource.indexOf('router.get("/userOrders"');

    expect(orderRouteSource).toMatch(/require\(["']\.\.\/controllers\/orderCreation["']\)/);
    expect(orderRouteSource).toContain(customerCreateRouteDeclaration);
    expect(orderRouteSource.split(customerCreateRouteDeclaration)).toHaveLength(2);
    expect(typeof orderCreationController.createCustomerOrder).toBe("function");

    expect(controllerSource).toMatch(/require\(["']\.\.\/models\/user["']\)/);
    expect(controllerSource).toMatch(/\bprepareOrderItemsForCreation\b/);
    expect(controllerSource).toMatch(/\bcreateReservationAdjustments\b/);
    expect(controllerSource).toMatch(/\bapplyStockAdjustments\b/);
    expect(controllerSource).toMatch(/\brollbackOrThrow\b/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/mailer["']\)/);

    expect(customerCreateRouteIndex).toBeGreaterThan(-1);
    expect(nextRouteIndex).toBeGreaterThan(customerCreateRouteIndex);
    const customerCreateRouteSource = orderRouteSource.slice(customerCreateRouteIndex, nextRouteIndex);
    expect(customerCreateRouteSource).not.toMatch(/async\s*\(\s*req\s*,\s*res\s*\)/);
    expect(customerCreateRouteSource).not.toMatch(/\bUser\.findById\b/);
    expect(customerCreateRouteSource).not.toMatch(/\bprepareOrderItemsForCreation\b/);
    expect(customerCreateRouteSource).not.toMatch(/\bapplyStockAdjustments\b/);
    expect(customerCreateRouteSource).not.toMatch(/findOneAndUpdate/);
    expect(customerCreateRouteSource).not.toMatch(/new\s+Order\s*\(/);
    expect(customerCreateRouteSource).not.toMatch(/\bemit\s*\(/);
    expect(customerCreateRouteSource).not.toMatch(/\bcatch\b/);
    expect(orderRouteSource).not.toMatch(/require\(["']\.\.\/services\/productAccess["']\)/);
    expect(orderRouteSource).not.toMatch(/async\s+function\s+createCustomerOrder\b/);
  });

  it("keeps Order customer metadata update outside the route facade", () => {
    const orderRouteSource = readBackendFile("components/order.js");
    const controllerSource = readBackendFile("controllers/orderMetadata.js");
    const routeDeclaration = 'router.put("/:id/customer", [authenticateAdmin, checkPermission(\'order.edit\')], updateOrderCustomer);';
    const routeIndex = orderRouteSource.indexOf('router.put("/:id/customer"');
    const nextRouteIndex = orderRouteSource.indexOf('router.put("/:id/images"');

    expect(orderRouteSource).toMatch(/require\(["']\.\.\/controllers\/orderMetadata["']\)/);
    expect(orderRouteSource).toContain(routeDeclaration);
    expect(orderRouteSource.split(routeDeclaration)).toHaveLength(2);
    expect(typeof orderMetadataController.updateOrderCustomer).toBe("function");
    expect(controllerSource).toMatch(/require\(["']\.\.\/models\/order["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/orderPolicy["']\)/);
    expect(controllerSource).not.toMatch(/require\(["']\.\.\/components\/order["']\)/);

    expect(routeIndex).toBeGreaterThan(-1);
    expect(nextRouteIndex).toBeGreaterThan(routeIndex);
    const routeSource = orderRouteSource.slice(routeIndex, nextRouteIndex);
    expect(routeSource).not.toMatch(/async\s*\(\s*req\s*,\s*res\s*\)/);
    expect(routeSource).not.toMatch(/Order\.findById/);
    expect(routeSource).not.toMatch(/isLockedOrder/);
    expect(routeSource).not.toMatch(/\.save\s*\(/);
    expect(orderRouteSource).not.toMatch(/async\s+function\s+updateOrderCustomer\b/);
  });

  it("keeps Order images metadata update outside the route facade", () => {
    const orderRouteSource = readBackendFile("components/order.js");
    const controllerSource = readBackendFile("controllers/orderMetadata.js");
    const routeDeclaration = 'router.put("/:id/images", [authenticateAdmin, checkPermission(\'order.edit\')], updateOrderImages);';
    const routeIndex = orderRouteSource.indexOf('router.put("/:id/images"');
    const nextRouteIndex = orderRouteSource.indexOf('router.post(', routeIndex);

    expect(orderRouteSource).toContain(routeDeclaration);
    expect(orderRouteSource.split(routeDeclaration)).toHaveLength(2);
    expect(typeof orderMetadataController.updateOrderImages).toBe("function");
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/orderPresentation["']\)/);
    expect(controllerSource).toMatch(/\bformatAdminOrderWithItems\b/);

    expect(routeIndex).toBeGreaterThan(-1);
    expect(nextRouteIndex).toBeGreaterThan(routeIndex);
    const routeSource = orderRouteSource.slice(routeIndex, nextRouteIndex);
    expect(routeSource).not.toMatch(/async\s*\(\s*req\s*,\s*res\s*\)/);
    expect(routeSource).not.toMatch(/Order\.findById/);
    expect(routeSource).not.toMatch(/isLockedOrder/);
    expect(routeSource).not.toMatch(/formatAdminOrderWithItems/);
    expect(routeSource).not.toMatch(/\.save\s*\(/);
    expect(orderRouteSource).not.toMatch(/async\s+function\s+updateOrderImages\b/);
  });

  it("keeps Order media upload and delete outside the route facade", () => {
    const orderRouteSource = readBackendFile("components/order.js");
    const controllerSource = readBackendFile("controllers/orderMedia.js");
    const serviceSource = readBackendFile("services/orderMedia.js");
    const uploadRoutePattern = /router\.post\(\s*["']\/upload-image["'],\s*\[\s*authenticateAdmin,\s*checkPermission\(["']order\.edit["']\),\s*handleInvoiceUpload\s*\],\s*uploadOrderImage,?\s*\);/;
    const deleteRoute = 'router.delete("/delete-image", [authenticateAdmin, checkPermission(\'order.edit\')], deleteOrderImage);';
    const uploadIndex = orderRouteSource.search(/router\.post\(\s*["']\/upload-image["']/);
    const deleteIndex = orderRouteSource.indexOf(deleteRoute);
    const createIndex = orderRouteSource.indexOf('router.post("/create-order"');

    expect(orderRouteSource).toMatch(/require\(["']\.\.\/controllers\/orderMedia["']\)/);
    expect(orderRouteSource).toMatch(/require\(["']\.\.\/services\/orderMedia["']\)/);
    expect(orderRouteSource).toMatch(uploadRoutePattern);
    expect(orderRouteSource).toContain(deleteRoute);
    expect(orderRouteSource.split(deleteRoute)).toHaveLength(2);
    expect(typeof orderMediaController.uploadOrderImage).toBe("function");
    expect(typeof orderMediaController.deleteOrderImage).toBe("function");
    expect(typeof orderMediaService.handleInvoiceUpload).toBe("function");
    expect(typeof orderMediaService.deleteOrderImageFile).toBe("function");
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/orderMedia["']\)/);
    expect(serviceSource).toMatch(/multer\.diskStorage/);
    expect(serviceSource).toMatch(/fileFilter/);
    expect(serviceSource).not.toMatch(/require\(["']\.\.\/components\//);

    expect(uploadIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(uploadIndex);
    expect(createIndex).toBeGreaterThan(deleteIndex);
    const routeSource = orderRouteSource.slice(uploadIndex, createIndex);
    expect(routeSource).not.toMatch(/async\s*\(\s*req\s*,\s*res\s*\)/);
    expect(routeSource).not.toMatch(/multer\.diskStorage|fileFilter|fs\.promises\.unlink/);
    expect(orderRouteSource).not.toMatch(/const invoiceStorage\s*=/);
    expect(orderRouteSource).not.toMatch(/const handleInvoiceUpload\s*=/);
  });

  it("keeps Order lifecycle orchestration outside the route facade", () => {
    const orderRouteSource = readBackendFile("components/order.js");
    const controllerSource = readBackendFile("controllers/orderLifecycle.js");
    const serviceSource = readBackendFile("services/orderLifecycle.js");
    const updateRoute = "router.put('/update-order/:_id', [authenticateAdmin, checkPermission('order.edit')], updateOrder);";
    const deleteRoute = 'router.delete("/:id", [authenticateUser, requireCustomer], deleteOrder);';
    const cancelRoute = 'router.put("/:id", [authenticateUser, requireCustomer], cancelOrder);';

    expect(orderRouteSource).toContain("require('../controllers/orderLifecycle')");
    expect(orderRouteSource).toContain(updateRoute);
    expect(orderRouteSource).toContain(deleteRoute);
    expect(orderRouteSource).toContain(cancelRoute);
    expect(orderRouteSource.split(updateRoute)).toHaveLength(2);
    expect(orderRouteSource.split(deleteRoute)).toHaveLength(2);
    expect(orderRouteSource.split(cancelRoute)).toHaveLength(2);
    expect(typeof orderLifecycleController.updateOrder).toBe("function");
    expect(typeof orderLifecycleController.deleteOrder).toBe("function");
    expect(typeof orderLifecycleController.cancelOrder).toBe("function");
    expect(typeof orderLifecycleService.prepareOrderStatusTransition).toBe("function");
    expect(typeof orderLifecycleService.prepareOrderReservationRelease).toBe("function");
    expect(controllerSource).toContain("require('../models/order')");
    expect(controllerSource).toContain("require('../models/storagehistory')");
    expect(controllerSource).toContain("require('../services/orderAccess')");
    expect(controllerSource).toContain("require('../services/orderLifecycle')");
    expect(serviceSource).toContain("require('./orderItemWorkflows')");
    expect(serviceSource).not.toContain('../components/');
    expect(orderRouteSource).not.toContain('StorageHistory');
    expect(orderRouteSource).not.toContain('applyStockAdjustments');
    expect(orderRouteSource).not.toContain('rollbackOrThrow');
    expect(orderRouteSource).not.toContain('buildOrderStockAdjustments');
    expect(orderRouteSource).not.toContain('canAccessOrder');
    expect(orderRouteSource).not.toContain('async (req, res)');
  });

  it("keeps Order reorder orchestration outside the route facade", () => {
    const orderRouteSource = readBackendFile("components/order.js");
    const controllerSource = readBackendFile("controllers/orderItemOperations.js");
    const reorderSource = readBackendFile("services/orderReorder.js");
    const policySource = readBackendFile("services/orderPolicy.js");
    const routeErrorsSource = readBackendFile("utils/orderRouteErrors.js");
    const reorderRoutePattern = /router\.put\(["']\/:id\/reorder["'],\s*\[\s*authenticateAdmin,\s*checkPermission\(["']order\.edit["']\)\s*\],\s*reorderOrderItems\s*\);/g;
    const reorderRouteIndex = orderRouteSource.search(/router\.put\(["']\/:id\/reorder["']/);
    const nextRouteIndex = orderRouteSource.search(/router\.put\(["']\/:id\/customer["']/);

    expect(orderRouteSource).toMatch(/require\(["']\.\.\/controllers\/orderItemOperations["']\)/);
    expect(orderRouteSource.match(reorderRoutePattern) || []).toHaveLength(1);
    expect(typeof orderItemOperationsController.reorderOrderItems).toBe("function");

    expect(controllerSource).toMatch(/require\(["']\.\.\/models\/order["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/orderPolicy["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/orderReorder["']\)/);
    expect(controllerSource).toMatch(/const\s*\{[^}]*\bcomputeOrderTotal\b[^}]*\}\s*=\s*require\(["']\.\.\/services\/orderItemWorkflows["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/orderPresentation["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/utils\/orderRouteErrors["']\)/);
    expect(controllerSource).not.toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/inventory["']\)/);

    expect(reorderSource).not.toMatch(/require\(["']\.\.\/models\//);
    expect(reorderSource).not.toMatch(/require\(["']\.\.\/components\//);
    expect(reorderSource).not.toMatch(/\b(req|res)\b/);

    expect(orderRouteSource).not.toMatch(/\btoLineKey\b/);
    expect(orderRouteSource).not.toMatch(/\bcountLines\b/);
    expect(orderRouteSource).not.toMatch(/for\s*\(\s*const\s+item\s+of\s+req\.body\.cartItems\s*\)/);
    expect(reorderRouteIndex).toBeGreaterThan(-1);
    expect(nextRouteIndex).toBeGreaterThan(reorderRouteIndex);
    const reorderRouteSource = orderRouteSource.slice(reorderRouteIndex, nextRouteIndex);
    [
      "Không tìm thấy đơn hàng",
      "Không thể chỉnh sửa đơn đã hoàn thành hoặc đã hủy.",
      "Danh sách sản phẩm không hợp lệ",
      "API sắp xếp chỉ được thay đổi thứ tự, không được đổi sản phẩm hoặc số lượng.",
      "Error reordering order items:",
      "Lỗi khi lưu thứ tự sản phẩm",
    ].forEach((message) => expect(reorderRouteSource).not.toContain(message));

    expect(typeof orderPolicy.isLockedOrder).toBe("function");
    expect(policySource).not.toMatch(/\b(req|res)\b/);
    expect(typeof orderRouteErrors.getRouteErrorStatus).toBe("function");
    expect(typeof orderRouteErrors.getRouteErrorMessage).toBe("function");
    expect(routeErrorsSource).toMatch(/require\(["']\.\.\/services\/inventory["']\)/);
    expect(routeErrorsSource).toMatch(/\bisVersionConflict\b/);
    expect(routeErrorsSource).toMatch(/\b409\b/);
  });

  it("keeps Order add-item orchestration outside the route facade", () => {
    const orderRouteSource = readBackendFile("components/order.js");
    const controllerSource = readBackendFile("controllers/orderItemOperations.js");
    const addRouteDeclaration = 'router.post("/:id/items", [authenticateAdmin, checkPermission(\'order.edit\')], addOrderItem);';
    const addRouteIndex = orderRouteSource.indexOf('router.post("/:id/items"');
    const nextItemRouteIndex = orderRouteSource.indexOf('router.put("/:id/items/:index"');

    expect(orderRouteSource).toMatch(/require\(["']\.\.\/controllers\/orderItemOperations["']\)/);
    expect(orderRouteSource).toContain(addRouteDeclaration);
    expect(orderRouteSource.split(addRouteDeclaration)).toHaveLength(2);
    expect(typeof orderItemOperationsController.addOrderItem).toBe("function");

    expect(controllerSource).toMatch(/require\(["']\.\.\/models\/order["']\)/);
    expect(controllerSource).toMatch(/const\s*\{[^}]*\bvalidateOrderItemInput\b[^}]*\}\s*=\s*require\(["']\.\.\/services\/orderItemWorkflows["']\)/);
    expect(controllerSource).toMatch(/const\s*\{[^}]*\bbuildOrderStockAdjustments\b[^}]*\}\s*=\s*require\(["']\.\.\/services\/orderItemWorkflows["']\)/);
    expect(controllerSource).toMatch(/const\s*\{[^}]*\bcomputeOrderTotal\b[^}]*\}\s*=\s*require\(["']\.\.\/services\/orderItemWorkflows["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/orderPolicy["']\)/);
    expect(controllerSource).toMatch(/\bisLockedOrder\b/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/orderPresentation["']\)/);
    expect(controllerSource).toMatch(/\bformatAdminOrderWithItems\b/);
    expect(controllerSource).toMatch(/const\s*\{[^}]*\bapplyStockAdjustments\b[^}]*\brollbackOrThrow\b[^}]*\}\s*=\s*require\(["']\.\.\/services\/inventory["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/utils\/orderRouteErrors["']\)/);
    expect(controllerSource).toMatch(/\bgetRouteErrorStatus\b/);
    expect(controllerSource).toMatch(/\bgetRouteErrorMessage\b/);
    expect(controllerSource).not.toMatch(/require\(["']\.\.\/models\/product["']\)/);

    expect(addRouteIndex).toBeGreaterThan(-1);
    expect(nextItemRouteIndex).toBeGreaterThan(addRouteIndex);
    const addRouteSource = orderRouteSource.slice(addRouteIndex, nextItemRouteIndex);
    expect(addRouteSource).not.toMatch(/async\s*\(\s*req\s*,\s*res\s*\)/);
    expect(addRouteSource).not.toMatch(/\bvalidateOrderItemInput\b/);
    expect(addRouteSource).not.toMatch(/\bbuildOrderStockAdjustments\b/);
    expect(addRouteSource).not.toMatch(/\bapplyStockAdjustments\b/);
    expect(addRouteSource).not.toMatch(/\brollbackOrThrow\b/);
    expect(orderRouteSource).not.toMatch(/async\s+function\s+addOrderItem\b/);
  });

  it("keeps Order quantity-update orchestration outside the route facade", () => {
    const orderRouteSource = readBackendFile("components/order.js");
    const controllerSource = readBackendFile("controllers/orderItemOperations.js");
    const updateRouteDeclaration = 'router.put("/:id/items/:index", [authenticateAdmin, checkPermission(\'order.edit\')], updateOrderItemQuantity);';
    const updateRouteIndex = orderRouteSource.indexOf('router.put("/:id/items/:index"');
    const nextItemRouteIndex = orderRouteSource.indexOf('router.delete("/:id/items/:index"');

    expect(orderRouteSource).toMatch(/require\(["']\.\.\/controllers\/orderItemOperations["']\)/);
    expect(orderRouteSource).toContain(updateRouteDeclaration);
    expect(orderRouteSource.split(updateRouteDeclaration)).toHaveLength(2);
    expect(typeof orderItemOperationsController.updateOrderItemQuantity).toBe("function");

    expect(controllerSource).toMatch(/require\(["']\.\.\/models\/order["']\)/);
    expect(controllerSource).toMatch(/const\s*\{[^}]*\bbuildOrderStockAdjustments\b[^}]*\}\s*=\s*require\(["']\.\.\/services\/orderItemWorkflows["']\)/);
    expect(controllerSource).toMatch(/const\s*\{[^}]*\bcomputeOrderTotal\b[^}]*\}\s*=\s*require\(["']\.\.\/services\/orderItemWorkflows["']\)/);
    expect(controllerSource).toMatch(/const\s*\{[^}]*\bapplyStockAdjustments\b[^}]*\brollbackOrThrow\b[^}]*\}\s*=\s*require\(["']\.\.\/services\/inventory["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/orderPolicy["']\)/);
    expect(controllerSource).toMatch(/\bisLockedOrder\b/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/orderPresentation["']\)/);
    expect(controllerSource).toMatch(/\bformatAdminOrderWithItems\b/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/utils\/orderRouteErrors["']\)/);
    expect(controllerSource).toMatch(/\bgetRouteErrorStatus\b/);
    expect(controllerSource).toMatch(/\bgetRouteErrorMessage\b/);

    expect(updateRouteIndex).toBeGreaterThan(-1);
    expect(nextItemRouteIndex).toBeGreaterThan(updateRouteIndex);
    const updateRouteSource = orderRouteSource.slice(updateRouteIndex, nextItemRouteIndex);
    expect(updateRouteSource).not.toMatch(/async\s*\(\s*req\s*,\s*res\s*\)/);
    expect(updateRouteSource).not.toMatch(/Number\s*\(\s*req\.body\.quantity\s*\)/);
    expect(updateRouteSource).not.toMatch(/\bNumber\.isInteger\b/);
    expect(updateRouteSource).not.toMatch(/Number\s*\(\s*req\.params\.index\s*\)/);
    expect(updateRouteSource).not.toMatch(/\bdelta\b/);
    expect(updateRouteSource).not.toMatch(/\bbuildOrderStockAdjustments\b/);
    expect(updateRouteSource).not.toMatch(/\bapplyStockAdjustments\b/);
    expect(updateRouteSource).not.toMatch(/\bawait\s+order\.save\s*\(/);
    expect(updateRouteSource).not.toMatch(/\brollbackOrThrow\b/);
    expect(orderRouteSource).not.toMatch(/async\s+function\s+updateOrderItemQuantity\b/);
  });

  it("keeps Order item-delete orchestration outside the route facade", () => {
    const orderRouteSource = readBackendFile("components/order.js");
    const controllerSource = readBackendFile("controllers/orderItemOperations.js");
    const deleteRouteDeclaration = 'router.delete("/:id/items/:index", [authenticateAdmin, checkPermission(\'order.edit\')], deleteOrderItem);';
    const deleteRouteIndex = orderRouteSource.indexOf('router.delete("/:id/items/:index"');
    const nextItemRouteIndex = orderRouteSource.indexOf('router.put("/:id/reorder"');

    expect(orderRouteSource).toMatch(/require\(["']\.\.\/controllers\/orderItemOperations["']\)/);
    expect(orderRouteSource).toContain(deleteRouteDeclaration);
    expect(orderRouteSource.split(deleteRouteDeclaration)).toHaveLength(2);
    expect(typeof orderItemOperationsController.deleteOrderItem).toBe("function");

    expect(controllerSource).toMatch(/require\(["']\.\.\/models\/order["']\)/);
    expect(controllerSource).toMatch(/const\s*\{[^}]*\bbuildOrderStockAdjustments\b[^}]*\}\s*=\s*require\(["']\.\.\/services\/orderItemWorkflows["']\)/);
    expect(controllerSource).toMatch(/const\s*\{[^}]*\bcomputeOrderTotal\b[^}]*\}\s*=\s*require\(["']\.\.\/services\/orderItemWorkflows["']\)/);
    expect(controllerSource).toMatch(/const\s*\{[^}]*\bapplyStockAdjustments\b[^}]*\brollbackOrThrow\b[^}]*\}\s*=\s*require\(["']\.\.\/services\/inventory["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/orderPolicy["']\)/);
    expect(controllerSource).toMatch(/\bisLockedOrder\b/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/orderPresentation["']\)/);
    expect(controllerSource).toMatch(/\bformatAdminOrderWithItems\b/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/utils\/orderRouteErrors["']\)/);
    expect(controllerSource).toMatch(/\bgetRouteErrorStatus\b/);
    expect(controllerSource).toMatch(/\bgetRouteErrorMessage\b/);

    expect(deleteRouteIndex).toBeGreaterThan(-1);
    expect(nextItemRouteIndex).toBeGreaterThan(deleteRouteIndex);
    const deleteRouteSource = orderRouteSource.slice(deleteRouteIndex, nextItemRouteIndex);
    expect(deleteRouteSource).not.toMatch(/async\s*\(\s*req\s*,\s*res\s*\)/);
    expect(deleteRouteSource).not.toMatch(/Order\.findById\s*\(/);
    expect(deleteRouteSource).not.toMatch(/isLockedOrder\s*\(/);
    expect(deleteRouteSource).not.toMatch(/Number\s*\(\s*req\.params\.index\s*\)/);
    expect(deleteRouteSource).not.toMatch(/Number\.isInteger/);
    expect(deleteRouteSource).not.toMatch(/\.cartItems\.splice\s*\(/);
    expect(deleteRouteSource).not.toMatch(/skipMissing/);
    expect(deleteRouteSource).not.toMatch(/buildOrderStockAdjustments/);
    expect(deleteRouteSource).not.toMatch(/applyStockAdjustments/);
    expect(deleteRouteSource).not.toMatch(/await\s+order\.save\s*\(/);
    expect(deleteRouteSource).not.toMatch(/rollbackOrThrow/);
    expect(orderRouteSource).not.toMatch(/async\s+function\s+deleteOrderItem\b/);
  });

  it("keeps production Manage consumers on the model layer", () => {
    const productRouteSource = readBackendFile("components/product.js");
    const productTypeControllerSource = readBackendFile("controllers/productTypeOperations.js");
    const productTypeRenameSource = readBackendFile("services/productTypeRename.js");

    expect(productTypeControllerSource).toMatch(/require\(["']\.\.\/services\/productTypeRename["']\)/);
    expect(productTypeControllerSource).not.toMatch(/require\(["']\.\.\/models\/manage["']\)/);
    expect(productTypeRenameSource).toMatch(/require\(["']\.\.\/models\/manage["']\)/);
    expect(productTypeRenameSource).not.toMatch(/require\(["']\.\.\/components\/manage["']\)/);
    expect(productRouteSource).not.toMatch(/require\(["']\.\.\/models\/manage["']\)/);
    expect(productRouteSource).not.toMatch(/require\(["']\.\/manage["']\)/);
  });

  it("keeps Product pure helpers outside the route facade", () => {
    const productRouteSource = readBackendFile("components/product.js");
    const productListingServiceSource = readBackendFile("services/productListing.js");
    const productListingUtilsSource = readBackendFile("utils/productListing.js");

    expect(productRouteSource).toMatch(/require\(["']\.\.\/utils\/productSearch["']\)/);
    expect(productRouteSource).not.toMatch(/require\(["']\.\.\/services\/productPresentation["']\)/);
    expect(productListingServiceSource).toMatch(/require\(["']\.\/productPresentation["']\)/);
    expect(productListingServiceSource).toMatch(/require\(["']\.\.\/utils\/productListing["']\)/);
    expect(productListingUtilsSource).not.toMatch(/require\(["']express["']\)/);
    expect(productListingUtilsSource).not.toMatch(/require\(["']mongoose["']\)/);
    expect(productListingUtilsSource).not.toMatch(/require\(["']\.\.\/models\//);
    expect(productRouteSource).not.toMatch(/require\(["']\.\.\/utils\/productUpdatePolicy["']\)/);
    expect(productRouteSource).not.toMatch(/function buildTokenQuery\(/);
    expect(productRouteSource).not.toMatch(/async function greedyNarrowTokens\(/);
    expect(productRouteSource).not.toMatch(/const stripPrivateVariantFields\s*=/);
    expect(productRouteSource).not.toMatch(/const PRODUCT_UPDATE_ALLOWED_FIELDS\s*=/);

    expect(typeof productPresentation.stripPrivateVariantFields).toBe("function");
    expect(typeof productPresentation.calculateProductAdjustedStatus).toBe("function");
    expect(typeof productListingUtils.parseProductListingQuery).toBe("function");
    expect(typeof productListingUtils.buildProductListingFilter).toBe("function");
    expect(typeof productListingUtils.buildProductListingSortCriteria).toBe("function");
    expect(typeof productListingUtils.rankProductsBySearch).toBe("function");
    expect(typeof productUpdatePolicy.pickAllowedProductUpdateFields).toBe("function");
    expect(typeof productUpdatePolicy.pickVariantMetadata).toBe("function");
  });

  it("keeps Product payload validation outside infrastructure layers", () => {
    const productRouteSource = readBackendFile("components/product.js");
    const productCreationControllerSource = readBackendFile("controllers/productCreation.js");
    const productCreationServiceSource = readBackendFile("services/productCreation.js");
    const productCodeLookupSource = readBackendFile("services/productCodeLookup.js");
    const productPayloadErrorSource = readBackendFile("utils/productPayloadErrors.js");
    const productPayloadSource = readBackendFile("validators/productPayload.js");
    const variantValidatorNames = ["validateCreateVariantPayload", "validateUpdateVariantPayload"];

    expect(productRouteSource).not.toMatch(/require\(["']\.\.\/validators\/productPayload["']\)/);
    expect(productRouteSource).toMatch(/require\(["']\.\.\/controllers\/productCreation["']\)/);
    expect(productRouteSource).toContain("router.post('/create', [authenticateAdmin, checkPermission('product.create')], createProductHandler);");
    expect(typeof productCreationController.createProductHandler).toBe("function");
    expect(typeof productCreationService.createProduct).toBe("function");
    expect(typeof productPayload.validateCreateProductPayload).toBe("function");
    expect(typeof productPayload.validateUpdateProductPayload).toBe("function");
    expect(productCreationControllerSource).toContain("validateCreateProductPayload(req.body)");
    expect(productCreationControllerSource).toMatch(/require\(["']\.\.\/services\/productCreation["']\)/);
    expect(productCreationControllerSource).not.toMatch(/require\(["']\.\.\/models\//);
    expect(productCreationServiceSource).toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(productCreationServiceSource).toMatch(/require\(["']\.\.\/models\/activitylog["']\)/);
    expect(productCreationServiceSource).toMatch(/require\(["']\.\/productCodeLookup["']\)/);
    expect(productCreationServiceSource).not.toMatch(/require\(["']\.\.\/components\//);
    expect(productCodeLookupSource).toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(productPayloadErrorSource).toMatch(/require\(["']\.\.\/validators\/productPayload["']\)/);
    variantValidatorNames.forEach((validatorName) => {
      expect(typeof productPayload[validatorName]).toBe("function");
    });

    expect(productPayloadSource).not.toMatch(/require\(["']express["']\)/);
    expect(productPayloadSource).not.toMatch(/require\(["']mongoose["']\)/);
    expect(productPayloadSource).not.toMatch(/require\(["']\.\.\/models\/product["']\)/);
  });

  it("keeps the Product update workflow outside the route facade", () => {
    const productRouteSource = readBackendFile("components/product.js");
    const productUpdateControllerSource = readBackendFile("controllers/productUpdate.js");
    const productUpdateServiceSource = readBackendFile("services/productUpdate.js");

    expect(productRouteSource).toMatch(/require\(["']\.\.\/controllers\/productUpdate["']\)/);
    expect(productRouteSource).toContain("router.put('/:_id', [authenticateAdmin, checkPermission('product.edit')], updateProductHandler);");
    expect(typeof productUpdateController.updateProductHandler).toBe("function");
    expect(typeof productUpdateService.updateProduct).toBe("function");

    const validationIndex = productUpdateControllerSource.indexOf("validateUpdateProductPayload(req.body)");
    const serviceCallIndex = productUpdateControllerSource.indexOf("updateProduct({");
    expect(validationIndex).toBeGreaterThan(-1);
    expect(serviceCallIndex).toBeGreaterThan(validationIndex);
    expect(productUpdateControllerSource).toMatch(/require\(["']\.\.\/services\/productUpdate["']\)/);
    expect(productUpdateControllerSource).not.toMatch(/require\(["']\.\.\/models\//);

    expect(productUpdateServiceSource).toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(productUpdateServiceSource).toMatch(/require\(["']\.\.\/models\/activitylog["']\)/);
    expect(productUpdateServiceSource).toMatch(/require\(["']\.\/productCodeLookup["']\)/);
    expect(productUpdateServiceSource).not.toMatch(/require\(["']\.\.\/components\//);
    expect(productUpdateServiceSource).not.toMatch(/\b(req|res)\./);

    expect(productRouteSource).not.toMatch(/async function updateExistingVariantMetadata/);
    expect(productRouteSource).not.toMatch(/Product\.findByIdAndUpdate\(\s*req\.params\._id/);
    expect(productRouteSource).not.toContain("validateUpdateProductPayload(req.body)");
  });

  it("keeps structural Product variant operations outside the route facade with stable precedence", () => {
    const productRouteSource = readBackendFile("components/product.js");
    const controllerSource = readBackendFile("controllers/productVariantOperations.js");
    const serviceSource = readBackendFile("services/productVariantOperations.js");
    const routeDeclarations = [
      "router.post('/:id/variant', [authenticateAdmin, checkPermission('product.edit')], addProductVariant);",
      "router.put('/:id/:variantIndex', [authenticateAdmin, checkPermission('product.edit')], updateProductVariant);",
      "router.delete('/:id/:variantIndex', [authenticateAdmin, checkPermission('product.edit')], deleteProductVariant);",
    ];

    expect(productRouteSource).toMatch(/require\(["']\.\.\/controllers\/productVariantOperations["']\)/);
    routeDeclarations.forEach((routeDeclaration) => {
      expect(productRouteSource).toContain(routeDeclaration);
    });
    expect(typeof productVariantOperationController.addProductVariant).toBe("function");
    expect(typeof productVariantOperationController.updateProductVariant).toBe("function");
    expect(typeof productVariantOperationController.deleteProductVariant).toBe("function");
    expect(typeof productVariantOperationService.addVariant).toBe("function");
    expect(typeof productVariantOperationService.updateVariant).toBe("function");
    expect(typeof productVariantOperationService.deleteVariant).toBe("function");

    const createValidationIndex = controllerSource.indexOf("validateCreateVariantPayload(req.body)");
    const addServiceCallIndex = controllerSource.indexOf("addVariant({");
    const updateValidationIndex = controllerSource.indexOf("validateUpdateVariantPayload(req.body)");
    const updateServiceCallIndex = controllerSource.indexOf("updateVariant({");
    expect(createValidationIndex).toBeGreaterThan(-1);
    expect(addServiceCallIndex).toBeGreaterThan(createValidationIndex);
    expect(updateValidationIndex).toBeGreaterThan(-1);
    expect(updateServiceCallIndex).toBeGreaterThan(updateValidationIndex);

    const addRouteIndex = productRouteSource.indexOf(routeDeclarations[0]);
    const stockRouteIndex = productRouteSource.indexOf('router.post("/:id/:variantIndex"');
    const updateRouteIndex = productRouteSource.indexOf(routeDeclarations[1]);
    const earnRouteIndex = productRouteSource.indexOf("router.put('/:id/:variantIndex/update-earn'");
    const productTypeDeleteIndex = productRouteSource.indexOf("router.delete('/types/:id'");
    const deleteRouteIndex = productRouteSource.indexOf(routeDeclarations[2]);
    expect(addRouteIndex).toBeGreaterThan(-1);
    expect(stockRouteIndex).toBeGreaterThan(addRouteIndex);
    expect(updateRouteIndex).toBeGreaterThan(-1);
    expect(earnRouteIndex).toBeGreaterThan(updateRouteIndex);
    expect(productTypeDeleteIndex).toBeGreaterThan(-1);
    expect(deleteRouteIndex).toBeGreaterThan(productTypeDeleteIndex);

    expect(controllerSource).toMatch(/require\(["']\.\.\/validators\/productPayload["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/productVariantOperations["']\)/);
    expect(controllerSource).not.toMatch(/require\(["']\.\.\/models\//);
    expect(serviceSource).toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(serviceSource).toMatch(/require\(["']\.\.\/models\/activitylog["']\)/);
    expect(serviceSource).toMatch(/require\(["']\.\.\/utils\/productUpdatePolicy["']\)/);
    expect(serviceSource).not.toMatch(/require\(["']\.\.\/components\//);
    expect(serviceSource).not.toMatch(/\b(req|res)\./);

    expect(productRouteSource).not.toContain("validateCreateVariantPayload(req.body)");
    expect(productRouteSource).not.toContain("validateUpdateVariantPayload(req.body)");
    expect(productRouteSource).not.toContain("action: 'add_variant'");
    expect(productRouteSource).not.toContain("action: 'update_variant'");
    expect(productRouteSource).not.toContain("action: 'delete_variant'");
  });

  it("validates Product variant actions before database access", () => {
    const productRouteSource = readBackendFile("components/product.js");
    const stockControllerSource = readBackendFile("controllers/productStockAdjustment.js");
    const stockServiceSource = readBackendFile("services/productStockAdjustment.js");
    const pricingControllerSource = readBackendFile("controllers/productVariantPricingActions.js");
    const pricingServiceSource = readBackendFile("services/productVariantPricing.js");
    const productVariantActionsSource = readBackendFile("validators/productVariantActions.js");

    expect(productRouteSource).not.toMatch(/require\(["']\.\.\/validators\/productVariantActions["']\)/);
    expect(productRouteSource).toMatch(/require\(["']\.\.\/controllers\/productStockAdjustment["']\)/);
    expect(productRouteSource).toMatch(/require\(["']\.\.\/controllers\/productVariantPricingActions["']\)/);
    const stockRouteDeclaration = 'router.post("/:id/:variantIndex", [authenticateAdmin, checkPermission(\'product.edit\')], adjustProductStock);';
    expect(productRouteSource).toContain(stockRouteDeclaration);
    expect(productRouteSource.split(stockRouteDeclaration)).toHaveLength(2);
    expect(productRouteSource).toContain("router.put('/:id/:variantIndex/update-earn'");
    expect(productRouteSource).toContain("router.put('/:id/:variantIndex/update-import-price'");
    expect(typeof productStockAdjustmentController.adjustProductStock).toBe("function");
    expect(typeof productStockAdjustmentService.adjustManualProductStock).toBe("function");
    expect(typeof productVariantPricingController.updateProductEarn).toBe("function");
    expect(typeof productVariantPricingController.updateProductImportPrice).toBe("function");
    expect(typeof productVariantPricingService.updateVariantEarn).toBe("function");
    expect(typeof productVariantPricingService.updateVariantImportPrice).toBe("function");
    expect(typeof productVariantActions.validateStockAdjustmentPayload).toBe("function");

    const stockValidationIndex = stockControllerSource.indexOf("validateStockAdjustmentPayload(req.body)");
    const stockServiceCallIndex = stockControllerSource.indexOf("adjustManualProductStock({");
    const stockDatabaseIndex = stockServiceSource.indexOf("Product.findById(productId)");
    const earnValidationIndex = pricingControllerSource.indexOf("validateEarnUpdatePayload(req.body)");
    const earnDatabaseIndex = pricingServiceSource.indexOf("Product.findById(productId)");
    const earnServiceCallIndex = pricingControllerSource.indexOf("updateVariantEarn({");
    const importPriceValidationIndex = pricingControllerSource.indexOf("validateImportPriceUpdatePayload(req.body)");
    const importPriceDatabaseIndex = pricingServiceSource.indexOf("Product.findById(productId)");
    const importPriceServiceCallIndex = pricingControllerSource.indexOf("updateVariantImportPrice({");
    const earnRouteIndex = productRouteSource.indexOf("router.put('/:id/:variantIndex/update-earn'");
    const genericVariantUpdateIndex = productRouteSource.indexOf("router.put('/:id/:variantIndex'");

    expect(stockValidationIndex).toBeGreaterThan(-1);
    expect(stockServiceCallIndex).toBeGreaterThan(stockValidationIndex);
    expect(stockDatabaseIndex).toBeGreaterThan(-1);
    expect(earnValidationIndex).toBeGreaterThan(-1);
    expect(earnServiceCallIndex).toBeGreaterThan(earnValidationIndex);
    expect(earnDatabaseIndex).toBeGreaterThan(-1);
    expect(importPriceValidationIndex).toBeGreaterThan(-1);
    expect(importPriceServiceCallIndex).toBeGreaterThan(importPriceValidationIndex);
    expect(importPriceDatabaseIndex).toBeGreaterThan(-1);
    expect(earnRouteIndex).toBeGreaterThan(-1);
    expect(genericVariantUpdateIndex).toBeGreaterThan(-1);
    expect(genericVariantUpdateIndex).toBeLessThan(earnRouteIndex);

    expect(productVariantActionsSource).not.toMatch(/require\(["']express["']\)/);
    expect(productVariantActionsSource).not.toMatch(/require\(["']mongoose["']\)/);
    expect(productVariantActionsSource).not.toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(stockControllerSource).not.toMatch(/require\(["']\.\.\/models\//);
    expect(stockControllerSource).toMatch(/require\(["']\.\.\/services\/productStockAdjustment["']\)/);
    expect(stockServiceSource).toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(stockServiceSource).toMatch(/require\(["']\.\.\/models\/storagehistory["']\)/);
    expect(stockServiceSource).toMatch(/require\(["']\.\/inventory["']\)/);
    expect(stockServiceSource).not.toMatch(/require\(["']\.\.\/components\//);
    expect(stockServiceSource).not.toMatch(/\b(req|res)\./);
    expect(pricingControllerSource).not.toMatch(/require\(["']\.\.\/models\//);
    expect(pricingControllerSource).toMatch(/require\(["']\.\.\/services\/productVariantPricing["']\)/);
    expect(pricingServiceSource).toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(pricingServiceSource).toMatch(/require\(["']\.\.\/models\/activitylog["']\)/);
    expect(pricingServiceSource).not.toMatch(/require\(["']\.\.\/components\//);
    expect(pricingServiceSource).not.toMatch(/\b(req|res)\./);

    expect(productRouteSource).not.toContain("validateStockAdjustmentPayload(req.body)");
    expect(productRouteSource).not.toMatch(/require\(["']\.\.\/models\/storagehistory["']\)/);
    expect(productRouteSource).not.toContain("applyStockAdjustments");
    expect(productRouteSource).not.toContain("new StorageHistory");
    expect(productRouteSource).not.toContain("rollbackOrThrow(appliedAdjustments");
  });

  it("keeps Product review HTTP and validation logic outside the route facade", () => {
    const productRouteSource = readBackendFile("components/product.js");
    const reviewControllerSource = readBackendFile("controllers/productReviews.js");
    const reviewValidatorSource = readBackendFile("validators/productReviews.js");
    const handlerNames = [
      "getProductReviews",
      "createProductReview",
      "updateProductReview",
      "deleteProductReview",
    ];

    expect(productRouteSource).toMatch(/require\(["']\.\.\/controllers\/productReviews["']\)/);
    handlerNames.forEach((handlerName) => {
      expect(typeof productReviewController[handlerName]).toBe("function");
      expect(productRouteSource).toContain(handlerName);
    });
    expect(productRouteSource).not.toMatch(/product\.reviews\.push\(/);
    expect(productRouteSource).not.toMatch(/product\.reviews\.pull\(/);
    expect(productRouteSource).not.toMatch(/const isModerator = req\.user\.role/);

    expect(reviewControllerSource).toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(reviewControllerSource).toMatch(/require\(["']\.\.\/validators\/productReviews["']\)/);
    expect(reviewControllerSource).not.toMatch(/require\(["']\.\.\/components\/product["']\)/);

    expect(typeof productReviewValidator.validateCreateReviewPayload).toBe("function");
    expect(typeof productReviewValidator.validateUpdateReviewPayload).toBe("function");
    const createValidationIndex = reviewControllerSource.indexOf("validateCreateReviewPayload(req.body)");
    const createDatabaseIndex = reviewControllerSource.indexOf("Product.findById", createValidationIndex);
    const updateValidationIndex = reviewControllerSource.indexOf("validateUpdateReviewPayload(req.body)");
    const updateDatabaseIndex = reviewControllerSource.indexOf("Product.findById", updateValidationIndex);
    expect(createDatabaseIndex).toBeGreaterThan(createValidationIndex);
    expect(updateDatabaseIndex).toBeGreaterThan(updateValidationIndex);

    expect(reviewValidatorSource).not.toMatch(/require\(["']express["']\)/);
    expect(reviewValidatorSource).not.toMatch(/require\(["']mongoose["']\)/);
    expect(reviewValidatorSource).not.toMatch(/require\(["']\.\.\/models\/product["']\)/);
  });

  it("keeps Product batch operations outside the route facade", () => {
    const productRouteSource = readBackendFile("components/product.js");
    const batchControllerSource = readBackendFile("controllers/productBatchOperations.js");
    const batchValidatorSource = readBackendFile("validators/productBatchOperations.js");
    const productAccessSource = readBackendFile("services/productAccess.js");
    const handlerNames = [
      "fetchProductsByIds",
      "fetchProductsByCodes",
      "bulkDeleteProducts",
    ];

    expect(productRouteSource).toMatch(/require\(["']\.\.\/controllers\/productBatchOperations["']\)/);
    handlerNames.forEach((handlerName) => {
      expect(typeof productBatchController[handlerName]).toBe("function");
      expect(productRouteSource).toContain(handlerName);
    });
    expect(productRouteSource).not.toMatch(/const validIds = ids/);
    expect(productRouteSource).not.toMatch(/const productsToDelete = await Product\.find/);
    expect(productRouteSource).not.toMatch(/const result = products\.map/);

    expect(batchControllerSource).toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(batchControllerSource).toMatch(/require\(["']\.\.\/models\/activitylog["']\)/);
    expect(batchControllerSource).toMatch(/require\(["']\.\.\/services\/productAccess["']\)/);
    expect(batchControllerSource).toMatch(/require\(["']\.\.\/validators\/productBatchOperations["']\)/);
    expect(batchControllerSource).not.toMatch(/require\(["']\.\.\/components\/product["']\)/);

    expect(typeof productBatchValidator.validateFetchByIdsPayload).toBe("function");
    expect(typeof productBatchValidator.validateByCodesPayload).toBe("function");
    expect(typeof productBatchValidator.validateBulkDeletePayload).toBe("function");
    expect(batchValidatorSource).not.toMatch(/require\(["']express["']\)/);
    expect(batchValidatorSource).not.toMatch(/require\(["']mongoose["']\)/);
    expect(batchValidatorSource).not.toMatch(/require\(["']\.\.\/models\//);

    expect(typeof productAccess.loadProductViewer).toBe("function");
    expect(productAccessSource).toMatch(/require\(["']\.\.\/models\/user["']\)/);
    expect(productRouteSource).not.toMatch(/require\(["']\.\.\/models\/user["']\)/);
    expect(productRouteSource).not.toMatch(/const loadProductViewer\s*=/);
  });

  it("keeps Product admin actions outside the route facade", () => {
    const productRouteSource = readBackendFile("components/product.js");
    const controllerSource = readBackendFile("controllers/productAdminActions.js");
    const validatorSource = readBackendFile("validators/productAdminActions.js");
    const handlerNames = [
      "backfillProductDisplay",
      "adjustProductPurchaseCount",
      "deleteProduct",
      "toggleProductDisplay",
    ];

    expect(productRouteSource).toMatch(/require\(["']\.\.\/controllers\/productAdminActions["']\)/);
    handlerNames.forEach((handlerName) => {
      expect(typeof productAdminActionController[handlerName]).toBe("function");
    });
    expect(productRouteSource).toContain("router.put('/update-display-field', [authenticateAdmin, checkPermission('product.edit')], backfillProductDisplay);");
    expect(productRouteSource).toContain("router.put(\"/purchase/:_id\", [authenticateAdmin, checkPermission('product.edit')], adjustProductPurchaseCount);");
    expect(productRouteSource).toContain("router.delete('/:_id', [authenticateAdmin, checkPermission('product.delete')], deleteProduct);");
    expect(productRouteSource).toContain("router.put('/:_id/toggle-display', [authenticateAdmin, checkPermission('product.edit')], toggleProductDisplay);");
    expect(productRouteSource).not.toMatch(/Product\.updateMany\(\s*\{ display:/);
    expect(productRouteSource).not.toMatch(/Product\.findOneAndUpdate\(\s*filter,\s*\{ \$inc: \{ purchaseCount:/);
    expect(productRouteSource).not.toMatch(/Product\.findByIdAndDelete\(req\.params\._id\)/);
    expect(productRouteSource).not.toMatch(/const oldDisplay = product\.display/);

    expect(controllerSource).toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/models\/activitylog["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/validators\/productAdminActions["']\)/);
    expect(controllerSource).not.toMatch(/require\(["']\.\.\/components\/product["']\)/);
    const validationIndex = controllerSource.indexOf("validatePurchaseAdjustment(req.params._id, req.body)");
    const databaseIndex = controllerSource.indexOf("Product.findOneAndUpdate", validationIndex);
    expect(validationIndex).toBeGreaterThan(-1);
    expect(databaseIndex).toBeGreaterThan(validationIndex);

    expect(typeof productAdminActionValidator.validatePurchaseAdjustment).toBe("function");
    expect(validatorSource).not.toMatch(/require\(["']express["']\)/);
    expect(validatorSource).not.toMatch(/require\(["']mongoose["']\)/);
    expect(validatorSource).not.toMatch(/require\(["']\.\.\/models\//);
  });

  it("keeps Product listing outside the route facade with stable precedence", () => {
    const productRouteSource = readBackendFile("components/product.js");
    const controllerSource = readBackendFile("controllers/productListing.js");
    const serviceSource = readBackendFile("services/productListing.js");
    const routeDeclaration = 'router.get("/", authenticateOptionalProductViewer, getProducts);';

    expect(productRouteSource).toMatch(/require\(["']\.\.\/controllers\/productListing["']\)/);
    expect(productRouteSource).toContain(routeDeclaration);
    expect(productRouteSource.split(routeDeclaration)).toHaveLength(2);
    expect(typeof productListingController.getProducts).toBe("function");
    expect(typeof productListingService.listProducts).toBe("function");

    const productTypeDeleteIndex = productRouteSource.indexOf("router.delete('/types/:id'");
    const listingIndex = productRouteSource.indexOf(routeDeclaration);
    const topPurchasedIndex = productRouteSource.indexOf("router.get('/top-purchased'");
    expect(productTypeDeleteIndex).toBeGreaterThan(-1);
    expect(listingIndex).toBeGreaterThan(productTypeDeleteIndex);
    expect(topPurchasedIndex).toBeGreaterThan(listingIndex);

    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/productListing["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/productAccess["']\)/);
    expect(controllerSource).not.toMatch(/require\(["']\.\.\/models\//);
    expect(serviceSource).toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(serviceSource).toMatch(/require\(["']\.\/productAccess["']\)/);
    expect(serviceSource).toMatch(/require\(["']\.\/productPresentation["']\)/);
    expect(serviceSource).not.toMatch(/require\(["']\.\.\/components\//);
    expect(serviceSource).not.toMatch(/\b(req|res)\./);

    expect(productRouteSource).not.toContain("const runQuery = async (queryFilter)");
    expect(productRouteSource).not.toContain("Product.countDocuments(queryFilter)");
    expect(productRouteSource).not.toContain("sendProductAccessError");
  });

  it("keeps Product media operations outside the route facade with stable precedence", () => {
    const productRouteSource = readBackendFile("components/product.js");
    const controllerSource = readBackendFile("controllers/productMedia.js");
    const serviceSource = readBackendFile("services/productMedia.js");
    const routeDeclarations = [
      'router.post("/upload/image", [authenticateAdmin, checkAnyPermission([\'product.create\', \'product.edit\']), handleProductImageUpload], respondProductImageUpload);',
      'router.post("/upload/document", [authenticateAdmin, checkAnyPermission([\'product.create\', \'product.edit\']), handleProductDocumentUpload], respondProductDocumentUpload);',
      "router.delete('/:id/:variantIndex/image', [authenticateAdmin, checkPermission('product.edit')], deleteProductVariantImage);",
      "router.delete('/clean-temp-image', [authenticateAdmin, checkPermission('product.edit')], cleanProductTemporaryImage);",
    ];

    expect(productRouteSource).toMatch(/require\(["']\.\.\/controllers\/productMedia["']\)/);
    routeDeclarations.forEach((routeDeclaration) => {
      expect(productRouteSource).toContain(routeDeclaration);
      expect(productRouteSource.split(routeDeclaration)).toHaveLength(2);
    });
    expect(typeof productMediaController.respondProductImageUpload).toBe("function");
    expect(typeof productMediaController.respondProductDocumentUpload).toBe("function");
    expect(typeof productMediaController.deleteProductVariantImage).toBe("function");
    expect(typeof productMediaController.cleanProductTemporaryImage).toBe("function");
    expect(typeof productMediaService.deleteVariantImage).toBe("function");
    expect(typeof productMediaService.cleanTemporaryInvoiceImage).toBe("function");

    const imageUploadIndex = productRouteSource.indexOf(routeDeclarations[0]);
    const documentUploadIndex = productRouteSource.indexOf(routeDeclarations[1]);
    const variantImageDeleteIndex = productRouteSource.indexOf(routeDeclarations[2]);
    const cleanTemporaryImageIndex = productRouteSource.indexOf(routeDeclarations[3]);
    const createProductIndex = productRouteSource.indexOf("router.post('/create'");
    const genericStockIndex = productRouteSource.indexOf('router.post("/:id/:variantIndex"');
    const bulkDeleteIndex = productRouteSource.indexOf("router.post('/bulk-delete'");
    const genericProductDeleteIndex = productRouteSource.indexOf("router.delete('/:_id'");
    expect(imageUploadIndex).toBeGreaterThan(-1);
    expect(documentUploadIndex).toBeGreaterThan(imageUploadIndex);
    expect(variantImageDeleteIndex).toBeGreaterThan(documentUploadIndex);
    expect(variantImageDeleteIndex).toBeLessThan(createProductIndex);
    expect(imageUploadIndex).toBeLessThan(genericStockIndex);
    expect(documentUploadIndex).toBeLessThan(genericStockIndex);
    expect(cleanTemporaryImageIndex).toBeGreaterThan(-1);
    expect(cleanTemporaryImageIndex).toBeLessThan(bulkDeleteIndex);
    expect(cleanTemporaryImageIndex).toBeLessThan(genericProductDeleteIndex);

    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/productMedia["']\)/);
    expect(controllerSource).not.toMatch(/require\(["']\.\.\/models\//);
    expect(controllerSource).not.toMatch(/require\(["'](?:fs|path)["']\)/);
    expect(serviceSource).toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(serviceSource).toMatch(/require\(["']\.\.\/models\/order["']\)/);
    expect(serviceSource).toMatch(/require\(["']\.\.\/models\/iporder["']\)/);
    expect(serviceSource).toMatch(/require\(["']\.\.\/models\/eporder["']\)/);
    expect(serviceSource).toMatch(/require\(["']\.\.\/config\/imageUpload["']\)/);
    expect(serviceSource).toMatch(/require\(["']fs["']\)/);
    expect(serviceSource).toMatch(/require\(["']path["']\)/);
    expect(serviceSource).not.toMatch(/require\(["']\.\.\/components\//);
    expect(serviceSource).not.toMatch(/\b(req|res)\./);
    expect(serviceSource).toContain('path.resolve(rootPath, filename)');
    expect(serviceSource).toContain('resolveContainedFilePath(PRODUCT_IMAGE_ROOT, filename');
    expect(serviceSource).toContain("parsedUrl.protocol !== 'http:'");
    expect(serviceSource).toContain('PRODUCT_IMAGE_FILENAME_PATTERN');
    expect(serviceSource).toContain("'.jfif'");
    expect(serviceSource).toContain('Product.collection.findOne');
    expect(serviceSource).toContain('TEMPORARY_INVOICE_FILENAME_PATTERN');
    expect(serviceSource).toContain("error.code === 'ENOENT'");
    expect(serviceSource).not.toContain("imgUrl.split('/images/')");

    const resolveVariantImageIndex = serviceSource.indexOf(
      'const { filePath, filename } = resolveProductImagePath(imgUrl);',
    );
    const productReferenceGuardIndex = serviceSource.indexOf(
      'if (await isProductImageReferencedElsewhere({',
    );
    const unlinkVariantImageIndex = serviceSource.indexOf(
      "await unlinkRegularFile(filePath, 'Invalid image path');",
    );
    expect(resolveVariantImageIndex).toBeGreaterThan(-1);
    expect(productReferenceGuardIndex).toBeGreaterThan(resolveVariantImageIndex);
    expect(unlinkVariantImageIndex).toBeGreaterThan(productReferenceGuardIndex);

    expect(productRouteSource).not.toContain("const imgUrl = product.variant[index].imgUrl");
    expect(productRouteSource).not.toContain("path.basename(imageUrl)");
    expect(productRouteSource).not.toContain("Error deleting file:");
  });

  it("keeps Product read operations outside the route facade with stable precedence", () => {
    const productRouteSource = readBackendFile("components/product.js");
    const controllerSource = readBackendFile("controllers/productReadOperations.js");
    const routeDeclarations = [
      "router.get('/top-purchased', authenticateOptionalProductViewer, getTopPurchasedProducts);",
      "router.get('/:_id/admin-detail', [authenticateUser, checkPermission('product.edit')], getAdminProductDetail);",
      "router.get('/:_id', authenticateOptionalProductViewer, getProductDetail);",
    ];

    expect(productRouteSource).toMatch(/require\(["']\.\.\/controllers\/productReadOperations["']\)/);
    expect(typeof productReadController.getTopPurchasedProducts).toBe("function");
    expect(typeof productReadController.getAdminProductDetail).toBe("function");
    expect(typeof productReadController.getProductDetail).toBe("function");
    routeDeclarations.forEach((routeDeclaration) => {
      expect(productRouteSource).toContain(routeDeclaration);
    });

    const topPurchasedIndex = productRouteSource.indexOf(routeDeclarations[0]);
    const adminDetailIndex = productRouteSource.indexOf(routeDeclarations[1]);
    const publicDetailIndex = productRouteSource.indexOf(routeDeclarations[2]);
    const productTypesIndex = productRouteSource.indexOf("router.get('/types'");
    const fetchByIdsIndex = productRouteSource.indexOf("router.post('/fetch-by-ids'");
    expect(topPurchasedIndex).toBeGreaterThan(-1);
    expect(productTypesIndex).toBeGreaterThan(-1);
    expect(productTypesIndex).toBeLessThan(publicDetailIndex);
    expect(topPurchasedIndex).toBeLessThan(adminDetailIndex);
    expect(adminDetailIndex).toBeLessThan(publicDetailIndex);
    expect(publicDetailIndex).toBeLessThan(fetchByIdsIndex);

    expect(controllerSource).toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/productAccess["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/productPresentation["']\)/);
    expect(controllerSource).not.toMatch(/require\(["']\.\.\/components\/product["']\)/);
    expect(controllerSource).toMatch(/\.sort\(\{ purchaseCount: -1 \}\)\s*\.limit\(10\)/);
    expect(controllerSource).toMatch(/Product\.findOne\(combineProductFilters\(/);
  });

  it("keeps Product Type operations outside the facade with stable precedence", () => {
    const productRouteSource = readBackendFile("components/product.js");
    const controllerSource = readBackendFile("controllers/productTypeOperations.js");
    const renameServiceSource = readBackendFile("services/productTypeRename.js");
    const routeDeclarations = [
      "router.get('/types', getProductTypes);",
      "router.post('/types', [authenticateAdmin, checkPermission('product.create')], createProductType);",
      "router.put('/types/:id', [authenticateAdmin, checkPermission('product.edit')], updateProductType);",
      "router.delete('/types/:id', [authenticateAdmin, checkPermission('product.delete')], deleteProductType);",
    ];

    expect(productRouteSource).toMatch(/require\(["']\.\.\/controllers\/productTypeOperations["']\)/);
    expect(typeof productTypeOperationController.getProductTypes).toBe("function");
    expect(typeof productTypeOperationController.createProductType).toBe("function");
    expect(typeof productTypeOperationController.updateProductType).toBe("function");
    expect(typeof productTypeOperationController.deleteProductType).toBe("function");
    expect(typeof productTypeRenameService.applyProductTypeRename).toBe("function");
    routeDeclarations.forEach((routeDeclaration) => {
      expect(productRouteSource).toContain(routeDeclaration);
    });

    const getTypesIndex = productRouteSource.indexOf(routeDeclarations[0]);
    const postTypesIndex = productRouteSource.indexOf(routeDeclarations[1]);
    const putTypesIndex = productRouteSource.indexOf(routeDeclarations[2]);
    const deleteTypesIndex = productRouteSource.indexOf(routeDeclarations[3]);
    const publicDetailIndex = productRouteSource.indexOf("router.get('/:_id', authenticateOptionalProductViewer, getProductDetail);");
    const variantCreateIndex = productRouteSource.indexOf("router.post('/:id/variant'");
    const variantUpdateIndex = productRouteSource.indexOf("router.put('/:id/:variantIndex'");
    const variantDeleteIndex = productRouteSource.indexOf("router.delete('/:id/:variantIndex'");
    expect(getTypesIndex).toBeGreaterThan(-1);
    expect(getTypesIndex).toBeLessThan(publicDetailIndex);
    expect(postTypesIndex).toBeLessThan(variantCreateIndex);
    expect(putTypesIndex).toBeGreaterThan(-1);
    expect(putTypesIndex).toBeLessThan(variantUpdateIndex);
    expect(deleteTypesIndex).toBeLessThan(variantDeleteIndex);

    expect(variantDeleteIndex).toBeGreaterThan(-1);

    expect(controllerSource).toMatch(/require\(["']\.\.\/models\/producttype["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/models\/activitylog["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/services\/productTypeRename["']\)/);
    expect(controllerSource).toMatch(/require\(["']\.\.\/utils\/productType["']\)/);
    expect(controllerSource).not.toMatch(/require\(["']\.\.\/components\//);
    expect(controllerSource).not.toMatch(/Product\.distinct\('_id', \{ type: oldName \}\)/);
    expect(controllerSource).not.toMatch(/const manage = await Manage\.findOne\(\)/);
    expect(renameServiceSource).toMatch(/Product\.distinct\('_id', \{ type: oldName \}\)/);
    expect(renameServiceSource).toMatch(/manage = await Manage\.findOne\(\)/);
    expect(renameServiceSource).toMatch(/await runRollbackStep\(/);
    expect(renameServiceSource).not.toMatch(/require\(["']\.\.\/components\//);
    expect(productRouteSource).not.toMatch(/const currentType = await Type\.findById\(req\.params\.id\)/);
    expect(productRouteSource).not.toMatch(/Product\.distinct\('_id', \{ type: oldName \}\)/);
  });

  it("keeps production ProductType consumers off the route facade", () => {
    const productRouteSource = readBackendFile("components/product.js");
    const productTypeControllerSource = readBackendFile("controllers/productTypeOperations.js");
    const chipRouteSource = readBackendFile("components/chip.js");
    const chipTypeFacadeSource = readBackendFile("components/chiptypes.js");
    const chipTypeControllerSource = readBackendFile("controllers/chipTypeOperations.js");

    expect(productRouteSource).toMatch(/require\(["']\.\.\/controllers\/productTypeOperations["']\)/);
    expect(productRouteSource).not.toMatch(/require\(["']\.\.\/models\/producttype["']\)/);
    expect(productRouteSource).not.toMatch(/require\(["']\.\.\/utils\/productType["']\)/);
    expect(productRouteSource).not.toMatch(/require\(["']\.\/producttype["']\)/);
    expect(productTypeControllerSource).toMatch(/require\(["']\.\.\/models\/producttype["']\)/);
    expect(productTypeControllerSource).toMatch(/require\(["']\.\.\/utils\/productType["']\)/);
    expect(chipRouteSource).not.toMatch(/require\(["']\.\.\/models\/producttype["']\)/);
    expect(chipRouteSource).not.toMatch(/router\.(?:get|post|delete)\(["']\/types/);
    expect(chipTypeFacadeSource).toMatch(/require\(["']\.\.\/controllers\/chipTypeOperations["']\)/);
    expect(chipTypeFacadeSource).toMatch(/require\(["']\.\.\/middlewares\/auth["']\)/);
    expect(chipTypeFacadeSource).not.toMatch(/require\(["']\.\.\/models\//);
    expect(chipTypeControllerSource).toMatch(/require\(["']\.\.\/models\/producttype["']\)/);
    expect(chipTypeControllerSource).toMatch(/require\(["']\.\.\/models\/activitylog["']\)/);
    expect(chipTypeControllerSource).not.toMatch(/require\(["']\.\.\/components\//);
    expect(chipRouteSource).not.toMatch(/require\(["']\.\/producttype["']\)/);
  });

  it("mounts the legacy Type facade after the broader chip router", () => {
    const indexSource = readBackendFile("index.js");
    const chipMountIndex = indexSource.indexOf("app.use('/chips', chipRoutes);");
    const chipTypeMountIndex = indexSource.indexOf("app.use('/chips/types', chipTypeRoutes);");

    expect(chipMountIndex).toBeGreaterThan(-1);
    expect(chipTypeMountIndex).toBeGreaterThan(chipMountIndex);
  });

  it("keeps catalog models and brand normalization off route dependencies", () => {
    const productRouteSource = readBackendFile("components/product.js");
    const scanControllerSource = readBackendFile("controllers/productInvoiceScan.js");
    const chipRouteSource = readBackendFile("components/chip.js");

    expect(productRouteSource).not.toMatch(/require\(["']\.\.\/models\/chip["']\)/);
    expect(scanControllerSource).toMatch(/require\(["']\.\.\/models\/chip["']\)/);
    expect(productRouteSource).toMatch(/require\(["']\.\.\/utils\/brandNormalization["']\)/);
    expect(productRouteSource).not.toMatch(/mongoose\.models\.Brand/);
    expect(chipRouteSource).toMatch(/require\(["']\.\.\/models\/chip["']\)/);
    expect(chipRouteSource).toMatch(/require\(["']\.\.\/utils\/brandNormalization["']\)/);
    expect(chipRouteSource).not.toMatch(/require\(["']\.\/product["']\)/);
  });

  it("keeps invoice Product matching outside the Product route facade", () => {
    const productRouteSource = readBackendFile("components/product.js");
    const scanControllerSource = readBackendFile("controllers/productInvoiceScan.js");
    const matchingSource = readBackendFile("services/productInvoiceMatching.js");
    const scanRouteIndex = productRouteSource.indexOf("router.post('/scan-invoice'");
    const exportIndex = productRouteSource.indexOf("// Export router");

    expect(scanRouteIndex).toBeGreaterThan(-1);
    expect(exportIndex).toBeGreaterThan(scanRouteIndex);
    expect(productRouteSource).toMatch(
      /require\(["']\.\.\/controllers\/productInvoiceScan["']\)/,
    );
    expect(productRouteSource).not.toMatch(
      /require\(["']\.\.\/services\/productInvoiceMatching["']\)/,
    );
    expect(scanControllerSource).toMatch(
      /require\(["']\.\.\/services\/productInvoiceMatching["']\)/,
    );
    expect(scanControllerSource).toContain("matchInvoiceItemsToProducts({");
    expect(productRouteSource).not.toContain("const tokenizeSpec = (text) =>");
    expect(productRouteSource).not.toContain("const buildCanonicalCode =");
    expect(productRouteSource).not.toContain("const matchedItems = items.map");

    expect(typeof productInvoiceScanController.scanProductInvoice).toBe("function");
    expect(typeof productInvoiceMatching.matchInvoiceItemsToProducts).toBe("function");
    expect(typeof productInvoiceMatching.normalizeRepeatedInvoiceCodePrefix).toBe("function");
    expect(typeof productInvoiceMatching.buildCanonicalCode).toBe("function");
    expect(productCodeLookup.normalizeProductCodeForCompare).toBe(
      productCodeNormalization.normalizeProductCodeForCompare,
    );
    expect(matchingSource).toMatch(/require\(["']\.\.\/utils\/brandNormalization["']\)/);
    expect(matchingSource).toMatch(/require\(["']\.\.\/utils\/textNormalization["']\)/);
    expect(matchingSource).toMatch(
      /require\(["']\.\.\/utils\/productCodeNormalization["']\)/,
    );
    expect(matchingSource).not.toMatch(/require\(["']\.\/productCodeLookup["']\)/);
    expect(matchingSource).not.toMatch(/require\(["']\.\.\/models\//);
    expect(matchingSource).not.toMatch(/require\(["']\.\.\/components\//);
    expect(matchingSource).not.toMatch(/\b(req|res)\./);
  });

  it("keeps invoice Gemini orchestration outside the Product route facade", () => {
    const productRouteSource = readBackendFile("components/product.js");
    const scanControllerSource = readBackendFile("controllers/productInvoiceScan.js");
    const geminiSource = readBackendFile("services/productInvoiceGemini.js");
    const promptSource = readBackendFile("services/productInvoicePrompt.js");
    const scanRouteIndex = productRouteSource.indexOf("router.post('/scan-invoice'");
    const exportIndex = productRouteSource.indexOf("// Export router");
    const scanRouteSource = productRouteSource.slice(scanRouteIndex, exportIndex);

    expect(scanControllerSource).toMatch(
      /require\(["']\.\.\/services\/productInvoiceGemini["']\)/,
    );
    expect(scanControllerSource).toMatch(
      /require\(["']\.\.\/services\/productInvoicePrompt["']\)/,
    );
    expect(scanRouteIndex).toBeGreaterThan(-1);
    expect(exportIndex).toBeGreaterThan(scanRouteIndex);
    expect(scanRouteSource).toContain("scanProductInvoice");
    expect(scanControllerSource).toContain("extractInvoiceItemsWithGemini({");
    expect(scanControllerSource).toContain("systemPrompt: INVOICE_SCAN_SYSTEM_PROMPT");
    expect(scanRouteSource).not.toContain("const modelsToTry = [");
    expect(scanRouteSource).not.toContain("const callGeminiWithModel = async");
    expect(scanRouteSource).not.toContain("await fetch(");
    expect(productRouteSource).not.toContain("Bạn là một AI phân tích hình ảnh hóa đơn");
    expect(typeof productInvoiceGemini.extractInvoiceItemsWithGemini).toBe("function");
    expect(typeof productInvoiceGemini.requestInvoiceGeminiResponse).toBe("function");
    expect(typeof productInvoicePrompt.INVOICE_SCAN_SYSTEM_PROMPT).toBe("string");
    expect(promptSource).not.toMatch(/require\(["']\.\.\/models\//);
    expect(promptSource).not.toMatch(/require\(["']\.\.\/components\//);
    expect(geminiSource).not.toMatch(/require\(["']\.\.\/models\//);
    expect(geminiSource).not.toMatch(/require\(["']\.\.\/components\//);
    expect(geminiSource).not.toMatch(/\b(req|res)\./);
  });

  it("keeps invoice upload storage and rollback outside the Product route facade", () => {
    const productRouteSource = readBackendFile("components/product.js");
    const scanControllerSource = readBackendFile("controllers/productInvoiceScan.js");
    const lifecycleSource = readBackendFile("services/invoiceScanFileLifecycle.js");
    const scanRouteIndex = productRouteSource.indexOf("router.post('/scan-invoice'");
    const exportIndex = productRouteSource.indexOf("// Export router");
    const scanRouteSource = productRouteSource.slice(scanRouteIndex, exportIndex);

    expect(productRouteSource).toMatch(
      /require\(["']\.\.\/services\/invoiceScanFileLifecycle["']\)/,
    );
    expect(scanControllerSource).toMatch(
      /require\(["']\.\.\/services\/invoiceScanFileLifecycle["']\)/,
    );
    expect(scanRouteSource).toContain("uploadInvoiceScan");
    expect(scanRouteSource).not.toContain("storeInvoiceScanFile(req.file)");
    expect(scanRouteSource).not.toContain("rollbackInvoiceScanFile(storedInvoiceFile)");
    expect(scanControllerSource).toContain("storeInvoiceScanFile(req.file)");
    expect(scanControllerSource).toContain("rollbackInvoiceScanFile(storedInvoiceFile)");
    expect(scanRouteSource).not.toContain("fs.writeFile");
    expect(scanRouteSource).not.toContain("fs.mkdir");
    expect(productRouteSource).not.toContain("const uploadMemory = multer({");
    expect(productRouteSource).not.toContain("invoice-scan-${uniqueSuffix}.webp");
    expect(typeof invoiceScanFileLifecycle.uploadInvoiceScan).toBe("function");
    expect(typeof invoiceScanFileLifecycle.storeInvoiceScanFile).toBe("function");
    expect(typeof invoiceScanFileLifecycle.rollbackInvoiceScanFile).toBe("function");
    expect(lifecycleSource).toMatch(/multer\.memoryStorage\(\)/);
    expect(lifecycleSource).toMatch(/\.single\(["']invoice["']\)/);
    expect(lifecycleSource).not.toMatch(/require\(["']\.\.\/models\//);
    expect(lifecycleSource).not.toMatch(/require\(["']\.\.\/components\//);
  });

  it("keeps backend services on direct model imports", () => {
    const inventorySource = readBackendFile("services/inventory.js");
    const productAccessSource = readBackendFile("services/productAccess.js");

    expect(inventorySource).toMatch(/require\(["']\.\.\/models\/product["']\)/);
    expect(inventorySource).not.toMatch(/mongoose\.model\(["']Product["']\)/);
    expect(productAccessSource).toMatch(/require\(["']\.\.\/models\/user["']\)/);
  });
});
