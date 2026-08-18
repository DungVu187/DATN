const express = require("express");
const { Brand, Chip, Section } = require("../models/chip");
const { authenticateAdmin, checkPermission } = require("../middlewares/auth");
const { ActivityLog } = require("../models/activitylog");
const { normalizeBrandKey } = require("../utils/brandNormalization");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const router = express.Router();

router.post("/addValue", authenticateAdmin, checkPermission("product.create"), async (req, res) => {
  try {
    const { type, value } = req.body;
    const chip = await Chip.findOne({});
    if (chip) {
      if (!chip[type].includes(value)) {
        chip[type].push(value);
        await chip.save();
        res.status(200).json({ message: `${type} added successfully` });
      } else {
        res.status(400).json({ message: `${type} already exists` });
      }
    } else {
      const newChip = new Chip({
        Color: [],
        Shapes: [],
        Frames: [],
        ButtonCount: [],
      });
      newChip[type].push(value);
      await newChip.save();
      res.status(200).json({ message: `New chip created with ${type}` });
    }
  } catch (error) {
    console.error("Error adding chip value:", error);
    res.status(500).json({ message: "Lỗi server khi thêm thuộc tính chip" });
  }
});

router.post("/removeValue", authenticateAdmin, checkPermission("product.create"), async (req, res) => {
  const { type, value } = req.body;
  if (!type || !value) {
    return res.status(400).json({ message: "Cần có type và value để xóa." });
  }
  try {
    let update = {};
    update[type] = value;
    const result = await Chip.updateMany(
      { [type]: { $in: [value] } },
      { $pull: { [type]: value } }
    );

    if (result.modifiedCount > 0) {
      res.status(200).json({ message: "Xóa thành công" });
    } else {
      res.status(404).json({ message: "Không tìm thấy chip phù hợp để xóa" });
    }
  } catch (error) {
    console.error("Error removing chip value:", error);
    res
      .status(500)
      .json({ message: "Có lỗi xảy ra khi xóa chip." });
  }
});

router.get("/getValues", async (req, res) => {
  try {
    const chip = await Chip.findOne({});
    if (chip) {
      res.status(200).json({
        Color: chip.Color,
        Shapes: chip.Shapes,
        Frames: chip.Frames,
        ButtonCount: chip.ButtonCount,
      });
    } else {
      res.status(400).json({ message: "No chip found" });
    }
  } catch (error) {
    console.error("Error fetching chip values:", error);
    res.status(500).json({ message: "Lỗi server khi lấy thuộc tính chip" });
  }
});

// Routes cho Brand
router.get("/brands", async (req, res) => {
  try {
    const brands = await Brand.find();
    res.status(200).json(brands);
  } catch (err) {
    console.error("Error fetching brands:", err);
    res.status(500).json({ message: "Lỗi server khi lấy danh sách thương hiệu" });
  }
});

router.post("/brands", authenticateAdmin, checkPermission("product.create"), async (req, res) => {
  try {
    const incoming = String(req.body.Brand || "").trim();
    if (!incoming) {
      return res.status(400).json({ message: "Thiếu tên thương hiệu" });
    }

    const brandKey = normalizeBrandKey(incoming);
    const existingBrands = await Brand.find().select("Brand").lean();
    const duplicateBrand = existingBrands.find(
      (existingBrand) => normalizeBrandKey(existingBrand.Brand) === brandKey
    );
    if (duplicateBrand) {
      return res.status(200).json(duplicateBrand);
    }

    const brand = new Brand({ Brand: incoming });
    const newBrand = await brand.save();

    // Ghi log hoạt động
    try {
      await new ActivityLog({
        userName: req.user.name,
        action: "create_brand",
        productName: newBrand.Brand,
        details: [{ field: "Brand", oldValue: "", newValue: newBrand.Brand }]
      }).save();
    } catch (logErr) { console.error("ActivityLog error in create_brand:", logErr.message); }

    return res.status(201).json(newBrand);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

router.delete("/brands/:id", authenticateAdmin, checkPermission("product.create"), async (req, res) => {
  try {
    const brand = await Brand.findByIdAndDelete(req.params.id);
    if (!brand) return res.status(404).json({ message: "Brand not found" });

    // Ghi log hoạt động
    try {
      await new ActivityLog({
        userName: req.user.name,
        action: "delete_brand",
        productName: brand.Brand,
        details: [{ field: "Brand", oldValue: brand.Brand, newValue: "" }]
      }).save();
    } catch (logErr) { console.error("ActivityLog error in delete_brand:", logErr.message); }

    res.status(200).json({ message: "Brand deleted" });
  } catch (err) {
    console.error("Error deleting brand:", err);
    res.status(500).json({ message: "Lỗi server khi xóa thương hiệu" });
  }
});

// API cho section
const storage = multer.diskStorage({
  destination: "./upload/sections",
  filename: function (req, file, cb) {
    cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Chỉ cho phép upload file ảnh!"));
    }
    cb(null, true);
  },
});

router.post("/upload-section-image", authenticateAdmin, checkPermission("product.create"), upload.single("sectionImage"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const imgUrl = `${process.env.ADDRESS}/section-images/${req.file.filename}`;
  res.status(200).json({ imgUrl });
});

router.delete("/delete-section-image/:filename", authenticateAdmin, checkPermission("product.create"), (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(__dirname, "..", "upload", "sections", filename);

  fs.access(filepath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ message: "File not found" });
    }

    fs.unlink(filepath, (err) => {
      if (err) {
        console.error("Error deleting section image file:", err);
        return res.status(500).json({ message: "Lỗi server khi xóa ảnh phân loại" });
      }

      res.status(200).json({ message: "File deleted successfully" });
    });
  });
});

router.get("/section", async (req, res) => {
  try {
    const doc = await Section.findOne();
    if (!doc) return res.json([]);

    const sectionNames = doc.Section.map((sec) => sec.name);
    res.json(sectionNames);
  } catch (error) {
    console.error("Error fetching sections:", error);
    res.status(500).json({ error: "Lỗi server khi lấy danh sách phân loại" });
  }
});

router.post("/section", authenticateAdmin, checkPermission("product.create"), async (req, res) => {
  try {
    const { name } = req.body;

    let doc = await Section.findOne();
    if (!doc) {
      doc = new Section({ Section: [{ name, value: [] }] });
    } else {
      const isExist = doc.Section.some((sec) => sec.name === name);
      if (isExist) {
        return res.status(400).json({ message: "Section đã tồn tại" });
      }
      doc.Section.push({ name, value: [] });
    }

    await doc.save();

    // Ghi log hoạt động
    try {
      await new ActivityLog({
        userName: req.user.name,
        action: "create_section",
        productName: name,
        details: [{ field: "Phân loại", oldValue: "", newValue: name }]
      }).save();
    } catch (logErr) { console.error("ActivityLog error in create_section:", logErr.message); }

    res.status(201).json(doc);
  } catch (error) {
    console.error("Error creating section:", error);
    res.status(500).json({ error: "Lỗi server khi tạo phân loại" });
  }
});

router.get("/section-doc", async (req, res) => {
  try {
    const doc = await Section.findOne();
    if (!doc) return res.json({});
    res.json(doc);
  } catch (err) {
    console.error("Error fetching section document:", err);
    res.status(500).json({ message: "Lỗi server khi lấy dữ liệu phân loại" });
  }
});

router.put("/section/:oldName", authenticateAdmin, checkPermission("product.create"), async (req, res) => {
  try {
    const { oldName } = req.params;
    const { name } = req.body;

    const doc = await Section.findOne();
    if (!doc)
      return res.status(404).json({ message: "Không tìm thấy dữ liệu" });

    const section = doc.Section.find((sec) => sec.name === oldName);
    if (!section)
      return res.status(404).json({ message: "Không tìm thấy section" });

    section.name = name;
    await doc.save();

    // Ghi log hoạt động
    try {
      await new ActivityLog({
        userName: req.user.name,
        action: "update_section",
        productName: name,
        details: [{ field: "Phân loại", oldValue: oldName, newValue: name }]
      }).save();
    } catch (logErr) { console.error("ActivityLog error in update_section:", logErr.message); }

    res.json(doc);
  } catch (error) {
    console.error("Error updating section:", error);
    res.status(500).json({ error: "Lỗi server khi cập nhật phân loại" });
  }
});

router.delete("/section/:name", authenticateAdmin, checkPermission("product.create"), async (req, res) => {
  try {
    const { name } = req.params;
    const doc = await Section.findOne();
    if (!doc)
      return res.status(404).json({ message: "Không tìm thấy dữ liệu" });

    doc.Section = doc.Section.filter((sec) => sec.name !== name);
    await doc.save();

    // Ghi log hoạt động
    try {
      await new ActivityLog({
        userName: req.user.name,
        action: "delete_section",
        productName: name,
        details: [{ field: "Phân loại", oldValue: name, newValue: "" }]
      }).save();
    } catch (logErr) { console.error("ActivityLog error in delete_section:", logErr.message); }

    res.json(doc);
  } catch (error) {
    console.error("Error deleting section:", error);
    res.status(500).json({ error: "Lỗi server khi xóa phân loại" });
  }
});

// API cho value

router.post("/sections/images", async (req, res) => {
  try {
    const { names } = req.body; // names: ["Color", "Size"]
    const doc = await Section.findOne();
    if (!doc) return res.status(404).json({ message: "Không tìm thấy dữ liệu" });

    const result = {};
    for (const name of names) {
      const section = doc.Section.find((sec) => sec.name === name);
      result[name] = section ? getUpdatedImgUrl(section.imgUrl) || null : null;
    }

    res.json(result);
  } catch (error) {
    console.error("Error fetching section images:", error);
    res.status(500).json({ error: "Lỗi server khi lấy ảnh phân loại" });
  }
});

router.get("/:name/value", async (req, res) => {
  try {
    const { name } = req.params;
    const doc = await Section.findOne();
    if (!doc)
      return res.status(404).json({ message: "Không tìm thấy dữ liệu" });

    const section = doc.Section.find((sec) => sec.name === name);
    if (!section)
      return res.status(404).json({ message: "Không tìm thấy section" });

    res.json(section.value);
  } catch (error) {
    console.error("Error fetching section values:", error);
    res.status(500).json({ error: "Lỗi server khi lấy giá trị phân loại" });
  }
});

router.post("/:name/value", [authenticateAdmin, checkPermission("product.create")], async (req, res) => {
  try {
    const { name } = req.params;
    const { value } = req.body;

    const doc = await Section.findOne();
    if (!doc)
      return res.status(404).json({ message: "Không tìm thấy dữ liệu" });

    const section = doc.Section.find((sec) => sec.name === name);
    if (!section)
      return res.status(404).json({ message: "Không tìm thấy section" });

    section.value.push(value);
    await doc.save();

    // Ghi log hoạt động
    try {
      await new ActivityLog({
        userName: req.user ? req.user.name : "Hệ thống / Admin",
        action: "create_section_value",
        productName: `${name}: ${value}`,
        details: [{ field: "Giá trị", oldValue: "", newValue: value }]
      }).save();
    } catch (logErr) { console.error("ActivityLog error in create_section_value:", logErr.message); }

    res.json(doc);
  } catch (error) {
    console.error("Error creating section value:", error);
    res.status(500).json({ error: "Lỗi server khi thêm giá trị phân loại" });
  }
});

router.put("/:name/value", authenticateAdmin, checkPermission("product.create"), async (req, res) => {
  try {
    const { name } = req.params;
    const { oldValue, newValue, imgUrl } = req.body;

    const doc = await Section.findOne();
    if (!doc) return res.status(404).json({ message: "Không tìm thấy dữ liệu" });

    const section = doc.Section.find((sec) => sec.name === name);
    if (!section) return res.status(404).json({ message: "Không tìm thấy section" });

    const valueIndex = section.value.indexOf(oldValue);
    if (valueIndex === -1) return res.status(404).json({ message: "Không tìm thấy value" });

    const oldImg = section.imgUrl;
    section.value[valueIndex] = newValue;
    if (imgUrl) {
      section.imgUrl = imgUrl; // cập nhật imgUrl cho section
    }

    await doc.save();

    // Ghi log hoạt động
    try {
      const details = [{ field: "value", oldValue, newValue }];
      if (imgUrl && oldImg !== imgUrl) {
        details.push({ field: "imgUrl", oldValue: oldImg || "", newValue: imgUrl });
      }
      await new ActivityLog({
        userName: req.user.name,
        action: "update_section_value",
        productName: `${name}: ${newValue}`,
        details
      }).save();
    } catch (logErr) { console.error("ActivityLog error in update_section_value:", logErr.message); }

    res.json(doc);
  } catch (error) {
    console.error("Error updating section value:", error);
    res.status(500).json({ error: "Lỗi server khi cập nhật giá trị phân loại" });
  }
});

router.delete("/:name/value", authenticateAdmin, checkPermission("product.create"), async (req, res) => {
  try {
    const { name } = req.params;
    const { value } = req.body;

    const doc = await Section.findOne();
    if (!doc)
      return res.status(404).json({ message: "Không tìm thấy dữ liệu" });

    const section = doc.Section.find((sec) => sec.name === name);
    if (!section)
      return res.status(404).json({ message: "Không tìm thấy section" });

    section.value = section.value.filter((val) => val !== value);
    await doc.save();

    // Ghi log hoạt động
    try {
      await new ActivityLog({
        userName: req.user.name,
        action: "delete_section_value",
        productName: `${name}: ${value}`,
        details: [{ field: "Giá trị", oldValue: value, newValue: "" }]
      }).save();
    } catch (logErr) { console.error("ActivityLog error in delete_section_value:", logErr.message); }

    res.json(doc);
  } catch (error) {
    console.error("Error deleting section value:", error);
    res.status(500).json({ error: "Lỗi server khi xóa giá trị phân loại" });
  }
});

module.exports = {
  Chip,
  router,
};
