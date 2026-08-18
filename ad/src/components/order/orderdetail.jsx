import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  styled,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DeleteIcon from "@mui/icons-material/Delete";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import SaveIcon from "@mui/icons-material/Save";
import toast from "react-hot-toast";
import { NumericFormat } from "react-number-format";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { usePermissions } from "../../context/usepermissions";
import {
  addSalesOrderItem,
  cancelSalesOrder,
  cleanSalesOrderTempImage,
  createAdminSalesOrderDraft,
  deleteSalesOrderImage,
  deleteSalesOrderItem,
  getAdminSalesOrderDetail,
  getSalesOrderProductsByCodes,
  getSalesOrderProductsForScan,
  reorderSalesOrderItems,
  resolveSalesOrderAssetUrl,
  scanSalesOrderInvoice,
  searchSalesOrderProducts,
  updateSalesOrderCustomer,
  updateSalesOrderImages,
  updateSalesOrderItemQuantity,
  uploadSalesOrderImage,
} from "../../api/salesOrderManagementApi";

const VisuallyHiddenInput = styled("input")({
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  height: 1,
  overflow: "hidden",
  position: "absolute",
  bottom: 0,
  left: 0,
  whiteSpace: "nowrap",
  width: 1,
});

const parsePrice = (price) => {
  if (typeof price === "number") return price;
  return Number(String(price || "0").replace(/\./g, "").replace(",", ".")) || 0;
};

const parseQuantity = (value) => {
  const quantity = Number(String(value || "").replace(/\./g, "").replace(",", "."));
  return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
};

const formatPrice = (value) => Number(value || 0).toLocaleString("vi-VN");

const removeVietnameseTones = (str) => {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
};

const normalizeCode = (code) => removeVietnameseTones(code).replace(/[^a-z0-9]/g, "");

const getStatusLabel = (order) => {
  if (!order) return "";
  if (order.state === "Cancelled") return "Đã hủy";
  switch (order.status) {
    case "Processing":
      return "Đang xử lý";
    case "Delivering":
      return "Đang giao";
    case "Completed":
      return "Hoàn thành";
    default:
      return order.status;
  }
};

const getStatusColor = (order) => {
  if (!order) return "default";
  if (order.state === "Cancelled") return "error";
  if (order.status === "Completed") return "success";
  if (order.status === "Delivering") return "info";
  return "warning";
};

const getLockedOrderMessage = (order) => {
  if (order?.state === "Cancelled") return "Đơn đã hủy - chỉ xem";
  if (order?.status === "Completed") return "Đơn đã hoàn thành - chỉ xem";
  return "Đơn đang ở chế độ chỉ xem";
};

const resolveInvoiceImageUrl = (imageUrl) => {
  return resolveSalesOrderAssetUrl(imageUrl);
};

const compressImage = (file, maxWidth = 1800, quality = 0.82) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxWidth / img.width);
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (webpBlob) => {
          if (webpBlob) {
            resolve(new File([webpBlob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" }));
            return;
          }
          canvas.toBlob(
            (jpegBlob) => {
              if (!jpegBlob) {
                reject(new Error("Không thể nén ảnh"));
                return;
              }
              resolve(new File([jpegBlob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
            },
            "image/jpeg",
            quality
          );
        },
        "image/webp",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Không thể đọc ảnh"));
    };

    img.src = objectUrl;
  });
};

const performLevel1Matching = (items, catalogProducts, currentItems) => {
  const currentProductIds = new Set((currentItems || []).map((item) => String(item.productId)));
  const orderedCatalog = [
    ...catalogProducts.filter((product) => currentProductIds.has(String(product._id))),
    ...catalogProducts.filter((product) => !currentProductIds.has(String(product._id))),
  ];

  return (items || []).map((item) => {
    const scannedCode = normalizeCode(item.code);
    const scannedName = removeVietnameseTones(item.rawScannedName || item.name || "");
    let bestProduct = null;
    let confidence = "low";

    if (scannedCode) {
      bestProduct = orderedCatalog.find((product) => normalizeCode(product.code) === scannedCode);
      if (bestProduct) confidence = "high";
    }

    if (!bestProduct && scannedCode) {
      bestProduct = orderedCatalog.find((product) => {
        const productCode = normalizeCode(product.code);
        return productCode && (productCode.includes(scannedCode) || scannedCode.includes(productCode));
      });
      if (bestProduct) confidence = "medium";
    }

    if (!bestProduct && scannedName) {
      bestProduct = orderedCatalog.find((product) => {
        const productName = removeVietnameseTones(product.name);
        return productName && (productName.includes(scannedName) || scannedName.includes(productName));
      });
      if (bestProduct) confidence = "medium";
    }

    return {
      ...item,
      quantity: parseQuantity(item.quantity) || 1,
      matchedProductId: bestProduct?._id || "",
      confidence,
    };
  });
};

const SortableTableRow = ({
  item,
  index,
  disabled,
  tempQuantity,
  onQuantityChange,
  onQuantityCommit,
  onDelete,
  navigate,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${item.productId}-${item.variantIndex}-${index}`, disabled });

  const price = parsePrice(item.price);

  return (
    <TableRow
      ref={setNodeRef}
      sx={{
        transform: CSS.Transform.toString(transform),
        transition,
        backgroundColor: isDragging ? "rgba(0, 0, 0, 0.08)" : "inherit",
      }}
    >
      <TableCell align="center" sx={{ width: 48 }}>
        <IconButton
          size="small"
          disabled={disabled}
          {...attributes}
          {...listeners}
          sx={{ cursor: disabled ? "not-allowed" : "grab" }}
        >
          <DragIndicatorIcon fontSize="small" />
        </IconButton>
      </TableCell>
      <TableCell>
        <Typography
          variant="body2"
          color="primary"
          sx={{ cursor: "pointer", fontWeight: 600 }}
          onClick={() => navigate(`/product/${item.productId}`)}
        >
          {item.name || "N/A"}
        </Typography>
      </TableCell>
      <TableCell align="center">
        {item.imgUrl ? (
          <img
            src={item.imgUrl}
            alt={item.name || "Sản phẩm"}
            style={{ width: 56, height: 56, objectFit: "cover" }}
          />
        ) : (
          "N/A"
        )}
      </TableCell>
      <TableCell align="center">{item.code || "N/A"}</TableCell>
      <TableCell align="center">{item.brand || "N/A"}</TableCell>
      <TableCell align="right">{formatPrice(price)} VNĐ</TableCell>
      <TableCell align="center">
        <NumericFormat
          value={tempQuantity[index] ?? item.quantity}
          customInput={TextField}
          allowNegative={false}
          decimalScale={0}
          thousandSeparator="."
          decimalSeparator=","
          size="small"
          disabled={disabled}
          sx={{ width: 110 }}
          onValueChange={(values) => onQuantityChange(index, values.value)}
          onBlur={() => onQuantityCommit(index)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onQuantityCommit(index);
          }}
        />
      </TableCell>
      <TableCell align="right">{formatPrice(price * (item.quantity || 0))} VNĐ</TableCell>
      <TableCell align="center">
        <IconButton color="error" onClick={() => onDelete(index)} disabled={disabled}>
          <DeleteIcon />
        </IconButton>
      </TableCell>
    </TableRow>
  );
};

const SalesOrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canCreate = can("order.create");
  const canEdit = can("order.edit");
  const canCancel = can("order.delete");
  const canExcel = canEdit && can("order.excel");
  const canScanAi = canEdit && can("order.scan_ai");
  const canAddImage = canCreate || canEdit;
  const excelInputRef = useRef(null);
  const scanInputRef = useRef(null);
  const manualImageInputRef = useRef(null);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tempQuantity, setTempQuantity] = useState({});
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [codeTerm, setCodeTerm] = useState("");
  const [products, setProducts] = useState([]);
  const [productLoading, setProductLoading] = useState(false);
  const [allProducts, setAllProducts] = useState([]);
  const [isScanDialogOpen, setIsScanDialogOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState([]);
  const [selectedScanImage, setSelectedScanImage] = useState("");
  const [tempScanImageUrl, setTempScanImageUrl] = useState(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImgIndex, setCurrentImgIndex] = useState(0);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const locked = order?.status === "Completed" || order?.state === "Cancelled";
  const orderImages = order?.images || [];

  const runSalesOrderRequest = useCallback(
    async (request) => {
      try {
        const response = await request;

        if (response.status === 401 || response.status === 403) {
          toast.error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
          navigate("/login");
          return null;
        }

        const contentType = response.headers.get("content-type");
        const isJson = contentType && contentType.includes("application/json");
        const data = isJson ? await response.json() : null;

        if (!response.ok) {
          throw new Error(data?.message || `Lỗi ${response.status}`);
        }

        return data;
      } catch (err) {
        toast.error(err.message);
        return null;
      }
    },
    [navigate]
  );

  const applyOrder = (nextOrder) => {
    setOrder(nextOrder);
    setUserName(nextOrder.userName || "");
    setUserPhone(nextOrder.userPhone || "");
    setTempQuantity(
      (nextOrder.cartItems || []).reduce((acc, item, index) => {
        acc[index] = String(item.quantity || "");
        return acc;
      }, {})
    );
  };

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    setError("");
    const data = await runSalesOrderRequest(getAdminSalesOrderDetail(id));
    if (data?.success) {
      applyOrder(data.order);
    } else {
      setError("Không tải được chi tiết đơn hàng.");
    }
    setLoading(false);
  }, [id, runSalesOrderRequest]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  useEffect(() => {
    if (!openAddDialog || (!searchTerm.trim() && !codeTerm.trim())) {
      setProducts([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      setProductLoading(true);
      const data = await runSalesOrderRequest(
        searchSalesOrderProducts({
          search: searchTerm,
          code: codeTerm,
          limit: 20,
        }),
      );
      setProducts(data?.products || []);
      setProductLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, [codeTerm, openAddDialog, runSalesOrderRequest, searchTerm]);

  const sortableIds = useMemo(
    () => (order?.cartItems || []).map((item, index) => `${item.productId}-${item.variantIndex}-${index}`),
    [order]
  );

  const loadAllProductsForScan = async () => {
    if (allProducts.length > 0) return allProducts;
    const data = await runSalesOrderRequest(getSalesOrderProductsForScan());
    const loadedProducts = data?.products || [];
    setAllProducts(loadedProducts);
    return loadedProducts;
  };

  const mergeItemsIntoOrder = async (itemsToAdd, targetOrderId = id, baseItems = order?.cartItems || []) => {
    const workingItems = baseItems.map((item) => ({ ...item }));
    const skipped = [];
    let added = 0;

    for (const rawItem of itemsToAdd) {
      const quantity = parseQuantity(rawItem.quantity);
      const productId = rawItem.productId || rawItem._id;
      const variantIndex = Number(rawItem.variantIndex ?? 0);

      if (!productId || !Number.isInteger(variantIndex) || variantIndex < 0 || !quantity) {
        skipped.push(rawItem.code || rawItem.name || "Dòng không hợp lệ");
        continue;
      }

      const existingIndex = workingItems.findIndex(
        (item) => String(item.productId) === String(productId) && Number(item.variantIndex) === variantIndex
      );

      if (existingIndex >= 0) {
        const nextQuantity = Number(workingItems[existingIndex].quantity || 0) + quantity;
        const result = await runSalesOrderRequest(
          updateSalesOrderItemQuantity(
            targetOrderId,
            existingIndex,
            nextQuantity,
          ),
        );

        if (result?.success) {
          workingItems[existingIndex].quantity = nextQuantity;
          added += 1;
        } else {
          skipped.push(rawItem.code || rawItem.name || productId);
        }
      } else {
        const result = await runSalesOrderRequest(
          addSalesOrderItem(targetOrderId, { productId, variantIndex, quantity }),
        );

        if (result?.success) {
          workingItems.push({ productId, variantIndex, quantity });
          added += 1;
        } else {
          skipped.push(rawItem.code || rawItem.name || productId);
        }
      }
    }

    return { added, skipped, workingItems };
  };

  const updateOrderImages = async (images) => {
    const result = await runSalesOrderRequest(updateSalesOrderImages(id, images));

    if (result?.success) {
      applyOrder(result.order);
      return true;
    }
    return false;
  };

  const handleDragEnd = async (event) => {
    if (locked) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortableIds.indexOf(active.id);
    const newIndex = sortableIds.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = [...order.cartItems];
    const [movedItem] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, movedItem);

    const previousOrder = order;
    applyOrder({ ...order, cartItems: reordered });
    const result = await runSalesOrderRequest(
      reorderSalesOrderItems(
        id,
        reordered.map(({ productId, variantIndex, quantity }) => ({
          productId,
          variantIndex,
          quantity,
        })),
      ),
    );

    if (result?.success) {
      applyOrder(result.order);
      toast.success("Đã lưu thứ tự sản phẩm");
    } else {
      applyOrder(previousOrder);
    }
  };

  const handleQuantityCommit = async (index) => {
    if (locked) return;
    const quantity = Number(tempQuantity[index]);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast.error("Số lượng không hợp lệ");
      setTempQuantity((prev) => ({ ...prev, [index]: String(order.cartItems[index]?.quantity || "") }));
      return;
    }

    if (quantity === order.cartItems[index]?.quantity) return;

    const result = await runSalesOrderRequest(
      updateSalesOrderItemQuantity(id, index, quantity),
    );

    if (result?.success) {
      applyOrder(result.order);
      toast.success("Đã cập nhật số lượng");
    } else {
      setTempQuantity((prev) => ({ ...prev, [index]: String(order.cartItems[index]?.quantity || "") }));
    }
  };

  const handleDeleteItem = async (index) => {
    if (locked) return;
    if (!window.confirm("Bạn có chắc muốn xóa sản phẩm này khỏi đơn hàng?")) return;

    const result = await runSalesOrderRequest(deleteSalesOrderItem(id, index));

    if (result?.success) {
      applyOrder(result.order);
      toast.success("Đã xóa sản phẩm");
    }
  };

  const handleAddProduct = async (product) => {
    if (locked) return;
    const { added } = await mergeItemsIntoOrder([
      { productId: product._id, variantIndex: 0, quantity: 1, code: product.code, name: product.name },
    ]);

    if (added > 0) {
      await fetchOrder();
      setOpenAddDialog(false);
      setSearchTerm("");
      setCodeTerm("");
      setProducts([]);
      toast.success("Đã thêm sản phẩm");
    }
  };

  const handleSaveCustomer = async () => {
    if (locked) return;
    const result = await runSalesOrderRequest(
      updateSalesOrderCustomer(id, { userName, userPhone }),
    );

    if (result?.success) {
      setOrder((prev) => ({ ...prev, userName: result.order.userName, userPhone: result.order.userPhone }));
      toast.success("Đã lưu thông tin người đặt");
    }
  };

  const handleCancelOrder = async () => {
    if (!order || locked) return;
    if (!window.confirm("Bạn có chắc muốn hủy đơn hàng này?")) return;

    const result = await runSalesOrderRequest(cancelSalesOrder(id));
    if (result?.order) {
      await fetchOrder();
      toast.success("Đã hủy đơn hàng");
    }
  };

  const handleCopyOrder = async () => {
    if (!order) return;
    setBulkProcessing(true);
    const draft = await runSalesOrderRequest(createAdminSalesOrderDraft());
    if (!draft?.success) {
      setBulkProcessing(false);
      return;
    }

    const newId = draft.order._id;
    const { added, skipped } = await mergeItemsIntoOrder(order.cartItems || [], newId, []);

    if (order.userPhone) {
      await runSalesOrderRequest(
        updateSalesOrderCustomer(newId, {
          userName: order.userName || "",
          userPhone: order.userPhone,
        }),
      );
    }

    setBulkProcessing(false);
    toast.success(`Đã sao chép ${added} dòng. Bỏ qua ${skipped.length} dòng.`);
    navigate(`/salesorder/${newId}`);
  };

  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Don ban");
    worksheet.columns = [
      { header: "STT", key: "stt", width: 8 },
      { header: "Tên", key: "name", width: 35 },
      { header: "Mã", key: "code", width: 22 },
      { header: "Hãng", key: "brand", width: 20 },
      { header: "Giá", key: "price", width: 16 },
      { header: "Số lượng", key: "quantity", width: 14 },
      { header: "Thành tiền", key: "amount", width: 18 },
    ];

    (order.cartItems || []).forEach((item, index) => {
      const price = parsePrice(item.price);
      worksheet.addRow({
        stt: index + 1,
        name: item.name || "",
        code: item.code || "",
        brand: item.brand || "",
        price,
        quantity: item.quantity || 0,
        amount: price * (item.quantity || 0),
      });
    });

    worksheet.addRow({});
    worksheet.addRow({ brand: "Tổng cộng", amount: Number(order.total || 0) });
    worksheet.getRow(1).font = { bold: true };
    worksheet.getColumn("price").numFmt = "#,##0";
    worksheet.getColumn("amount").numFmt = "#,##0";

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `don-ban-${order.orderCode || id}.xlsx`);
  };

  const handleDownloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Mau nhap");
    worksheet.columns = [
      { header: "Mã", key: "code", width: 24 },
      { header: "Số lượng", key: "quantity", width: 16 },
    ];
    worksheet.addRow({ code: "MA-SAN-PHAM", quantity: 1 });
    worksheet.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), "mau-nhap-don-ban.xlsx");
  };

  const handleExcelImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || locked) return;

    setBulkProcessing(true);
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        toast.error("File Excel không có dữ liệu");
        setBulkProcessing(false);
        return;
      }

      const headerRow = worksheet.getRow(1);
      let codeColumn = 1;
      let quantityColumn = 2;
      headerRow.eachCell((cell, colNumber) => {
        const header = removeVietnameseTones(cell.text || cell.value);
        if (header.includes("ma")) codeColumn = colNumber;
        if (header.includes("so luong")) quantityColumn = colNumber;
      });

      const rows = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const code = String(row.getCell(codeColumn).text || row.getCell(codeColumn).value || "").trim();
        const quantity = parseQuantity(row.getCell(quantityColumn).value || row.getCell(quantityColumn).text);
        if (code && quantity) rows.push({ code, quantity });
      });

      if (rows.length === 0) {
        toast.error("Không có dòng Excel hợp lệ");
        setBulkProcessing(false);
        return;
      }

      const codeResult = await runSalesOrderRequest(
        getSalesOrderProductsByCodes(rows.map((row) => row.code)),
      );
      const productMap = new Map((codeResult?.products || []).map((product) => [normalizeCode(product.code), product]));
      const itemsToAdd = [];
      const skipped = [];

      rows.forEach((row) => {
        const product = productMap.get(normalizeCode(row.code));
        if (product) {
          itemsToAdd.push({ productId: product._id, variantIndex: 0, quantity: row.quantity, code: row.code });
        } else {
          skipped.push(row.code);
        }
      });

      const mergeResult = await mergeItemsIntoOrder(itemsToAdd);
      await fetchOrder();
      const allSkipped = [...skipped, ...mergeResult.skipped];
      toast.success(`Đã nhập ${mergeResult.added} dòng. Bỏ qua ${allSkipped.length} dòng.`);
      if (allSkipped.length > 0) toast.error(`Bỏ qua: ${allSkipped.join(", ")}`);
    } catch (err) {
      toast.error(err.message || "Lỗi khi nhập Excel");
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleScanInvoiceSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || locked) return;

    const previewUrl = URL.createObjectURL(file);
    if (selectedScanImage) URL.revokeObjectURL(selectedScanImage);

    setIsScanDialogOpen(true);
    setIsScanning(true);
    setScanResults([]);
    setSelectedScanImage(previewUrl);
    setTempScanImageUrl(null);

    try {
      const [compressedFile, catalogProducts] = await Promise.all([
        compressImage(file),
        loadAllProductsForScan(),
      ]);
      const result = await runSalesOrderRequest(
        scanSalesOrderInvoice(compressedFile),
      );

      if (result?.success) {
        const processedItems = performLevel1Matching(result.items || [], catalogProducts, order.cartItems || []);
        setScanResults(processedItems);
        setTempScanImageUrl(result.imageUrl || null);
        toast.success("AI đã phân tích hóa đơn xong");
      } else {
        URL.revokeObjectURL(previewUrl);
        setSelectedScanImage("");
        setIsScanDialogOpen(false);
      }
    } catch (err) {
      toast.error(err.message || "Lỗi khi quét hóa đơn");
      URL.revokeObjectURL(previewUrl);
      setSelectedScanImage("");
      setIsScanDialogOpen(false);
    } finally {
      setIsScanning(false);
    }
  };

  const handleCancelScanDialog = async () => {
    if (isScanning) return;
    if (tempScanImageUrl) {
      await runSalesOrderRequest(cleanSalesOrderTempImage(tempScanImageUrl));
    }
    if (selectedScanImage) URL.revokeObjectURL(selectedScanImage);
    setSelectedScanImage("");
    setTempScanImageUrl(null);
    setIsScanDialogOpen(false);
    setScanResults([]);
  };

  const handleConfirmScanImport = async () => {
    if (locked) return;
    const validItems = scanResults
      .filter((row) => row.matchedProductId && row.matchedProductId !== "NEW_PRODUCT")
      .map((row) => ({
        productId: row.matchedProductId,
        variantIndex: 0,
        quantity: row.quantity,
        code: row.code,
        name: row.rawScannedName,
      }));

    if (validItems.length === 0) {
      toast.error("Vui lòng chọn ít nhất một sản phẩm hợp lệ");
      return;
    }

    setBulkProcessing(true);
    const mergeResult = await mergeItemsIntoOrder(validItems);
    if (tempScanImageUrl) {
      await updateOrderImages([...(order.images || []), tempScanImageUrl]);
      setTempScanImageUrl(null);
    }
    await fetchOrder();
    setBulkProcessing(false);
    setIsScanDialogOpen(false);
    setScanResults([]);
    if (selectedScanImage) URL.revokeObjectURL(selectedScanImage);
    setSelectedScanImage("");
    toast.success(`Đã thêm ${mergeResult.added} dòng. Bỏ qua ${mergeResult.skipped.length} dòng.`);
  };

  const handleManualUploadSelect = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0 || locked) return;

    setBulkProcessing(true);
    try {
      const uploadedUrls = [];
      for (const file of files) {
        const compressedFile = await compressImage(file);
        const result = await runSalesOrderRequest(
          uploadSalesOrderImage(compressedFile),
        );
        if (result?.success && result.imageUrl) uploadedUrls.push(result.imageUrl);
      }

      if (uploadedUrls.length > 0) {
        await updateOrderImages([...(order.images || []), ...uploadedUrls]);
        toast.success(`Đã đính kèm ${uploadedUrls.length} ảnh`);
      }
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleDeleteImage = async (indexToDelete) => {
    if (locked) return;
    if (!window.confirm("Bạn có chắc muốn xóa ảnh hóa đơn này?")) return;

    const imageUrl = orderImages[indexToDelete];
    const nextImages = orderImages.filter((_, index) => index !== indexToDelete);
    const saved = await updateOrderImages(nextImages);
    if (saved && imageUrl) {
      await runSalesOrderRequest(deleteSalesOrderImage(imageUrl));
      toast.success("Đã xóa ảnh hóa đơn");
    }
  };

  const openLightbox = (index) => {
    setCurrentImgIndex(index);
    setLightboxOpen(true);
  };

  if (loading) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" p={3}>
        <CircularProgress />
        <Typography mt={2}>Đang tải chi tiết đơn bán hàng...</Typography>
      </Box>
    );
  }

  if (error || !order) {
    return (
      <Box p={2}>
        <Alert severity="error">{error || "Không có dữ liệu đơn hàng"}</Alert>
      </Box>
    );
  }

  return (
    <Box p={2}>
      <Box className="sticky-header">
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} mb={2}>
          <Typography variant="h4">Chi tiết đơn bán #{order.orderCode}</Typography>
          <Chip label={getStatusLabel(order)} color={getStatusColor(order)} />
        </Box>

        {locked && (
          <Alert severity="info" sx={{ mb: 4 }}>
            {getLockedOrderMessage(order)}
          </Alert>
        )}

        <Box display="flex" gap={2} flexWrap="wrap" mb={2} mt={1}>
          <TextField
            label="Họ tên người đặt"
            value={userName}
            onChange={(event) => setUserName(event.target.value)}
            disabled={locked}
            size="small"
            sx={{ minWidth: { xs: "100%", sm: 260 } }}
          />
          <TextField
            label="Số điện thoại người đặt"
            value={userPhone}
            onChange={(event) => setUserPhone(event.target.value)}
            disabled={locked}
            size="small"
            sx={{ minWidth: { xs: "100%", sm: 240 } }}
          />
          {canEdit && (
            <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSaveCustomer} disabled={locked}>
              Lưu thông tin
            </Button>
          )}
        </Box>

        <Box display="flex" gap={1.5} mb={2} flexWrap="wrap">
          {canEdit && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenAddDialog(true)} disabled={locked || bulkProcessing}>
              Thêm sản phẩm
            </Button>
          )}
          {canEdit && (
            <Button variant="contained" color="primary" onClick={handleCopyOrder} disabled={bulkProcessing}>
              Sao chép đơn
            </Button>
          )}
          {canCancel && (
            <Button variant="outlined" color="error" onClick={handleCancelOrder} disabled={locked || bulkProcessing}>
              Hủy đơn
            </Button>
          )}
          {canExcel && (
            <>
              <Button variant="outlined" color="info" startIcon={<CloudDownloadIcon />} onClick={handleExportExcel}>
                Xuất Excel
              </Button>
              <Button variant="outlined" color="warning" component="label" startIcon={<CloudUploadIcon />} disabled={locked || bulkProcessing}>
                Nhập Excel
                <VisuallyHiddenInput ref={excelInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelImport} />
              </Button>
              <Button variant="outlined" onClick={handleDownloadTemplate}>
                Tải file mẫu
              </Button>
            </>
          )}
          {canScanAi && (
            <Button
              variant="contained"
              component="label"
              startIcon={<AutoAwesomeIcon />}
              disabled={locked || bulkProcessing}
              sx={{ bgcolor: "#673ab7", "&:hover": { bgcolor: "#512da8" } }}
            >
              Quét hóa đơn (AI)
              <VisuallyHiddenInput ref={scanInputRef} type="file" accept="image/*" onChange={handleScanInvoiceSelect} />
            </Button>
          )}
          {canAddImage && (
            <Button variant="contained" component="label" startIcon={<CloudUploadIcon />} disabled={locked || bulkProcessing}>
              Thêm ảnh thủ công
              <VisuallyHiddenInput ref={manualImageInputRef} type="file" accept="image/*" multiple onChange={handleManualUploadSelect} />
            </Button>
          )}
        </Box>
      </Box>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell align="center">Kéo</TableCell>
                <TableCell>Tên</TableCell>
                <TableCell align="center">Hình ảnh</TableCell>
                <TableCell align="center">Mã</TableCell>
                <TableCell align="center">Hãng</TableCell>
                <TableCell align="right">Giá</TableCell>
                <TableCell align="center">Số lượng</TableCell>
                <TableCell align="right">Thành tiền</TableCell>
                <TableCell align="center">Xóa</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(order.cartItems || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center">
                    Chưa có sản phẩm trong đơn hàng
                  </TableCell>
                </TableRow>
              ) : (
                <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                  {order.cartItems.map((item, index) => (
                    <SortableTableRow
                      key={`${item.productId}-${item.variantIndex}-${index}`}
                      item={item}
                      index={index}
                      disabled={locked || bulkProcessing || !canEdit}
                      tempQuantity={tempQuantity}
                      onQuantityChange={(rowIndex, value) =>
                        setTempQuantity((prev) => ({ ...prev, [rowIndex]: value }))
                      }
                      onQuantityCommit={handleQuantityCommit}
                      onDelete={handleDeleteItem}
                      navigate={navigate}
                    />
                  ))}
                </SortableContext>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </DndContext>

      <Box display="flex" justifyContent="flex-end" mt={2}>
        <Typography variant="h6">Tổng cộng: {formatPrice(order.total)} VNĐ</Typography>
      </Box>

      {orderImages.length > 0 && (
        <Box mt={3}>
          <Typography variant="h6" mb={1}>
            Ảnh hóa đơn đính kèm
          </Typography>
          <Box display="flex" gap={2} flexWrap="wrap">
            {orderImages.map((imageUrl, index) => (
              <Box key={`${imageUrl}-${index}`} sx={{ position: "relative", width: 130 }}>
                <Box
                  component="img"
                  src={resolveInvoiceImageUrl(imageUrl)}
                  alt={`Ảnh hóa đơn ${index + 1}`}
                  onClick={() => openLightbox(index)}
                  sx={{
                    width: 130,
                    height: 130,
                    objectFit: "cover",
                    borderRadius: 1,
                    border: "1px solid rgba(0,0,0,0.15)",
                    cursor: "pointer",
                  }}
                />
                {!locked && (
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleDeleteImage(index)}
                    sx={{ position: "absolute", top: 4, right: 4, bgcolor: "background.paper" }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Dialog open={openAddDialog} onClose={() => setOpenAddDialog(false)} disableScrollLock maxWidth="md" fullWidth>
        <DialogTitle>Thêm sản phẩm</DialogTitle>
        <DialogContent>
          <Box display="flex" gap={2} flexDirection={{ xs: "column", sm: "row" }} mt={1} mb={2}>
            <TextField
              label="Tìm theo tên"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              fullWidth
            />
            <TextField
              label="Tìm theo mã"
              value={codeTerm}
              onChange={(event) => setCodeTerm(event.target.value)}
              fullWidth
            />
          </Box>

          {productLoading ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Tên sản phẩm</TableCell>
                    <TableCell>Mã</TableCell>
                    <TableCell>Hãng</TableCell>
                    <TableCell align="right">Giá</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {products.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        Chưa có sản phẩm phù hợp
                      </TableCell>
                    </TableRow>
                  ) : (
                    products.map((product) => {
                      const variant = product.variant?.[0] || {};
                      return (
                        <TableRow
                          hover
                          key={product._id}
                          onClick={() => handleAddProduct(product)}
                          sx={{ cursor: "pointer" }}
                        >
                          <TableCell>{product.name}</TableCell>
                          <TableCell>{product.code || "N/A"}</TableCell>
                          <TableCell>{product.brand || "N/A"}</TableCell>
                          <TableCell align="right">{formatPrice(parsePrice(variant.price))} VNĐ</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAddDialog(false)}>Đóng</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isScanDialogOpen} onClose={handleCancelScanDialog} disableScrollLock maxWidth="lg" fullWidth>
        <DialogTitle>Quét hóa đơn đơn bán</DialogTitle>
        <DialogContent>
          <Box display="flex" gap={2} flexDirection={{ xs: "column", md: "row" }}>
            <Box sx={{ flex: 1, minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "#f5f5f5" }}>
              {selectedScanImage ? (
                <img
                  src={selectedScanImage}
                  alt="Ảnh hóa đơn đang quét"
                  style={{ maxWidth: "100%", maxHeight: 520, objectFit: "contain" }}
                />
              ) : (
                <Typography color="text.secondary">Chưa có ảnh</Typography>
              )}
            </Box>
            <Box sx={{ flex: 1.4 }}>
              {isScanning ? (
                <Box display="flex" flexDirection="column" alignItems="center" p={5} gap={2}>
                  <CircularProgress />
                  <Typography>AI đang phân tích hóa đơn...</Typography>
                </Box>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 520 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Tên quét</TableCell>
                        <TableCell align="center">SL</TableCell>
                        <TableCell>Sản phẩm khớp</TableCell>
                        <TableCell align="center">Tin cậy</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {scanResults.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} align="center">
                            Chưa có kết quả
                          </TableCell>
                        </TableRow>
                      ) : (
                        scanResults.map((row, index) => {
                          const selectedProduct = allProducts.find((product) => product._id === row.matchedProductId) || null;
                          return (
                            <TableRow key={`${row.rawScannedName || row.code}-${index}`}>
                              <TableCell>
                                <Typography variant="body2">{row.rawScannedName || row.name || "N/A"}</Typography>
                                {row.code && <Typography variant="caption">Mã: {row.code}</Typography>}
                              </TableCell>
                              <TableCell align="center" sx={{ width: 90 }}>
                                <TextField
                                  size="small"
                                  type="number"
                                  value={row.quantity || 1}
                                  inputProps={{ min: 1 }}
                                  onChange={(event) => {
                                    const next = [...scanResults];
                                    next[index] = { ...next[index], quantity: parseQuantity(event.target.value) || 1 };
                                    setScanResults(next);
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <Autocomplete
                                  size="small"
                                  options={allProducts}
                                  value={selectedProduct}
                                  getOptionLabel={(option) =>
                                    option ? `${option.name || ""}${option.code ? ` - ${option.code}` : ""}` : ""
                                  }
                                  onChange={(event, newValue) => {
                                    const next = [...scanResults];
                                    next[index] = { ...next[index], matchedProductId: newValue?._id || "" };
                                    setScanResults(next);
                                  }}
                                  renderInput={(params) => <TextField {...params} label="Chọn sản phẩm" />}
                                />
                              </TableCell>
                              <TableCell align="center">
                                <Chip
                                  size="small"
                                  label={row.confidence || "low"}
                                  color={row.confidence === "high" ? "success" : row.confidence === "medium" ? "warning" : "default"}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelScanDialog} disabled={isScanning}>
            Hủy
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmScanImport}
            disabled={isScanning || scanResults.filter((row) => row.matchedProductId).length === 0}
          >
            Xác nhận nhập
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={lightboxOpen} onClose={() => setLightboxOpen(false)} disableScrollLock maxWidth="lg" fullWidth>
        <DialogContent sx={{ bgcolor: "#111", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "75vh" }}>
          {orderImages[currentImgIndex] && (
            <img
              src={resolveInvoiceImageUrl(orderImages[currentImgIndex])}
              alt={`Ảnh hóa đơn ${currentImgIndex + 1}`}
              style={{ maxWidth: "100%", maxHeight: "75vh", objectFit: "contain" }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button
            disabled={orderImages.length <= 1}
            onClick={() => setCurrentImgIndex((prev) => (prev - 1 + orderImages.length) % orderImages.length)}
          >
            Trước
          </Button>
          <Button
            disabled={orderImages.length <= 1}
            onClick={() => setCurrentImgIndex((prev) => (prev + 1) % orderImages.length)}
          >
            Sau
          </Button>
          <Button variant="contained" onClick={() => setLightboxOpen(false)}>
            Đóng
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SalesOrderDetail;
