const fs = require("fs");
const path = require("path");

jest.mock("../models/manage", () => {
  const Manage = jest.fn().mockImplementation((payload = {}) => {
    const instance = { ...payload };
    instance.save = jest.fn().mockImplementation(async () => instance);
    return instance;
  });
  Manage.findOne = jest.fn();
  Manage.findOneAndUpdate = jest.fn();
  return { Manage };
});

jest.mock("fs", () => {
  const actualFs = jest.requireActual("fs");
  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      unlink: jest.fn(),
    },
  };
});

const { Manage } = require("../models/manage");
const { promises: fsPromises } = require("fs");
const manageContent = require("../controllers/manageContent");

function createResponse() {
  const response = {};
  response.status = jest.fn().mockReturnValue(response);
  response.json = jest.fn().mockReturnValue(response);
  return response;
}

function createManage(overrides = {}) {
  return {
    overViewImg: [],
    partners: [],
    topPurchaseUrl: "",
    highestRatingUrl: "",
    newProductUrl: "",
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("manage content extraction", () => {
  const originalAddress = process.env.ADDRESS;
  let consoleErrorSpy;
  let consoleLogSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADDRESS = "https://storefront.test";
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  afterAll(() => {
    process.env.ADDRESS = originalAddress;
  });

  it("exports one content handler package and keeps route middleware in the facade", () => {
    expect(Object.keys(manageContent).sort()).toEqual([
      "deleteManageImage",
      "getManage",
      "updateFooterContent",
      "updateHomeCategories",
      "updateIntroduction",
      "updateManageImage",
      "updateManageImages",
      "updatePartnerImages",
      "updatePartnerText",
      "uploadSectionImage",
    ]);

    const source = fs.readFileSync(
      path.join(__dirname, "..", "components", "manage.js"),
      "utf8"
    );
    expect(source).toContain("require('../controllers/manageContent')");
    expect(source).toContain('router.get("/", getManage);');
    expect(source).toContain("upload.array('manage', 1), updateManageImage);");
    expect(source).toContain("upload.array('manage', 10), updateManageImages);");
    expect(source).toContain("upload.array('manage', 10), updatePartnerImages);");
    expect(source).toContain("upload.single('image'), uploadSectionImage);");
    expect(source).toContain('router.put("/update-footer"');
    expect(source).toContain('logManageRoute("update_introduction", "Trang Giới thiệu"), updateIntroduction);');
  });

  it("keeps single-image validation and the mutually exclusive target rule", async () => {
    const response = createResponse();

    await manageContent.updateManageImage({ files: [], body: {} }, response);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      success: 0,
      message: "Vui lòng upload một file ảnh",
    });

    response.status.mockClear();
    response.json.mockClear();
    Manage.findOne.mockResolvedValue(createManage());
    await manageContent.updateManageImage(
      {
        files: [{ filename: "hero.jpg" }],
        body: { topPurchaseUrl: true, highestRatingUrl: true },
      },
      response
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      success: 0,
      message: "Chỉ được cập nhật một trường: topPurchaseUrl hoặc highestRatingUrl",
    });
    expect(Manage.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("appends images and removes legacy partner text values", async () => {
    const overviewManage = createManage({
      overViewImg: ["https://storefront.test/images/old.jpg"],
    });
    const partnerManage = createManage({
      partners: ["Partner cũ dạng text", "https://storefront.test/images/partner-old.jpg"],
    });
    Manage.findOne
      .mockResolvedValueOnce(overviewManage)
      .mockResolvedValueOnce(partnerManage);
    const overviewResponse = createResponse();
    const partnerResponse = createResponse();

    await manageContent.updateManageImages(
      { files: [{ filename: "overview-new.jpg" }] },
      overviewResponse
    );
    await manageContent.updatePartnerImages(
      { files: [{ filename: "partner-new.jpg" }] },
      partnerResponse
    );

    expect(overviewManage.overViewImg).toEqual([
      "https://storefront.test/images/old.jpg",
      "https://storefront.test/images/overview-new.jpg",
    ]);
    expect(partnerManage.partners).toEqual([
      "https://storefront.test/images/partner-old.jpg",
      "https://storefront.test/images/partner-new.jpg",
    ]);
    expect(overviewManage.save).toHaveBeenCalledTimes(1);
    expect(partnerManage.save).toHaveBeenCalledTimes(1);
  });

  it("updates normalized footer content through one atomic upsert", async () => {
    const updatedManage = createManage({
      footerContent: {
        logo: "https://storefront.test/images/logo.png",
        description: "Mô tả footer",
        address: "Hà Nội",
        phone: "08.1315.8383",
        email: "contact@ttsmart.vn",
      },
    });
    Manage.findOneAndUpdate.mockResolvedValue(updatedManage);
    const response = createResponse();

    await manageContent.updateFooterContent(
      {
        body: {
          footerContent: {
            logo: "  https://storefront.test/images/logo.png  ",
            description: "  Mô tả footer  ",
            address: "  Hà Nội  ",
            phone: "  08.1315.8383  ",
            email: "  contact@ttsmart.vn  ",
          },
        },
      },
      response
    );

    expect(Manage.findOneAndUpdate).toHaveBeenCalledWith(
      {},
      {
        $set: {
          "footerContent.logo": "https://storefront.test/images/logo.png",
          "footerContent.description": "Mô tả footer",
          "footerContent.address": "Hà Nội",
          "footerContent.phone": "08.1315.8383",
          "footerContent.email": "contact@ttsmart.vn",
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    expect(response.json).toHaveBeenCalledWith({
      success: 1,
      message: "Cập nhật nội dung footer thành công",
      data: updatedManage,
    });
  });

  it("rejects invalid footer email before persistence", async () => {
    const response = createResponse();

    await manageContent.updateFooterContent(
      { body: { footerContent: { email: "email-khong-hop-le" } } },
      response
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      success: 0,
      message: "Email footer không hợp lệ",
    });
    expect(Manage.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("preserves false when updating partner display configuration", async () => {
    const currentManage = createManage();
    const updatedManage = createManage({
      partners: ["Partner A"],
      displayPartners: false,
    });
    Manage.findOne.mockResolvedValue(currentManage);
    Manage.findOneAndUpdate.mockResolvedValue(updatedManage);
    const response = createResponse();

    await manageContent.updatePartnerText(
      { body: { partners: ["Partner A"], displayPartners: false } },
      response
    );

    expect(Manage.findOneAndUpdate).toHaveBeenCalledWith(
      {},
      { $set: { partners: ["Partner A"], displayPartners: false } },
      { new: true }
    );
    expect(response.json).toHaveBeenCalledWith({
      success: 1,
      message: "Cập nhật cấu hình đối tác thành công",
      data: updatedManage,
    });
  });

  it("returns the uploaded section image URL without persisting manage data", async () => {
    const response = createResponse();

    await manageContent.uploadSectionImage(
      { file: { filename: "section.jpg" } },
      response
    );

    expect(response.json).toHaveBeenCalledWith({
      success: 1,
      message: "Tải ảnh lên thành công",
      imgUrl: "https://storefront.test/images/section.jpg",
    });
    expect(Manage.findOne).not.toHaveBeenCalled();
  });

  it("deletes every matching overview image and persists even if file unlink fails", async () => {
    const imgUrl = "https://storefront.test/images/repeated.jpg";
    const manage = createManage({
      overViewImg: [imgUrl, "https://storefront.test/images/keep.jpg", imgUrl],
    });
    Manage.findOne.mockResolvedValue(manage);
    fsPromises.unlink.mockRejectedValue(new Error("missing file"));
    const response = createResponse();

    await manageContent.deleteManageImage({ body: { imgUrl } }, response);

    expect(manage.overViewImg).toEqual(["https://storefront.test/images/keep.jpg"]);
    expect(manage.save).toHaveBeenCalledTimes(1);
    expect(response.json).toHaveBeenCalledWith({
      success: 1,
      message: "Xóa ảnh thành công",
      data: manage,
    });
  });
});
