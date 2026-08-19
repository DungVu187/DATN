const { Manage } = require("../models/manage");

const updateHomepageSection = async (sectionId, body) => {
  const { name, productId, display, image, link } = body;

  if (!/^section(1[0-1]|[1-9])$/.test(sectionId)) {
    return { error: "sectionId không hợp lệ" };
  }

  if (name !== undefined && (typeof name !== "string" || name.trim().length > 150)) {
    return { error: "T\u00ean section ph\u1ea3i l\u00e0 chu\u1ed7i kh\u00f4ng qu\u00e1 150 k\u00fd t\u1ef1" };
  }


  if (productId !== undefined && !Array.isArray(productId)) {
    return { error: "productId phải là một mảng" };
  }
  if (display !== undefined && typeof display !== "boolean") {
    return { error: "display phải là giá trị boolean" };
  }
  if (image !== undefined && typeof image !== "string") {
    return { error: "image phải là chuỗi" };
  }
  if (link !== undefined && typeof link !== "string") {
    return { error: "link phải là chuỗi" };
  }

  let manage = await Manage.findOne();
  if (!manage) {
    manage = new Manage();
  }

  const updateData = {};
  if (name !== undefined) updateData[`${sectionId}.name`] = name.trim();
  if (productId !== undefined) updateData[`${sectionId}.productId`] = productId;
  if (display !== undefined) updateData[`${sectionId}.display`] = display;
  if (image !== undefined) updateData[`${sectionId}.image`] = image;
  if (link !== undefined) updateData[`${sectionId}.link`] = link;

  const updatedManage = await Manage.findOneAndUpdate(
    {},
    { $set: updateData },
    { new: true, upsert: true }
  );

  return { updatedManage, sectionId };
};

const updateLegacyHomepageSection = async (sectionNumber, body) => {
  const sectionId = `section${sectionNumber}`;
  if (!/^section(10|[1-9])$/.test(sectionId)) {
    return { error: "sectionNumber không hợp lệ" };
  }

  const { name, productId, display } = body;

  if (name && typeof name !== "string") {
    return { error: `Tên ${sectionId} phải là chuỗi` };
  }
  if (productId && !Array.isArray(productId)) {
    return { error: "productId phải là một mảng" };
  }
  if (display !== undefined && typeof display !== "boolean") {
    return { error: "display phải là giá trị boolean" };
  }

  const manage = await Manage.findOne();
  let updatedManage;

  const updateData = {};
  if (name) updateData[`${sectionId}.name`] = name;
  if (productId) updateData[`${sectionId}.productId`] = productId;
  if (display !== undefined) updateData[`${sectionId}.display`] = display;

  if (manage) {
    updatedManage = await Manage.findOneAndUpdate(
      {},
      { $set: updateData },
      { new: true }
    );
  } else {
    updatedManage = await new Manage({
      [sectionId]: {
        name: name || "",
        productId: productId || [],
        display: display !== undefined ? display : true,
      },
    }).save();
  }

  return { updatedManage, sectionId };
};

module.exports = {
  updateHomepageSection,
  updateLegacyHomepageSection,
};
