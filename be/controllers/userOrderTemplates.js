const { User } = require("../models/user");

async function updateOrderTemplateDisplayName(req, res) {
  try {
    const { index } = req.params;
    const { displayName, note } = req.body;
    if (!displayName) {
      return res.status(400).json({ message: "Display name is required" });
    }
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (index < 0 || index >= user.orderTemplate.length) {
      return res.status(404).json({ message: "Order template index out of range" });
    }
    user.orderTemplate[index].displayName = displayName;
    if (note !== undefined) {
      user.orderTemplate[index].note = typeof note === "string" ? note : "";
    }
    await user.save();
    res.json({
      message: "Display name updated successfully",
      orderTemplate: user.orderTemplate[index],
    });
  } catch (error) {
    console.error("Error in update order template display name:", error.message);
    res.status(500).json({ message: "Lỗi server" });
  }
}

async function updateOrderTemplateProducts(req, res) {
  try {
    const { index } = req.params;
    const { products } = req.body;
    if (!products || !Array.isArray(products)) {
      return res.status(400).json({ message: "Products must be an array" });
    }
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (index < 0 || index >= user.orderTemplate.length) {
      return res.status(404).json({ message: "Order template index out of range" });
    }
    user.orderTemplate[index].products = products.map((product) => ({
      productId: product.productId,
      quantity: product.quantity || 1,
    }));
    await user.save();
    res.json({
      message: "Products updated successfully",
      orderTemplate: user.orderTemplate[index],
    });
  } catch (error) {
    console.error("Error in update order template products:", error.message);
    res.status(500).json({ message: "Lỗi server" });
  }
}

async function getOrderTemplates(req, res) {
  try {
    const user = await User.findById(req.user.userId).select("orderTemplate");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ orderTemplates: user.orderTemplate });
  } catch (error) {
    console.error("Error in get order templates:", error.message);
    res.status(500).json({ message: "Lỗi server" });
  }
}

async function createOrderTemplate(req, res) {
  try {
    const { displayName, note, products } = req.body;
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const newTemplate = {
      displayName,
      note: typeof note === "string" ? note : "",
      products: products || [],
    };
    user.orderTemplate.push(newTemplate);
    await user.save();
    const newIndex = user.orderTemplate.length - 1;
    res.status(201).json({ index: newIndex, orderTemplate: user.orderTemplate[newIndex] });
  } catch (error) {
    console.error("Error in create order template:", error.message);
    res.status(500).json({ message: "Lỗi server" });
  }
}

async function deleteOrderTemplate(req, res) {
  try {
    const { index } = req.params;
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (index < 0 || index >= user.orderTemplate.length) {
      return res.status(404).json({ message: "Order template index out of range" });
    }
    user.orderTemplate.splice(index, 1);
    await user.save();
    res.json({ message: "Order template deleted successfully" });
  } catch (error) {
    console.error("Error in delete order template:", error.message);
    res.status(500).json({ message: "Lỗi server" });
  }
}

module.exports = {
  createOrderTemplate,
  deleteOrderTemplate,
  getOrderTemplates,
  updateOrderTemplateDisplayName,
  updateOrderTemplateProducts,
};
