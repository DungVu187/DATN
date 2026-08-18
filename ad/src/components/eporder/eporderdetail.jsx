import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";

import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  TextField,
  Checkbox,
  Box,
  Typography,
  CircularProgress,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  styled,
  Autocomplete,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import PostAddIcon from "@mui/icons-material/PostAdd";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import ImportExportIcon from "@mui/icons-material/ImportExport";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import toast from "react-hot-toast";
import { NumericFormat } from "react-number-format";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { usePermissions } from "../../context/usepermissions";
import {
  addExportOrderLine,
  cleanInventoryTempImage,
  completeExportOrderLine,
  createExportOrder,
  createImportOrderFromExport,
  createInventoryBrand,
  createInventoryOrderTemplate,
  createInventoryProduct,
  deleteExportOrder,
  deleteExportOrderImage,
  deleteExportOrderLine,
  getExportOrder,
  getInventoryProduct,
  getInventoryProductCatalog,
  getInventoryProductsByCodes,
  getInventoryProductsByIds,
  reorderExportOrderLines,
  resolveInventoryOrderAssetUrl,
  scanInventoryInvoice,
  searchInventoryOrderProducts,
  setExportOrderStatus,
  updateExportOrderLine,
  updateExportOrderMetadata,
  updateExportOrderName,
  updateInventoryOrderHistoryName,
  uploadExportOrderImage,
} from "../../api/inventoryOrderAdministrationApi";

const removeTonesLocal = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d")
  .replace(/Đ/g, "D");

const brandKeyOf = (value) => removeTonesLocal(value)
  .toLowerCase()
  .replace(/\s+/g, "")
  .trim();

// Ẩn input file
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

const orderMetadataFieldSx = {
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: "#9EADBF",
    borderWidth: "1.5px",
  },
  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "#71839A",
  },
};

const blueOutlinedButtonSx = {
  color: "#2F6FE4",
  borderColor: "#2F6FE4",
  borderWidth: "1.5px",
  "&:hover": {
    borderColor: "#245BC4",
    borderWidth: "1.5px",
    backgroundColor: "rgba(47, 111, 228, 0.05)",
  },
};

const purpleOutlinedButtonSx = {
  color: "#6D46D8",
  borderColor: "#8F70E8",
  borderWidth: "1.5px",
  "&:hover": {
    borderColor: "#6D46D8",
    borderWidth: "1.5px",
    backgroundColor: "rgba(109, 70, 216, 0.05)",
  },
};

// Component con cho hàng có thể kéo thả
const SortableTableRow = ({
  product,
  index,
  tempProductList,
  handleTempUpdateProduct,
  navigate,
  receiveInput,
  setReceiveInput,
  handleExportQuantity,
  handleDeleteProduct,
  handleProductStatusChange,
  canEdit,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `${product.productId}-${index}`,
    disabled: product.status || !canEdit,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    backgroundColor: isDragging ? "rgba(0, 0, 0, 0.1)" : "inherit",
    "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.04)" },
  };

  return (
    <TableRow ref={setNodeRef} sx={style}>
      <TableCell
        align="center"
        {...attributes}
        {...listeners}
        sx={{
          cursor: product.status || !canEdit ? "not-allowed" : "grab",
          userSelect: "none",
          width: "40px",
          padding: "5px",
          "&:active": {
            cursor: product.status || !canEdit ? "not-allowed" : "grabbing",
          },
          pointerEvents: "auto",
        }}
      >
        ☰
      </TableCell>
      <TableCell align="center">
        <Typography
          variant="body2"
          sx={{ cursor: "pointer", color: "primary.main" }}
          onClick={() => navigate(`/product/${product.productId}`)}
        >
          {product.name || "N/A"}
        </Typography>
      </TableCell>
      <TableCell align="center">
   {product.imgUrl ? (
  <img
    src={product.imgUrl}
    alt={product.name || "Sản phẩm"}
    style={{ width: "42px", height: "42px", objectFit: "cover" }}
  />
) : (
  "N/A"
)}
      </TableCell>
      <TableCell align="center">{product.code || "N/A"}</TableCell>
      <TableCell align="center">{product.brand || "N/A"}</TableCell>
      <TableCell align="center" sx={{ width: 72 }}>
        <NumericFormat
          value={tempProductList[index]?.profitPercent ?? ""}
          customInput={TextField}
          decimalScale={2}
          allowNegative={false}
          isAllowed={({ floatValue }) => floatValue === undefined || floatValue <= 100}
          onValueChange={(values) => {
            const { value } = values;
            handleTempUpdateProduct(index, "profitPercent", value, false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const value = tempProductList[index]?.profitPercent ?? "";
              handleTempUpdateProduct(index, "profitPercent", value, true);
            }
          }}
          size="small"
          disabled={product.status || !canEdit}
          suffix="%"
          sx={{ width: "66px" }}
        />
      </TableCell>
      <TableCell align="center" sx={{ width: 96, whiteSpace: "nowrap" }}>
        <NumericFormat
          value={tempProductList[index]?.price || "0"}
          displayType="text"
          thousandSeparator="."
          decimalSeparator=","
          renderText={(value) => (
            <Typography variant="body2" fontWeight={600}>
              {value}
            </Typography>
          )}
        />
      </TableCell>
      <TableCell align="center">
        <TextField
          value={tempProductList[index]?.unit || ""}
          onChange={(e) =>
            handleTempUpdateProduct(index, "unit", e.target.value, false)
          }
          onBlur={(e) => {
            const value = e.target.value || "";
            handleTempUpdateProduct(index, "unit", value, true);
          }}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              const value = e.target.value || "";
              handleTempUpdateProduct(index, "unit", value, true);
            }
          }}
          size="small"
          disabled={product.status || !canEdit}
          sx={{ width: "58px" }}
        />
      </TableCell>
      <TableCell align="center">
        <NumericFormat
          value={tempProductList[index]?.quantity || ""}
          customInput={TextField}
          thousandSeparator="."
          decimalSeparator=","
          onValueChange={(values) => {
            const { value } = values;
            handleTempUpdateProduct(index, "quantity", value, false);
          }}
          onBlur={() => {
            const value = tempProductList[index]?.quantity || "";
            handleTempUpdateProduct(index, "quantity", value, true);
          }}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              const value = tempProductList[index]?.quantity || "";
              handleTempUpdateProduct(index, "quantity", value, true);
            }
          }}
          size="small"
          disabled={product.status || !canEdit}
          sx={{ width: "64px" }}
        />
      </TableCell>
      <TableCell align="center">{product.quantityEx || 0}</TableCell>
      <TableCell align="center">
        <NumericFormat
          customInput={TextField}
          thousandSeparator="."
          decimalSeparator=","
          value={receiveInput[index] || ""}
          onValueChange={(values) => {
            const { value } = values;
            setReceiveInput((prev) => ({ ...prev, [index]: value }));
          }}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              const value = receiveInput[index] || "";
              handleExportQuantity(index, value);
            }
          }}
          size="small"
          disabled={product.status || !canEdit}
          sx={{
            width: "62px",
            "& .MuiOutlinedInput-root": {
              backgroundColor: "#a6e3b5",
            },
          }}
          allowNegative={true}
        />
      </TableCell>
      <TableCell align="center">
        <TextField
          value={tempProductList[index]?.note || ""}
          onChange={(e) =>
            handleTempUpdateProduct(index, "note", e.target.value, false)
          }
          onBlur={(e) => {
            const value = e.target.value || "";
            handleTempUpdateProduct(index, "note", value, true);
          }}
          onKeyPress={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              const value = e.target.value || "";
              handleTempUpdateProduct(index, "note", value, true);
            }
          }}
          size="small"
          multiline
          disabled={product.status || !canEdit}
          fullWidth
        />
      </TableCell>
      <TableCell align="center">
        <Checkbox
          checked={product.status}
          color="success"
          onChange={() => handleProductStatusChange(index, product)}
          disabled={!canEdit || product.status}
        />
      </TableCell>
      <TableCell align="center">
        {canEdit && (
          <IconButton
            onClick={() => handleDeleteProduct(index)}
            disabled={product.quantityEx > 0}
            color="error"
          >
            <DeleteIcon />
          </IconButton>
        )}
      </TableCell>
    </TableRow>
  );
};

// Component chính
const ExportOrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canCreate = can("eporder.create");
  const canEdit = can("eporder.edit");
  const canDelete = can("eporder.delete");
  const canExcel = canEdit && can("eporder.excel");
  const canScanAi = canEdit && can("eporder.scan_ai");
  const canAddImage = canCreate || canEdit;
  const canCreateRelatedOrder = canCreate || canEdit;
  const [order, setOrder] = useState(null);
  const [enrichedOrder, setEnrichedOrder] = useState(null);
  const [tempProductList, setTempProductList] = useState([]);
  const [productDetails, setProductDetails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [receiveInput, setReceiveInput] = useState({});
  const [isProcessingExcel, setIsProcessingExcel] = useState(false);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState(null);
  const [excelMenuAnchor, setExcelMenuAnchor] = useState(null);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [templateDisplayName, setTemplateDisplayName] = useState("");
  const [templateNote, setTemplateNote] = useState("");
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);

  // States phục vụ tính năng quét hóa đơn bằng AI
  const [allProducts, setAllProducts] = useState([]);
  const [isScanDialogOpen, setIsScanDialogOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState([]);
  const [selectedScanImage, setSelectedScanImage] = useState(null);
  const [scannedImages, setScannedImages] = useState([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImgIndex, setCurrentImgIndex] = useState(0);
  const [tempScanImageUrl, setTempScanImageUrl] = useState(null);

  // States phục vụ Zoom + Drag cho khung xem ảnh hóa đơn AI
  const [scanZoomScale, setScanZoomScale] = useState(1);
  const [scanPanOffset, setScanPanOffset] = useState({ x: 0, y: 0 });
  const [scanIsDragging, setScanIsDragging] = useState(false);
  const [scanDragStart, setScanDragStart] = useState({ x: 0, y: 0 });
  const imageWrapperRef = useRef(null);

  // States phục vụ Zoom + Xoay + Drag ảnh xem trước
  const [rotation, setRotation] = useState(0);
  const [zoomScale, setZoomScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const activeListenerRef = useRef(null);
  const activeTouchStartRef = useRef(null);
  const activeTouchMoveRef = useRef(null);
  const activeTouchEndRef = useRef(null);

  // States phục vụ chạm/pinch zoom trên điện thoại
  const [touchStartDist, setTouchStartDist] = useState(null);
  const [touchStartScale, setTouchStartScale] = useState(1);

  const stateRef = useRef({ zoomScale, position, isDragging, dragStart, touchStartDist, touchStartScale });
  useEffect(() => {
    stateRef.current = { zoomScale, position, isDragging, dragStart, touchStartDist, touchStartScale };
  }, [zoomScale, position, isDragging, dragStart, touchStartDist, touchStartScale]);

  const getDistance = (t1, t2) => {
    return Math.sqrt(
      Math.pow(t1.clientX - t2.clientX, 2) +
      Math.pow(t1.clientY - t2.clientY, 2)
    );
  };

  const containerCallbackRef = useCallback((node) => {
    if (containerRef.current) {
      if (activeListenerRef.current) {
        containerRef.current.removeEventListener("wheel", activeListenerRef.current);
        activeListenerRef.current = null;
      }
      if (activeTouchStartRef.current) {
        containerRef.current.removeEventListener("touchstart", activeTouchStartRef.current);
        activeTouchStartRef.current = null;
      }
      if (activeTouchMoveRef.current) {
        containerRef.current.removeEventListener("touchmove", activeTouchMoveRef.current);
        activeTouchMoveRef.current = null;
      }
      if (activeTouchEndRef.current) {
        containerRef.current.removeEventListener("touchend", activeTouchEndRef.current);
        activeTouchEndRef.current = null;
      }
    }

    containerRef.current = node;

    if (node) {
      // 1. Wheel zoom
      const handleNativeWheel = (e) => {
        e.preventDefault();
        const zoomFactor = 0.15;
        setZoomScale((prev) => {
          let nextScale = prev + (e.deltaY < 0 ? zoomFactor : -zoomFactor);
          return Math.min(Math.max(nextScale, 0.5), 5); // Zoom từ 0.5x đến 5x
        });
      };
      node.addEventListener("wheel", handleNativeWheel, { passive: false });
      activeListenerRef.current = handleNativeWheel;

      // 2. Touch Start
      const handleNativeTouchStart = (e) => {
        const currentScale = stateRef.current.zoomScale;
        const currentPos = stateRef.current.position;

        if (e.touches.length === 1) {
          if (currentScale > 1) {
            setIsDragging(true);
            const touch = e.touches[0];
            setDragStart({ x: touch.clientX - currentPos.x, y: touch.clientY - currentPos.y });
          }
        } else if (e.touches.length === 2) {
          setIsDragging(false);
          const dist = getDistance(e.touches[0], e.touches[1]);
          setTouchStartDist(dist);
          setTouchStartScale(currentScale);
        }
      };
      node.addEventListener("touchstart", handleNativeTouchStart, { passive: true });
      activeTouchStartRef.current = handleNativeTouchStart;

      // 3. Touch Move
      const handleNativeTouchMove = (e) => {
        const currentScale = stateRef.current.zoomScale;
        const currentIsDragging = stateRef.current.isDragging;
        const currentDragStart = stateRef.current.dragStart;
        const currentTouchStartDist = stateRef.current.touchStartDist;
        const currentTouchStartScale = stateRef.current.touchStartScale;

        if (e.touches.length === 1 && currentIsDragging && currentScale > 1) {
          e.preventDefault(); // Chặn cuộn trang web
          const touch = e.touches[0];
          setPosition({
            x: touch.clientX - currentDragStart.x,
            y: touch.clientY - currentDragStart.y,
          });
        } else if (e.touches.length === 2 && currentTouchStartDist) {
          e.preventDefault(); // Chặn zoom mặc định của trình duyệt
          const currentDist = getDistance(e.touches[0], e.touches[1]);
          const ratio = currentDist / currentTouchStartDist;
          let nextScale = currentTouchStartScale * ratio;
          nextScale = Math.min(Math.max(nextScale, 0.5), 5);
          setZoomScale(nextScale);
        }
      };
      node.addEventListener("touchmove", handleNativeTouchMove, { passive: false }); // PASSIVE: FALSE để e.preventDefault() chạy được
      activeTouchMoveRef.current = handleNativeTouchMove;

      // 4. Touch End
      const handleNativeTouchEnd = () => {
        setIsDragging(false);
        setTouchStartDist(null);
      };
      node.addEventListener("touchend", handleNativeTouchEnd, { passive: true });
      activeTouchEndRef.current = handleNativeTouchEnd;
    }
  }, []);

  // Tự động đưa ảnh về trung tâm khi thu nhỏ về nhỏ hơn hoặc bằng kích thước gốc
  useEffect(() => {
    if (zoomScale <= 1) {
      setPosition({ x: 0, y: 0 });
    }
  }, [zoomScale]);

  // Khôi phục góc xoay từ localStorage và reset zoom khi mở hoặc chuyển ảnh
  useEffect(() => {
    if (lightboxOpen && scannedImages[currentImgIndex]) {
      const savedRot = parseInt(localStorage.getItem(`rotation_${scannedImages[currentImgIndex]}`)) || 0;
      setRotation(savedRot);
      setZoomScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [currentImgIndex, lightboxOpen, scannedImages]);

  const handleRotate = () => {
    const nextRot = (rotation + 90) % 360;
    setRotation(nextRot);
    localStorage.setItem(`rotation_${scannedImages[currentImgIndex]}`, nextRot.toString());
  };

  const handleResetZoom = () => {
    setZoomScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging || zoomScale <= 1) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleOpenLightbox = (index) => {
    setCurrentImgIndex(index);
    setLightboxOpen(true);
  };

  // Zoom & Pan handlers for the AI Scan invoice image box via ref callback
  const setWrapperRef = useCallback((node) => {
    if (imageWrapperRef.current) {
      try {
        imageWrapperRef.current.removeEventListener("wheel", imageWrapperRef.current._wheelHandler);
      } catch (err) {
        console.error("Lỗi gỡ bỏ wheel listener:", err);
      }
    }
    imageWrapperRef.current = node;
    if (node) {
      const handleNativeWheel = (e) => {
        e.preventDefault();
        const zoomFactor = 0.15;
        setScanZoomScale((prevScale) => {
          let newScale = prevScale + (e.deltaY < 0 ? zoomFactor : -zoomFactor);
          newScale = Math.max(1, Math.min(newScale, 8)); // Limit zoom scale from 1x to 8x
          if (newScale <= 1) {
            setScanPanOffset({ x: 0, y: 0 });
          }
          return newScale;
        });
      };
      node.addEventListener("wheel", handleNativeWheel, { passive: false });
      node._wheelHandler = handleNativeWheel;
    }
  }, []);

  const handleScanMouseDown = (e) => {
    if (scanZoomScale <= 1) return;
    e.preventDefault();
    setScanIsDragging(true);
    setScanDragStart({ x: e.clientX - scanPanOffset.x, y: e.clientY - scanPanOffset.y });
  };

  const handleScanMouseMove = (e) => {
    if (!scanIsDragging) return;
    e.preventDefault();
    setScanPanOffset({
      x: e.clientX - scanDragStart.x,
      y: e.clientY - scanDragStart.y
    });
  };

  const handleScanMouseUp = () => {
    setScanIsDragging(false);
  };

  const resetScanZoomPan = () => {
    setScanZoomScale(1);
    setScanPanOffset({ x: 0, y: 0 });
    setScanIsDragging(false);
  };

  const handleCancelScanDialog = async () => {
    if (isScanning) return;
    setIsScanDialogOpen(false);
    resetScanZoomPan();
    if (tempScanImageUrl) {
      const urlToDelete = tempScanImageUrl;
      setTempScanImageUrl(null);
      try {
        await handleApiResponse(cleanInventoryTempImage(urlToDelete));
      } catch (err) {
        console.error("Lỗi khi xóa ảnh tạm mồ côi:", err);
      }
    }
  };


  // Cấu hình sensors cho @dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Hàm gọi API chung với xử lý lỗi
  const handleApiResponse = async (request, options = {}) => {
    try {
      const { ignoredStatuses = [] } = options;
      const response = await request;

      if (ignoredStatuses.includes(response.status)) {
        return { ignoredStatus: response.status };
      }

      if (response.status === 401 || response.status === 403) {
        toast.error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
        navigate("/login");
        return null;
      }

      const contentType = response.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");

      if (!response.ok) {
        if (isJson) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Yêu cầu thất bại");
        } else {
          const errorText = await response.text();
          throw new Error(`Yêu cầu thất bại (HTTP ${response.status}): ${errorText.substring(0, 150)}`);
        }
      }

      if (isJson) {
        return await response.json();
      } else {
        throw new Error("Server phản hồi định dạng không hợp lệ (không phải JSON).");
      }
    } catch (err) {
      toast.error(err.message);
      setError(err.message);
      return null;
    }
  };

  // Hàm tải toàn bộ sản phẩm từ DB để chọn khi đổi khớp
  const loadAllProductsForScan = async () => {
    const res = await handleApiResponse(getInventoryProductCatalog());
    if (res && Array.isArray(res.products)) {
      setAllProducts(res.products);
    }
  };

  // Hàm nén ảnh ngay tại client trước khi upload
  const compressImage = (file, maxWidth = 1600, maxHeight = 1600, quality = 0.8) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                // Fallback sang JPEG nếu trình duyệt cũ không hỗ trợ WebP
                canvas.toBlob(
                  (jpegBlob) => {
                    const jpegName = file.name.substring(0, file.name.lastIndexOf('.')) + ".jpg";
                    const compressedFile = new File([jpegBlob], jpegName, {
                      type: "image/jpeg",
                      lastModified: Date.now(),
                    });
                    resolve(compressedFile);
                  },
                  "image/jpeg",
                  quality
                );
                return;
              }
              // Đổi phần mở rộng thành .webp
              const webpName = file.name.substring(0, file.name.lastIndexOf('.')) + ".webp";
              const compressedFile = new File([blob], webpName, {
                type: "image/webp",
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            },
            "image/webp",
            quality
          );
        };
      };
    });
  };

  // Hàm đối khớp Level 1 - ưu tiên so khớp các sản phẩm đang có sẵn trong đơn hàng
  const performLevel1Matching = (scanItem, currentTempList, currentProductDetails) => {
    const tokenizeSpec = (text) => {
      if (!text) return new Set();
      const regexModel = /(?=\d+[a-zA-Z]|[a-zA-Z]+\d)[a-zA-Z0-9\-/]+/gi;
      const regexPureNum = /\b\d{3,}\b/g;

      const tokens = new Set();
      let match;

      regexModel.lastIndex = 0;
      while ((match = regexModel.exec(text)) !== null) {
        tokens.add(match[0].toLowerCase());
      }

      regexPureNum.lastIndex = 0;
      while ((match = regexPureNum.exec(text)) !== null) {
        tokens.add(match[0].toLowerCase());
      }

      return tokens;
    };

    const tokenizeTypeWords = (text) => {
      if (!text) return new Set();
      const out = new Set();
      const words = removeVietnameseTones(text).toLowerCase().split(/[\s,.\-/()]+/);
      for (const w of words) {
        // từ chữ: có chữ cái, KHÔNG chứa số, độ dài > 1 (lớn hơn hoặc bằng 2)
        if (w.length > 1 && /[a-z]/.test(w) && !/\d/.test(w)) {
          out.add(w);
        }
      }
      return out;
    };

    const codeKind = (code) => {
      if (!code || !code.trim()) return 'none';
      return /^\d+$/.test(code.trim()) ? 'supplier' : 'model';
    };

    const cleanCode = (code) => {
      return code ? code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : '';
    };

    const removeVietnameseTones = (str) => {
      if (!str) return '';
      return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
    };

    const scanName = scanItem.rawScannedName || '';
    const scanCodeKind = codeKind(scanItem.code);
    const scanSpec = tokenizeSpec(`${scanName} ${scanCodeKind === 'model' ? scanItem.code : ''}`);
    const scanType = tokenizeTypeWords(scanName);
    const hasScanSpec = scanSpec.size > 0;

    const ctx = {
      scanCodeKind,
      scanSpec,
      scanType,
      hasScanSpec
    };

    const fuzzyScore = (p, scanName) => {
      const a = removeVietnameseTones(scanName).toLowerCase().split(/[\s,.\-/]+/).filter(w => w.length > 1);
      const b = removeVietnameseTones(p.name).toLowerCase().split(/[\s,.\-/]+/).filter(w => w.length > 1);
      return a.reduce((n, w) => n + (b.includes(w) ? 1 : 0), 0);
    };

    // Lọc các ứng viên trong đơn hàng vượt qua các cổng kiểm soát (gates)
    let candidates = [];
    for (const item of currentTempList) {
      const product = currentProductDetails.find((p) => p._id === item.productId);
      if (!product) continue;

      // Cổng 1: Code conflict
      if (ctx.scanCodeKind === 'model' && codeKind(product.code) === 'model'
          && cleanCode(scanItem.code) !== cleanCode(product.code)) {
        continue;
      }

      // Cổng 2: Spec subset (Set membership)
      if (ctx.hasScanSpec) {
        const pSpec = tokenizeSpec(`${product.name || ''} ${product.code || ''}`);
        let specMatch = true;
        for (const t of ctx.scanSpec) {
          if (!pSpec.has(t)) {
            specMatch = false;
            break;
          }
        }
        if (!specMatch) continue;
      }

      // Cổng 3: Type word match
      const pType = tokenizeTypeWords(product.name || '');
      let typeHit = false;
      for (const t of ctx.scanType) {
        if (pType.has(t)) {
          typeHit = true;
          break;
        }
      }
      if (!typeHit) continue;

      candidates.push(product);
    }

    if (candidates.length > 0) {
      // Fuzzy score tie-breaker
      const best = candidates.reduce((x, p) => fuzzyScore(p, scanName) > fuzzyScore(x, scanName) ? p : x);
      const pSpec = tokenizeSpec(`${best.name || ''} ${best.code || ''}`);
      const confidence = !ctx.hasScanSpec ? 'low'
                       : pSpec.size === ctx.scanSpec.size ? 'high'
                       : 'medium';
      return { productId: best._id, confidence };
    }

    return null;
  };

  // Hàm xử lý chọn ảnh hóa đơn và gửi lên AI quét
  const handleScanInvoiceSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Hiển thị ảnh xem trước
    setSelectedScanImage(URL.createObjectURL(file));
    setIsScanDialogOpen(true);
    setIsScanning(true);
    setScanResults([]);

    try {
      // Tải danh sách sản phẩm trước để lát khớp thủ công
      await loadAllProductsForScan();

      // Nén ảnh tại client
      const compressedFile = await compressImage(file);

      const res = await handleApiResponse(scanInventoryInvoice(compressedFile));

      if (res && res.success) {
        if (res.imageUrl) {
          setTempScanImageUrl(res.imageUrl);
        }
        // Áp dụng Level 1 Matching trên Frontend
        const items = res.items || [];
        const processedItems = items.map(item => {
          if (item.matchStatus) {
            return item;
          }
          const l1Match = performLevel1Matching(item, tempProductList, productDetails);
          if (l1Match) {
            return {
              ...item,
              matchedProductId: l1Match.productId,
              confidence: l1Match.confidence,
              matchStatus: "MATCHED",
              autoSelected: false,
              requiresReview: false,
            };
          }
          return item;
        });
        setScanResults(processedItems);
        toast.success("AI đã phân tích hóa đơn xong!");
      } else {
        toast.error(res?.message || "Không thể phân tích hóa đơn");
        setIsScanDialogOpen(false);
      }
    } catch (err) {
      console.error(err);
      toast.error("Lỗi khi tải ảnh và phân tích hóa đơn");
      setIsScanDialogOpen(false);
    } finally {
      setIsScanning(false);
      // Reset input file để có thể chọn lại cùng 1 file
      event.target.value = "";
    }
  };

  // Hàm xử lý upload ảnh hóa đơn thủ công
  const handleManualUploadSelect = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setIsScanning(true);
    const uploadedUrls = [];

    try {
      for (const file of files) {
        // Nén ảnh tại client thành WebP
        const compressedFile = await compressImage(file);

        const res = await handleApiResponse(
          uploadExportOrderImage(compressedFile)
        );

        if (res && res.success && res.imageUrl) {
          uploadedUrls.push(res.imageUrl);
        }
      }

      if (uploadedUrls.length > 0) {
        // Sử dụng functional update để tránh Race Condition và closure state
        setScannedImages((prev) => {
          const updated = [...prev, ...uploadedUrls];
          handleApiResponse(
            updateExportOrderMetadata(id, { images: updated })
          ).catch(err => console.error("Lỗi cập nhật ảnh hóa đơn:", err));
          return updated;
        });
        toast.success(`Đã đính kèm thành công ${uploadedUrls.length} ảnh hóa đơn!`);
      }
    } catch (err) {
      console.error("Lỗi khi đính kèm ảnh hóa đơn thủ công:", err);
      toast.error("Lỗi khi đính kèm ảnh hóa đơn");
    } finally {
      setIsScanning(false);
      event.target.value = "";
    }
  };

  // Hàm xóa ảnh hóa đơn đính kèm
  const handleDeleteScannedImage = async (indexToDelete) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa ảnh hóa đơn này?")) return;
    
    const imageUrlToDelete = scannedImages[indexToDelete];
    const newImages = scannedImages.filter((_, idx) => idx !== indexToDelete);
    
    try {
      await handleApiResponse(
        updateExportOrderMetadata(id, { images: newImages })
      );
      
      setScannedImages(newImages);

      if (imageUrlToDelete) {
        try {
          await handleApiResponse(deleteExportOrderImage(imageUrlToDelete));
        } catch (delErr) {
          console.error("Lỗi khi xóa file vật lý ảnh hóa đơn:", delErr);
        }
      }

      toast.success("Xóa ảnh hóa đơn thành công");
    } catch (err) {
      console.error("Lỗi khi cập nhật ảnh hóa đơn sau khi xóa:", err);
      toast.error("Lỗi khi cập nhật đơn hàng");
    }
  };

  // Hàm xác nhận nhập sản phẩm đã quét AI vào đơn hàng
  const handleConfirmScanImport = async () => {
    const unresolvedItems = scanResults.filter(
      (row) => row.matchStatus === "POSSIBLE_MATCH" && !row.matchedProductId
    );
    if (unresolvedItems.length > 0) {
      toast.error(`Còn ${unresolvedItems.length} sản phẩm cần chọn đúng phiên bản trước khi xác nhận.`);
      return;
    }

    // Lọc ra các dòng đã được chọn sản phẩm khớp
    const validItems = scanResults.filter((row) => row.matchedProductId);
    if (validItems.length === 0) {
      toast.error("Vui lòng đối khớp ít nhất một sản phẩm hợp lệ!");
      return;
    }

    const reviewItems = validItems.filter(
      (row) => row.autoSelected && row.requiresReview && row.matchedProductId !== "NEW_PRODUCT"
    );
    if (reviewItems.length > 0) {
      const reviewLines = reviewItems.slice(0, 10).map((row) => {
        const product = allProducts.find((item) => item._id === row.matchedProductId);
        return `• ${row.canonicalCode || row.code || row.rawScannedName} → ${product?.name || "Sản phẩm đã gợi ý"}`;
      });
      if (reviewItems.length > 10) {
        reviewLines.push(`• Và ${reviewItems.length - 10} sản phẩm khác`);
      }
      const approved = window.confirm(
        `Có ${reviewItems.length} sản phẩm được tự động chọn theo model nhưng DB đang dùng mã ngắn.\n\n${reviewLines.join("\n")}\n\nBạn đã kiểm tra và muốn tiếp tục?`
      );
      if (!approved) return;
    }

    setIsScanning(true);
    let addedCount = 0;
    let hasError = false;
    let updatedOrder = order;

    try {
      // Lấy chi tiết các sản phẩm đã có sẵn để cập nhật giá (loại trừ NEW_PRODUCT)
      const matchedIds = validItems
        .map((item) => item.matchedProductId)
        .filter((id) => id && id !== "NEW_PRODUCT");

      const productDetailsList = await fetchProductDetails(matchedIds);
      const productDetailsMap = productDetailsList.reduce((map, p) => {
        map[p._id] = p;
        return map;
      }, {});

      const brandMap = new Map();
      validItems
        .filter((row) => row.brandIsNew === true)
        .map((row) => String(row.brand || "").trim())
        .filter(Boolean)
        .forEach((brand) => {
          const key = brandKeyOf(brand);
          if (key && !brandMap.has(key)) {
            brandMap.set(key, brand);
          }
        });
      const newBrands = [...brandMap.values()];

      let brandFailCount = 0;
      for (const brand of newBrands) {
        try {
          const brandResult = await handleApiResponse(
            createInventoryBrand(brand),
            { ignoredStatuses: [400] }
          );
          if (!brandResult) {
            brandFailCount++;
            console.warn(`Không tạo được hãng mới (bỏ qua, vẫn nhập tiếp): ${brand}`);
          }
        } catch (error) {
          brandFailCount++;
          console.warn(`Lỗi khi tạo hãng mới (bỏ qua, vẫn nhập tiếp): ${brand}`, error);
        }
      }

      for (const row of validItems) {
        let productId = row.matchedProductId;
        let details = null;
        const isNewProduct = row.matchedProductId === "NEW_PRODUCT";

        if (productId === "NEW_PRODUCT") {
          // Tạo sản phẩm mới
          const importPriceNum = Number(row.price) || 0;
          const earnVal = 25;
          const hasPrice = importPriceNum > 0;
          const calculatedRetailPrice = hasPrice
            ? Math.ceil((importPriceNum * (1 + earnVal / 100)) / 1000) * 1000
            : 0;

          const newProductPayload = {
            type: "Chưa phân loại",
            name: row.rawScannedName || "Sản phẩm mới AI quét",
            code: row.canonicalCode || row.code || "",
            brand: row.brand && row.brand.trim() ? row.brand.trim() : "Chưa rõ",
            section: "Chưa phân loại",
            value: "Chưa rõ",
            vat: row.vat ? row.vat.toString() : "",
            warranty: "12 tháng",
            adjusted: false,
            variant: [
              {
                price: hasPrice ? calculatedRetailPrice.toString() : "",
                importPrice: hasPrice ? importPriceNum.toString() : "",
                earn: earnVal,
                quantityForSale: 0,
                quantityInStorage: 0,
                imgUrl: "",
                note: row.note || "",
              },
            ],
          };

          try {
            const createRes = await handleApiResponse(
              createInventoryProduct(newProductPayload)
            );

            if (createRes && createRes.product) {
              productId = createRes.product._id;
              details = createRes.product;
              // Thêm sản phẩm mới vào danh sách allProducts ở client
              setAllProducts((prev) => [createRes.product, ...prev]);
            } else {
              console.error("Không tạo được sản phẩm mới:", row.rawScannedName);
              hasError = true;
              continue;
            }
          } catch (err) {
            console.error("Lỗi khi tạo sản phẩm mới:", err);
            hasError = true;
            continue;
          }
        } else {
          details = productDetailsMap[productId];
          if (!details) continue;
          // Dữ liệu AI chỉ áp dụng cho dòng đơn hàng, không sửa giá/VAT/hãng của sản phẩm master.
        }

        // Tìm xem sản phẩm đã có sẵn trong đơn hàng hay chưa
        const existingProductIndex = tempProductList.findIndex(
          (p) => p.productId === productId
        );

        if (existingProductIndex !== -1) {
          const existingProduct = tempProductList[existingProductIndex];
          if (existingProduct.status) {
            // Đã hoàn thành thì bỏ qua không update đè
            continue;
          }

          const scannedQty = Number(row.quantity) || 0;
          const targetQty = Number(existingProduct.quantity) || 0;
          const finalQtyEx = Math.min(scannedQty, targetQty);
          const newQuantityEx = Math.max(existingProduct.quantityEx || 0, finalQtyEx);
          const delta = newQuantityEx - (existingProduct.quantityEx || 0);

          // Kiểm tra tồn kho trước khi xuất thêm (bỏ qua nếu là sản phẩm mới được tạo tự động)
          if (delta > 0 && !isNewProduct) {
            const currentInventory = details.variant?.[0]?.quantityInStorage || 0;
            const currentForSale = details.variant?.[0]?.quantityForSale || 0;

            if (currentInventory < delta || currentForSale < delta) {
              toast.error(
                `Số lượng không đủ để xuất thêm cho sản phẩm: ${details.name} (Cần thêm: ${delta}, Tồn kho: ${currentInventory}, Có thể bán: ${currentForSale})`
              );
              hasError = true;
              continue;
            }
          }

          // Cập nhật số lượng và đơn giá mới
          const updatedProduct = {
            ...existingProduct,
            price: (row.price ?? "0").toString(),
            quantityEx: newQuantityEx,
            status: newQuantityEx === targetQty,
            note: row.note || existingProduct.note || "",
            vat: row.vat || existingProduct.vat || "",
            isAIScan: true,
            skipStockUpdate: isNewProduct,
          };

          const resOrder = await handleApiResponse(
            updateExportOrderLine(id, existingProductIndex, updatedProduct)
          );

          if (resOrder) {
            updatedOrder = resOrder;
            addedCount++;
          } else {
            hasError = true;
          }
        } else {
          // Thêm mới sản phẩm vào đơn hàng
          const scannedQty = Number(row.quantity) || 0;

          // Kiểm tra tồn kho trước khi xuất sản phẩm mới (bỏ qua nếu là sản phẩm mới được tạo tự động)
          if (!isNewProduct) {
            const currentInventory = details.variant?.[0]?.quantityInStorage || 0;
            const currentForSale = details.variant?.[0]?.quantityForSale || 0;

            if (currentInventory < scannedQty || currentForSale < scannedQty) {
              toast.error(
                `Số lượng không đủ để xuất sản phẩm mới: ${details.name} (Cần xuất: ${scannedQty}, Tồn kho: ${currentInventory}, Có thể bán: ${currentForSale})`
              );
              hasError = true;
              continue;
            }
          }

          const newProduct = {
            productId,
            price: (row.price ?? "0").toString(),
            unit: row.unit || "cái",
            quantity: scannedQty,
            quantityEx: scannedQty,
            note: row.note || "",
            vat: row.vat || "",
            status: true,
            isAIScan: true,
            skipStockUpdate: isNewProduct,
          };

          const resOrder = await handleApiResponse(
            addExportOrderLine(id, newProduct)
          );

          if (resOrder) {
            updatedOrder = resOrder;
            addedCount++;
          } else {
            hasError = true;
          }
        }
      }

      // Cập nhật lại state đơn hàng cục bộ để hiển thị danh sách mới
      if (updatedOrder) {
        let finalOrder = updatedOrder;
        if (tempScanImageUrl) {
          const newImages = [...scannedImages, tempScanImageUrl];
          setScannedImages(newImages);
          setTempScanImageUrl(null);

          // Cập nhật trường images vào DB của đơn xuất hiện tại
          const imageUpdateRes = await handleApiResponse(
            updateExportOrderMetadata(id, { images: newImages })
          );
          if (imageUpdateRes) {
            finalOrder = imageUpdateRes;
          }
        }

        setOrder(finalOrder);
        setTempProductList(finalOrder.productList || []);

        // Cập nhật lại list chi tiết sản phẩm cho tất cả sản phẩm trong đơn hàng
        const allIds = updatedOrder.productList.map((p) => p.productId);
        const latestDetails = await fetchProductDetails(allIds);
        setProductDetails(latestDetails);

        // Cập nhật trạng thái tổng thể đơn hàng nếu cần
        const allCompleted = updatedOrder.productList.every((p) => p.status);
        if (allCompleted && !updatedOrder.status) {
          const statusUpdate = await handleApiResponse(
            setExportOrderStatus(id, true)
          );
          if (statusUpdate) {
            setOrder((prev) => ({ ...prev, status: true }));
          }
        } else if (!allCompleted && updatedOrder.status) {
          const statusUpdate = await handleApiResponse(
            setExportOrderStatus(id, false)
          );
          if (statusUpdate) {
            setOrder((prev) => ({ ...prev, status: false }));
          }
        }
      }

      if (hasError) {
        toast.error("Có lỗi xảy ra khi nhập một số sản phẩm.");
      } else {
        toast.success(
          `Đã tự động nhập/cập nhật thành công ${addedCount} sản phẩm từ hóa đơn${brandFailCount > 0 ? ` (${brandFailCount} hãng chưa tạo được)` : ""}!`
        );
      }
      setIsScanDialogOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Có lỗi xảy ra khi nhập sản phẩm vào đơn hàng.");
    } finally {
      setIsScanning(false);
    }
  };

  // Hàm lấy chi tiết sản phẩm
  const fetchProductDetails = async (productIds) => {
    if (!productIds || productIds.length === 0) return [];
    const result = await handleApiResponse(getInventoryProductsByIds(productIds));
    return Array.isArray(result?.products) ? result.products : [];
  };

  // Hàm lấy thông tin đơn hàng
  const fetchOrder = async () => {
    setLoading(true);
    const data = await handleApiResponse(getExportOrder(id));

    if (data) {
      setOrder(data);
      setScannedImages(data.images || []);
      if (Array.isArray(data.productList) && data.productList.length > 0) {
        const productIds = data.productList.map((item) => item.productId);
        const productDetailsData = await fetchProductDetails(productIds);
        setProductDetails(productDetailsData);
        setTempProductList(data.productList);
      } else {
        setTempProductList([]);
        setProductDetails([]);
      }
    } else {
      setTempProductList([]);
      setProductDetails([]);
    }
    setLoading(false);
  };

  // Tính toán danh sách sản phẩm làm giàu với useMemo
  const enrichedProductList = useMemo(() => {
    if (
      !order ||
      !Array.isArray(order.productList) ||
      !Array.isArray(productDetails)
    ) {
      return [];
    }

    return tempProductList
      .filter((item) => item && item.productId)
      .map((item) => {
        const product =
          productDetails.find((p) => p._id === item.productId.toString()) || {};
        if (!product._id) {
          console.warn(
            `Không tìm thấy sản phẩm với productId: ${item.productId}`
          );
        }
        return {
          ...item,
          name: product.name || "N/A",
          imgUrl: product.variant?.[0]?.imgUrl || "",
          brand: product.brand || "N/A",
          code: product.code || "N/A",
        };
      });
  }, [tempProductList, productDetails]);

  // Cập nhật enrichedOrder khi cần
  useEffect(() => {
    if (!order) return;
    setEnrichedOrder({
      ...order,
      productList: enrichedProductList,
      total: tempProductList.reduce(
        (sum, p) => sum + Number(p.price) * Number(p.quantity),
        0
      ),
    });
  }, [order, enrichedProductList]);

  // Hàm tìm kiếm tất cả sản phẩm
  const fetchAllProducts = async () => {
    const result = await handleApiResponse(
      searchInventoryOrderProducts({
        search: searchTerm.trim() || undefined,
      })
    );
    if (result) {
      setProducts(result.products || []);
    }
  };

  // Debounce thủ công cho tìm kiếm sản phẩm
  useEffect(() => {
    if (!openAddDialog) return;

    const delayDebounceFn = setTimeout(() => {
      if (searchTerm.trim() !== "") {
        fetchAllProducts();
      } else {
        setProducts([]);
      }
    }, 1000);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, openAddDialog]);

  // Hàm thêm sản phẩm vào đơn hàng
  const handleAddProduct = async (product) => {
    const newProduct = {
      productId: product._id,
      unit: "cái",
      quantity: 1,
      note: "",
      quantityEx: 0,
      status: false,
    };

    const updatedOrder = await handleApiResponse(
      addExportOrderLine(id, newProduct)
    );

    if (updatedOrder) {
      const allCompleted = updatedOrder.productList.every((p) => p.status);
      if (updatedOrder.status && !allCompleted) {
        const statusUpdate = await handleApiResponse(
          setExportOrderStatus(id, false)
        );
        if (statusUpdate) updatedOrder.status = false;
      }

      setOrder(updatedOrder);
      setTempProductList(updatedOrder.productList);
      const productIds = updatedOrder.productList.map((item) => item.productId);
      const newProductDetails = await fetchProductDetails(productIds);
      setProductDetails(newProductDetails);
      setOpenAddDialog(false);
      toast.success("Thêm sản phẩm thành công");
    }
  };

  // Hàm cập nhật tạm thời sản phẩm và lưu khi cần
  const handleTempUpdateProduct = async (
    productIndex,
    field,
    value,
    save = false
  ) => {
    let normalizedValue = value || "";
    if (field === "quantity") {
      normalizedValue = parseInt(value) || 0;
    } else if (field === "profitPercent" && value !== "") {
      normalizedValue = Number(value);
    }

    // Cập nhật tạm thời
    const updatedTempList = [...tempProductList];
    updatedTempList[productIndex] = {
      ...updatedTempList[productIndex],
      [field]: normalizedValue,
    };
    setTempProductList(updatedTempList);

    // Lưu vào server nếu save = true (khi nhấn Enter)
    if (save) {
      if (
        !order ||
        !order.productList ||
        productIndex >= order.productList.length
      ) {
        toast.error("Dữ liệu đơn hàng không hợp lệ");
        return;
      }

      if (
        field === "profitPercent" &&
        (!Number.isFinite(normalizedValue) || normalizedValue < 0 || normalizedValue > 100)
      ) {
        toast.error("% lợi nhuận phải từ 0 đến 100");
        setTempProductList(order.productList);
        return;
      }

      const updatedOrder = await handleApiResponse(
        updateExportOrderLine(id, productIndex, { [field]: normalizedValue })
      );

      if (updatedOrder) {
        setOrder(updatedOrder);
        setTempProductList(updatedOrder.productList);
        toast.success(`Cập nhật thành công`);
      } else {
        // Khôi phục nếu lưu thất bại
        setTempProductList(order.productList);
      }
    }
  };

  // Hàm xử lý số lượng xuất
  const handleExportQuantity = async (productIndex, received) => {
    if (
      !order ||
      !order.productList ||
      productIndex >= order.productList.length
    ) {
      toast.error("Dữ liệu đơn hàng không hợp lệ");
      return;
    }

    const receivedNum = parseInt(received);
    if (isNaN(receivedNum) || receivedNum <= 0) {
      toast.error("Vui lòng nhập số lượng xuất hợp lệ");
      return;
    }

    const currentQuantityEx = order.productList[productIndex].quantityEx || 0;
    const quantity = order.productList[productIndex].quantity;
    const newQuantityEx = currentQuantityEx + receivedNum;

    if (newQuantityEx > quantity) {
      toast.error("Số lượng xuất không được vượt quá số lượng đặt");
      return;
    }

    const productId = order.productList[productIndex].productId;

    // Kiểm tra tồn kho
    const productData = await handleApiResponse(getInventoryProduct(productId));
    if (!productData) {
      toast.error("Không tìm thấy thông tin sản phẩm");
      console.error("No product data for productId:", productId);
      return;
    }

    const currentInventory = productData.variant?.[0]?.quantityInStorage || 0;
    const currentForSale = productData.variant?.[0]?.quantityForSale || 0;

    if (currentInventory < receivedNum || currentForSale < receivedNum) {
      toast.error(
        `Số lượng không đủ (Tồn kho: ${currentInventory}, Có thể bán: ${currentForSale})`
      );
      return;
    }

    const updatedProduct = {
      ...order.productList[productIndex],
      quantityEx: newQuantityEx,
      status: newQuantityEx === quantity,
    };

    const updatedOrder = await handleApiResponse(
      updateExportOrderLine(id, productIndex, updatedProduct)
    );

    if (updatedOrder) {
      const allCompleted = updatedOrder.productList.every((p) => p.status);
      if (allCompleted && !updatedOrder.status) {
        const statusUpdate = await handleApiResponse(
          setExportOrderStatus(id, true)
        );
        if (statusUpdate) updatedOrder.status = true;
      }

      setOrder(updatedOrder);
      setTempProductList(updatedOrder.productList);
      setReceiveInput((prev) => ({ ...prev, [productIndex]: "" }));
      toast.success("Cập nhật số lượng xuất thành công");
    }
  };

  // Hàm xóa sản phẩm
  const handleDeleteProduct = async (productIndex) => {
    if (
      !order ||
      !order.productList ||
      productIndex >= order.productList.length
    ) {
      toast.error("Dữ liệu đơn hàng không hợp lệ");
      return;
    }

    if (order.productList[productIndex].quantityEx > 0) {
      toast.error("Không thể xóa sản phẩm đã xuất hàng");
      return;
    }

    const updatedOrder = await handleApiResponse(
      deleteExportOrderLine(id, productIndex)
    );

    if (updatedOrder) {
      if (!Array.isArray(updatedOrder.productList)) {
        console.error("Invalid productList in API response:", updatedOrder);
        toast.error("Dữ liệu trả về từ API không hợp lệ");
        return;
      }

      const validProductList = updatedOrder.productList.filter(
        (item) => item && item.productId
      );

      const allCompleted = validProductList.every((p) => p.status);
      if (allCompleted && !updatedOrder.status) {
        const statusUpdate = await handleApiResponse(
          setExportOrderStatus(id, true)
        );
        if (statusUpdate) updatedOrder.status = true;
      }

      setOrder({ ...updatedOrder, productList: validProductList });
      setTempProductList(validProductList);
      const productIds = validProductList.map((item) => item.productId);
      const newProductDetails = await fetchProductDetails(productIds);
      setProductDetails(
        Array.isArray(newProductDetails) ? newProductDetails : []
      );
      toast.success("Xóa sản phẩm thành công");
    }
  };

  // Hàm xóa đơn hàng
  const handleDeleteOrder = async () => {
    if (!window.confirm("Bạn có chắc muốn xóa đơn hàng này?")) return;

    try {
      const response = await deleteExportOrder(id);

      if (response.ok || response.status === 404) {
        toast.success("Xóa đơn hàng thành công");
        setTimeout(() => {
          navigate("/exportorder");
        }, 1000);
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || "Xóa đơn hàng thất bại");
      }
    } catch (err) {
      console.error(err);
      toast.error("Lỗi kết nối khi xóa đơn hàng");
    }
  };

  // Hàm cập nhật tên đơn hàng
  const handleUpdateOrderName = async (newOrderName, newNote) => {
    const updatedOrder = await handleApiResponse(
      updateExportOrderName(id, { orderName: newOrderName, note: newNote })
    );

    if (updatedOrder) {
      setOrder(updatedOrder);
      toast.success("Cập nhật đơn hàng thành công");

      await handleApiResponse(
        updateInventoryOrderHistoryName(id, newOrderName)
      );
    }
  };

  // Hàm sao chép đơn hàng
  const handleCopyOrder = async () => {
    if (!order) {
      toast.error("Không có đơn hàng để sao chép");
      return;
    }

    const copiedProductList = order.productList.map((product) => ({
      productId: product.productId,
      price: product.price,
      importPriceSnapshot: product.importPriceSnapshot,
      profitPercent: product.profitPercent,
      unit: product.unit,
      quantity: product.quantity,
      quantityEx: 0,
      note: product.note,
      status: false,
    }));

    const newOrderData = {
      orderName: `${order.orderName || "Đơn hàng"}_copy`,
      note: order.note || "",
      productList: copiedProductList,
    };

    const newOrder = await handleApiResponse(createExportOrder(newOrderData));

    if (newOrder) {
      toast.success("Sao chép đơn hàng thành công");
      navigate(`/exportorder/${newOrder._id}`);
    }
  };

  const handleOpenTemplateDialog = () => {
    setTemplateDisplayName(order?.orderName || "");
    setTemplateNote(order?.note || "");
    setIsTemplateDialogOpen(true);
  };

  const handleCloseTemplateDialog = () => {
    if (isCreatingTemplate) return;
    setIsTemplateDialogOpen(false);
  };

  const handleCreateTemplateFromOrder = async () => {
    if (!templateDisplayName.trim()) {
      toast.error("Vui lòng nhập tên đơn mẫu");
      return;
    }

    const sourceProducts = tempProductList.length > 0
      ? tempProductList
      : (order?.productList || []);
    const products = sourceProducts
      .filter((product) => product.productId)
      .map((product) => ({
        productId: product.productId,
        quantity: Math.max(1, Number(product.quantity) || 1),
      }));

    setIsCreatingTemplate(true);
    try {
      const result = await handleApiResponse(
        createInventoryOrderTemplate({
          displayName: templateDisplayName.trim(),
          note: templateNote.trim(),
          products,
        })
      );

      if (result) {
        toast.success("Tạo đơn mẫu thành công");
        setIsTemplateDialogOpen(false);
      }
    } finally {
      setIsCreatingTemplate(false);
    }
  };

  const handleTemplateInputKeyDown = (event) => {
    if (event.key !== "Enter" || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    handleCreateTemplateFromOrder();
  };

  // Hàm tạo đơn nhập từ đơn xuất
  const handleCreateImportOrder = async () => {
    if (!order) {
      toast.error("Không có đơn hàng để tạo đơn nhập");
      return;
    }

    const importProductList = order.productList.map((product) => ({
      productId: product.productId,
      price: product.price,
      unit: product.unit,
      quantity: product.quantity,
      quantityRe: 0,
      note: product.note,
      status: false,
    }));

    const newImportOrder = {
      orderName: `${order.orderName || "Đơn xuất"}_nhập`,
      note: order.note || "",
      productList: importProductList,
    };

    const createdOrder = await handleApiResponse(
      createImportOrderFromExport(newImportOrder)
    );

    if (createdOrder) {
      toast.success("Tạo đơn nhập thành công");
      navigate(`/importorder/${createdOrder._id}`);
    }
  };

  // Hàm xuất dữ liệu ra file Excel
  const handleExportToExcel = async () => {
    if (!enrichedProductList || enrichedProductList.length === 0) {
      toast.error("Không có dữ liệu để xuất");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Chi tiết đơn xuất");

    // Tiêu đề A1 (gộp ô A1:H1)
    const title = order?.orderName || `Đơn xuất ${id}`;
    worksheet.mergeCells("A1:H1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = title;
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };

    // Header row A2:H2
    const headerRow = [
      "STT",
      "Tên sản phẩm",
      "Mã sản phẩm",
      "Hãng",
      "Giá xuất",
      "Đơn vị",
      "Số lượng",
      "Ghi chú",
    ];
    worksheet.addRow(headerRow);
    const header = worksheet.getRow(2);
    header.font = { bold: true };
    header.alignment = { vertical: "middle", horizontal: "center" };
    header.eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD9E1F2" },
      };
    });

    // Dữ liệu sản phẩm
    enrichedProductList.forEach((product, index) => {
      const row = [
        index + 1,
        product.name || "N/A",
        product.code || "N/A",
        product.brand || "N/A",
        Number(product.price) || 0,
        product.unit
          ? product.unit.charAt(0).toUpperCase() + product.unit.slice(1)
          : "N/A",
        Number(product.quantity) || 0,
        product.note || "",
      ];
      worksheet.addRow(row);
    });

    // Định dạng các dòng dữ liệu
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 2) {
        row.alignment = { vertical: "middle", horizontal: "left" };
        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };

          if (colNumber === 5) {
            cell.numFmt = "#,##0";
          } else if (colNumber === 7) {
            cell.numFmt = "0";
          }
        });
      }
    });

    // Đặt chiều rộng cột
    worksheet.columns = [
      { width: 5 },
      { width: 40 },
      { width: 20 },
      { width: 15 },
      { width: 15 },
      { width: 10 },
      { width: 10 },
      { width: 30 },
    ];

    // Xuất file
    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = (order?.orderName || `Đơn xuất_${id}`).replace(
      /[\\/:*?"<>|]/g,
      "_"
    );
    saveAs(new Blob([buffer]), `${safeName}.xlsx`);
    toast.success("Xuất file Excel thành công");
  };

  // Hàm nhập Excel
  const handleFileUpload = async (event) => {
    setIsProcessingExcel(true);
    const file = event.target.files[0];
    if (!file) {
      toast.error("Vui lòng chọn file Excel");
      setIsProcessingExcel(false);
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const buffer = e.target.result;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        // Lấy worksheet đầu tiên hoặc worksheet theo tên nếu biết
        const worksheet =
          workbook.getWorksheet("Chi tiết đơn xuất") || workbook.worksheets[0];

        // Header nằm ở dòng 2
        const headerRow = worksheet.getRow(2);
        const headers = headerRow.values
          .slice(1)
          .map((h) => (typeof h === "string" ? h.trim() : h));

        const expectedHeaders = [
          "STT",
          "Tên sản phẩm",
          "Mã sản phẩm",
          "Hãng",
          "Giá xuất",
          "Đơn vị",
          "Số lượng",
          "Ghi chú",
        ];

        // Kiểm tra header đúng định dạng
        const isValidHeader = expectedHeaders.every((h, i) => h === headers[i]);
        if (!isValidHeader) {
          toast.error("File Excel không đúng định dạng hoặc thiếu cột");
          setIsProcessingExcel(false);
          return;
        }

        // Lấy dữ liệu từ dòng 3 trở đi
        const jsonData = [];
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber > 2) {
            const rowValues = row.values.slice(1);
            const obj = {};
            expectedHeaders.forEach((col, idx) => {
              obj[col] = rowValues[idx] !== undefined ? rowValues[idx] : null;
            });
            jsonData.push(obj);
          }
        });

        if (jsonData.length === 0) {
          toast.error("File Excel trống hoặc sai định dạng");
          setIsProcessingExcel(false);
          return;
        }

        // Lấy các mã sản phẩm hợp lệ
        const codes = jsonData
          .map((row) => row["Mã sản phẩm"]?.toString().trim())
          .filter((code) => code && code.trim() !== "");

        if (codes.length === 0) {
          toast.error("Không có mã sản phẩm hợp lệ trong file Excel");
          setIsProcessingExcel(false);
          return;
        }

        // Gọi API lấy dữ liệu sản phẩm theo mã
        const productData = await handleApiResponse(
          getInventoryProductsByCodes(codes)
        );

        if (!productData || !Array.isArray(productData.products)) {
          toast.error("Không lấy được dữ liệu sản phẩm từ API");
          setIsProcessingExcel(false);
          return;
        }

        const codeToIdMap = productData.products.reduce((map, product) => {
          map[product.code] = product._id;
          return map;
        }, {});

        const invalidCodes = [];
        const validProductIds = [];
        jsonData.forEach((row, index) => {
          const code = row["Mã sản phẩm"]?.trim();
          if (!code || !codeToIdMap[code]) {
            invalidCodes.push({ line: index + 3, code: code || "Thiếu mã" });
          } else {
            validProductIds.push(codeToIdMap[code]);
          }
        });

        // Lấy chi tiết sản phẩm cho tất cả productId hợp lệ trước
        const newProductDetails = await fetchProductDetails(validProductIds);
        let addedCount = 0;
        let hasError = false;
        let updatedOrder = order;

        for (const row of jsonData) {
          const code = row["Mã sản phẩm"]?.trim();
          const price = row["Giá xuất"];
          const unit = row["Đơn vị"];
          const quantity = row["Số lượng"];
          const note = row["Ghi chú"];

          if (!code || !codeToIdMap[code]) {
            hasError = true;
            continue;
          }

          const productId = codeToIdMap[code];
          const existingProductIndex = tempProductList.findIndex(
            (p) => p.productId === productId
          );

          if (existingProductIndex !== -1) {
            const existingProduct = tempProductList[existingProductIndex];
            if (existingProduct.status) {
              hasError = true;
              continue;
            }

            const updatedProduct = {
              ...existingProduct,
              price:
                price !== undefined && price !== null && price !== ""
                  ? typeof price === "string"
                    ? price.replace(/[^\d]/g, "")
                    : price.toString()
                  : existingProduct.price,
              unit:
                unit !== undefined && unit !== null && unit !== ""
                  ? unit
                  : existingProduct.unit,
              quantity:
                quantity !== undefined && quantity !== null && quantity !== ""
                  ? parseInt(quantity) || existingProduct.quantity
                  : existingProduct.quantity,
              note:
                note !== undefined && note !== null
                  ? String(note)
                  : existingProduct.note,
            };

            updatedOrder = await handleApiResponse(
              updateExportOrderLine(id, existingProductIndex, updatedProduct)
            );

            if (updatedOrder) {
              addedCount++;
            } else {
              hasError = true;
            }
          } else {
            const newProduct = {
              productId,
              price:
                price !== undefined && price !== null && price !== ""
                  ? typeof price === "string"
                    ? price.replace(/[^\d]/g, "")
                    : price.toString()
                  : "0",
              unit:
                unit !== undefined && unit !== null && unit !== ""
                  ? unit
                  : "cái",
              quantity:
                quantity !== undefined && quantity !== null && quantity !== ""
                  ? parseInt(quantity) || 1
                  : 1,
              note: note !== undefined && note !== null ? String(note) : "",
              quantityEx: 0,
              status: false,
            };

            updatedOrder = await handleApiResponse(
              addExportOrderLine(id, newProduct)
            );

            if (updatedOrder) {
              addedCount++;

              const allCompleted = updatedOrder.productList.every(
                (p) => p.status
              );
              if (updatedOrder.status && !allCompleted) {
                const statusUpdate = await handleApiResponse(
                  setExportOrderStatus(id, false)
                );
                if (statusUpdate) updatedOrder.status = false;
              }
            } else {
              hasError = true;
            }
          }
        }

        if (updatedOrder) {
          setOrder(updatedOrder);
          setTempProductList(updatedOrder.productList);
          setProductDetails(newProductDetails);
        }

        if (invalidCodes.length > 0) {
          toast.error("Có mã sản phẩm không hợp lệ hoặc không tồn tại");
          console.log("Các dòng chứa mã sản phẩm không hợp lệ:");
          invalidCodes.forEach(({ line, code }) => {
            console.log(`Dòng ${line}: Mã sản phẩm "${code}"`);
          });
        } else if (hasError) {
          toast.error("Có lỗi khi thêm/cập nhật sản phẩm");
        }

        if (addedCount > 0) {
          toast.success(`Thêm/Cập nhật thành công ${addedCount} sản phẩm`);
        } else if (!hasError) {
          toast.warn("Không có sản phẩm nào được thêm hoặc cập nhật");
        }
        setIsProcessingExcel(false);
      };

      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error("Lỗi khi đọc file Excel:", error);
      toast.error("Lỗi khi nhập file Excel");
      setIsProcessingExcel(false);
    }
  };

  // Hàm xử lý kéo thả sản phẩm
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = enrichedProductList.findIndex(
      (item, index) => `${item.productId}-${index}` === active.id
    );
    const newIndex = enrichedProductList.findIndex(
      (item, index) => `${item.productId}-${index}` === over.id
    );

    const reorderedList = [...tempProductList];
    const [movedItem] = reorderedList.splice(oldIndex, 1);
    reorderedList.splice(newIndex, 0, movedItem);

    setTempProductList(reorderedList);

    const updatedOrder = await handleApiResponse(
      reorderExportOrderLines(id, reorderedList)
    );

    if (updatedOrder) {
      setOrder(updatedOrder);
      setTempProductList(updatedOrder.productList);
      toast.success("Cập nhật thứ tự sản phẩm thành công");
    } else {
      setTempProductList(order.productList);
    }
  };

  const handleProductStatusChange = async (productIndex, product) => {
    if (!order || product.status) return;

    if (!window.confirm("Bạn có chắc muốn cập nhật trạng thái sản phẩm này?")) {
      return;
    }

    // 1. Gọi API setStatusAndQuantity
    const updatedOrder = await handleApiResponse(
      completeExportOrderLine(id, productIndex)
    );

    if (updatedOrder) {
      setOrder(updatedOrder);
      setTempProductList(updatedOrder.productList);
      toast.success("Cập nhật trạng thái & tồn kho thành công");
    } else {
      toast.error("Cập nhật trạng thái sản phẩm thất bại");
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [id]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={2}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={2}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box p={2} className="inventory-order-detail-page">
      <Box
        className="sticky-header"
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "minmax(680px, 760px) minmax(0, 1fr)",
          },
          columnGap: 2,
          rowGap: 1,
          alignItems: "start",
          border: "1.5px solid #9EADBF",
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" gutterBottom>
            Chi tiết đơn hàng #{id}
          </Typography>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "minmax(220px, 1fr) minmax(180px, 0.8fr) auto auto",
              },
              gap: 1,
              alignItems: "center",
              mb: 1.25,
            }}
          >
            <TextField
              label="Tên đơn hàng"
              value={order?.orderName || ""}
              onChange={(e) =>
                setOrder((prev) => ({ ...prev, orderName: e.target.value }))
              }
              size="small"
              fullWidth
              sx={orderMetadataFieldSx}
              disabled={!canEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleUpdateOrderName(order?.orderName || "", order?.note || "");
                }
              }}
            />
            <TextField
              label="Ghi chú"
              value={order?.note || ""}
              onChange={(e) =>
                setOrder((prev) => ({ ...prev, note: e.target.value }))
              }
              size="small"
              fullWidth
              sx={orderMetadataFieldSx}
              disabled={!canEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleUpdateOrderName(order?.orderName || "", order?.note || "");
                }
              }}
            />
            {canEdit && (
              <Button
                variant="contained"
                startIcon={<SaveOutlinedIcon />}
                onClick={() =>
                  handleUpdateOrderName(order?.orderName || "", order?.note || "")
                }
                sx={{ whiteSpace: "nowrap", height: 40 }}
              >
                Lưu thay đổi
              </Button>
            )}
            {(canEdit || canCreateRelatedOrder || canDelete) && (
              <IconButton
                aria-label="Mở menu thao tác đơn hàng"
                onClick={(event) => setMoreMenuAnchor(event.currentTarget)}
                sx={{
                  width: 40,
                  height: 40,
                  border: "1.5px solid #9EADBF",
                  borderRadius: "7px",
                }}
              >
                <MoreVertIcon />
              </IconButton>
            )}
          </Box>

          <Menu
            anchorEl={moreMenuAnchor}
            open={Boolean(moreMenuAnchor)}
            onClose={() => setMoreMenuAnchor(null)}
            disableScrollLock
          >
            {canEdit && (
              <MenuItem
                onClick={() => {
                  setMoreMenuAnchor(null);
                  handleCopyOrder();
                }}
              >
                <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Sao chép đơn</ListItemText>
              </MenuItem>
            )}
            {canCreateRelatedOrder && (
              <MenuItem
                onClick={() => {
                  setMoreMenuAnchor(null);
                  handleOpenTemplateDialog();
                }}
              >
                <ListItemIcon><PostAddIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Tạo đơn mẫu</ListItemText>
              </MenuItem>
            )}
            {canCreateRelatedOrder && (
              <MenuItem
                onClick={() => {
                  setMoreMenuAnchor(null);
                  handleCreateImportOrder();
                }}
              >
                <ListItemIcon><SwapHorizIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Nhập đơn</ListItemText>
              </MenuItem>
            )}
            {canDelete && <Divider />}
            {canDelete && (
              <MenuItem
                onClick={() => {
                  setMoreMenuAnchor(null);
                  handleDeleteOrder();
                }}
                sx={{ color: "error.main" }}
              >
                <ListItemIcon><DeleteIcon color="error" fontSize="small" /></ListItemIcon>
                <ListItemText>Xóa đơn</ListItemText>
              </MenuItem>
            )}
          </Menu>

          <Dialog
            open={isTemplateDialogOpen}
            onClose={handleCloseTemplateDialog}
            disableScrollLock
            fullWidth
            maxWidth="sm"
          >
            <DialogTitle>Tạo đơn mẫu từ đơn hiện tại</DialogTitle>
            <DialogContent>
              <Box
                sx={{
                  pt: 1.5,
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                  gap: 2,
                }}
              >
                <TextField
                  autoFocus
                  label="Tên đơn mẫu"
                  value={templateDisplayName}
                  onChange={(event) => setTemplateDisplayName(event.target.value)}
                  onKeyDown={handleTemplateInputKeyDown}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Ghi chú"
                  value={templateNote}
                  onChange={(event) => setTemplateNote(event.target.value)}
                  onKeyDown={handleTemplateInputKeyDown}
                  fullWidth
                  size="small"
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseTemplateDialog} disabled={isCreatingTemplate}>
                Hủy
              </Button>
              <Button
                variant="contained"
                onClick={handleCreateTemplateFromOrder}
                disabled={isCreatingTemplate || !templateDisplayName.trim()}
              >
                {isCreatingTemplate ? "Đang tạo..." : "Tạo đơn mẫu"}
              </Button>
            </DialogActions>
          </Dialog>

          <Box
            sx={{
              border: "1.5px solid #A7B5C6",
              borderRadius: "9px",
              px: 1.5,
              py: 1.25,
              mb: 1,
              backgroundColor: "#FBFCFE",
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 650, mb: 1 }}>
              Thêm / nhập sản phẩm
            </Typography>
            <Box display="flex" gap={1} flexWrap="wrap">
              {canEdit && (
                <Button
                  variant="outlined"
                  onClick={() => setOpenAddDialog(true)}
                  sx={blueOutlinedButtonSx}
                >
                  Thêm sản phẩm
                </Button>
              )}
              {canScanAi && (
                <Button
                  component="label"
                  variant="outlined"
                  startIcon={<AutoAwesomeIcon />}
                  disabled={isScanning}
                  sx={purpleOutlinedButtonSx}
                >
                  Quét hóa đơn AI
                  <VisuallyHiddenInput
                    type="file"
                    accept="image/*"
                    onChange={handleScanInvoiceSelect}
                  />
                </Button>
              )}
              {canAddImage && (
                <Button
                  component="label"
                  variant="outlined"
                  startIcon={<CloudUploadIcon />}
                  disabled={isScanning}
                  sx={blueOutlinedButtonSx}
                >
                  Thêm ảnh thủ công
                  <VisuallyHiddenInput
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleManualUploadSelect}
                  />
                </Button>
              )}
              {canExcel && (
                <Button
                  variant="outlined"
                  startIcon={<ImportExportIcon />}
                  endIcon={<ArrowDropDownIcon />}
                  onClick={(event) => setExcelMenuAnchor(event.currentTarget)}
                  disabled={isProcessingExcel}
                  sx={blueOutlinedButtonSx}
                >
                  Nhập/Xuất Excel
                </Button>
              )}
            </Box>
          </Box>

          <Menu
            anchorEl={excelMenuAnchor}
            open={Boolean(excelMenuAnchor)}
            onClose={() => setExcelMenuAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            disableScrollLock
            slotProps={{
              paper: {
                sx: { mt: 0.5, minWidth: 168 },
              },
            }}
          >
            <MenuItem
              onClick={() => {
                setExcelMenuAnchor(null);
                handleExportToExcel();
              }}
            >
              <ListItemIcon><CloudUploadIcon color="info" fontSize="small" /></ListItemIcon>
              <ListItemText>Xuất Excel</ListItemText>
            </MenuItem>
            <MenuItem component="label">
              <ListItemIcon><CloudDownloadIcon color="warning" fontSize="small" /></ListItemIcon>
              <ListItemText>Nhập Excel</ListItemText>
              <VisuallyHiddenInput
                type="file"
                accept=".xlsx, .xls"
                onChange={(event) => {
                  setExcelMenuAnchor(null);
                  handleFileUpload(event);
                  event.target.value = "";
                }}
              />
            </MenuItem>
          </Menu>

          <Typography variant="body1" className="total-summary-text">
            Tổng cộng: {Number(enrichedOrder?.total || 0).toLocaleString("vi-VN")}{" "}
            VNĐ
          </Typography>
        </Box>

        {scannedImages.length > 0 && (
          <Box
            sx={{
              minWidth: 0,
              width: "100%",
              justifySelf: "end",
              pt: { xs: 0, lg: 1.5 },
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75, color: "#526174" }}>
              Ảnh hóa đơn đính kèm ({scannedImages.length} ảnh):
            </Typography>
            <Box
              sx={{
                display: "flex",
                justifyContent: "flex-start",
                gap: 1,
                overflowX: "auto",
                pb: 0.5,
                scrollbarWidth: "thin",
                "&::-webkit-scrollbar": { height: 5 },
                "&::-webkit-scrollbar-thumb": { bgcolor: "#CBD5E1", borderRadius: 3 },
              }}
            >
              {scannedImages.map((imgUrl, index) => (
                <Box
                  key={index}
                  sx={{
                    position: "relative",
                    minWidth: 96,
                    width: 96,
                    height: 136,
                    border: "1.5px solid #9EADBF",
                    borderRadius: "8px",
                    overflow: "hidden",
                    boxShadow: "0 4px 12px rgba(16,42,67,0.18)",
                  }}
                >
                  <img
                    src={resolveInventoryOrderAssetUrl(imgUrl)}
                    alt={`Invoice page ${index + 1}`}
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }}
                    onClick={() => handleOpenLightbox(index)}
                  />
                  {canAddImage && (
                    <IconButton
                      size="small"
                      color="error"
                      sx={{
                        position: "absolute",
                        top: 2,
                        right: 2,
                        bgcolor: "rgba(255,255,255,0.92)",
                        "&:hover": { bgcolor: "white" },
                      }}
                      onClick={() => handleDeleteScannedImage(index)}
                    >
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>

      <Box className="inventory-order-list-region">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={canEdit ? handleDragEnd : undefined}
      >
        <TableContainer
          component={Paper}
          sx={{
            userSelect: "none",
            overflowX: "hidden",
            height: "100%",
            maxHeight: "none",
            border: "1.5px solid #9EADBF",
          }}
        >
          <Table
            stickyHeader
            size="small"
            sx={{
              width: "100%",
              tableLayout: "fixed",
              "& .MuiTableCell-root": {
                px: 0.6,
                py: 0.55,
                fontSize: "0.76rem",
                lineHeight: 1.25,
                overflow: "hidden",
                borderColor: "#C3CEDB",
              },
              "& .MuiTableCell-head": {
                fontWeight: 700,
                whiteSpace: "normal",
              },
              "& .MuiInputBase-input": {
                px: 0.75,
                py: 0.7,
                fontSize: "0.78rem",
                textAlign: "center",
              },
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: "#A7B5C6",
                borderWidth: "1.25px",
              },
              "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: "#71839A",
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell align="center" sx={{ width: 34 }}></TableCell>
                <TableCell align="center" sx={{ width: "14%" }}>Tên</TableCell>
                <TableCell align="center" sx={{ width: 52 }}>Hình ảnh</TableCell>
                <TableCell align="center" sx={{ width: "8%" }}>Mã</TableCell>
                <TableCell align="center" sx={{ width: "8%" }}>Hãng</TableCell>
                <TableCell align="center" sx={{ width: 72 }}>% lợi nhuận</TableCell>
                <TableCell align="center" sx={{ width: 96 }}>Giá xuất</TableCell>
                <TableCell align="center" sx={{ width: 62 }}>Đơn vị</TableCell>
                <TableCell align="center" sx={{ width: 72 }}>Số lượng xuất</TableCell>
                <TableCell align="center" sx={{ width: 60 }}>Đã xuất</TableCell>
                <TableCell align="center" sx={{ width: 76 }}>Nhập SL xuất</TableCell>
                <TableCell align="center" sx={{ width: "12%" }}>Ghi chú</TableCell>
                <TableCell align="center" sx={{ width: 64 }}>Trạng thái</TableCell>
                <TableCell align="center" sx={{ width: 42 }}></TableCell>
              </TableRow>
            </TableHead>
            <SortableContext
              items={
                enrichedProductList.map(
                  (item, index) => `${item.productId}-${index}`
                ) || []
              }
              strategy={verticalListSortingStrategy}
            >
              <TableBody>
                {enrichedProductList.length > 0 ? (
                  enrichedProductList.map((product, index) => (
                    <SortableTableRow
                      key={`${product.productId}-${index}`}
                      product={product}
                      index={index}
                      tempProductList={tempProductList}
                      handleTempUpdateProduct={handleTempUpdateProduct}
                      navigate={navigate}
                      receiveInput={receiveInput}
                      setReceiveInput={setReceiveInput}
                      handleExportQuantity={handleExportQuantity}
                      handleDeleteProduct={handleDeleteProduct}
                      handleProductStatusChange={handleProductStatusChange}
                      canEdit={canEdit}
                    />
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={14} align="center">
                      <Typography>Chưa có sản phẩm trong đơn hàng</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </SortableContext>
          </Table>
        </TableContainer>
      </DndContext>
      </Box>

      <Dialog open={openAddDialog} onClose={() => setOpenAddDialog(false)} disableScrollLock>
        <DialogTitle>Thêm sản phẩm vào đơn xuất</DialogTitle>
        <DialogContent>
          <Box mb={2} mt={2} sx={{ display: 'grid', gap: 2}}>
            <TextField
              label="Tìm theo tên hoặc mã sản phẩm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              variant="outlined"
              size="small"
              fullWidth
              autoFocus
            />
          </Box>
          {products.length > 0 ? (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Tên</TableCell>
                    <TableCell>Hình ảnh</TableCell>
                    <TableCell>Mã sản phẩm</TableCell>
                    <TableCell>Hãng</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {products.map((product) => (
                    <TableRow
                      key={product._id}
                      hover
                      onClick={() => handleAddProduct(product)}
                      style={{ cursor: "pointer" }}
                    >
                      <TableCell>{product.name}</TableCell>
                      <TableCell>
                        {product.variant?.[0]?.imgUrl ? (
  <img
    src={product.variant?.[0]?.imgUrl}
    alt={product.name || "Sản phẩm"}
    style={{
      width: "50px",
      height: "50px",
      objectFit: "cover",
    }}
  />
) : (
  "N/A"
)}
                      </TableCell>
                      <TableCell>{product.code || "N/A"}</TableCell>
                      <TableCell>{product.brand || "N/A"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography variant="body2" color="textSecondary" align="center">
              {searchTerm.trim() === ""
                ? "Nhập từ khóa để tìm kiếm sản phẩm"
                : "Không tìm thấy sản phẩm"}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAddDialog(false)}>Hủy</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Preview và Đối khớp hóa đơn AI */}
      <Dialog
        open={isScanDialogOpen}
        onClose={handleCancelScanDialog}
        disableScrollLock
        fullWidth={true}
        maxWidth={false}
        PaperProps={{ sx: { width: "95vw", maxWidth: "95vw" } }}
      >
        <DialogTitle sx={{ 
          bgcolor: '#512da8', 
          color: '#fff', 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1.5,
          py: 2 
        }}>
          <AutoAwesomeIcon />
          <Typography variant="h6" fontWeight="bold">AI Trích xuất & Đối khớp Hóa đơn</Typography>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Box sx={{ display: "flex", gap: 3, mt: 2, flexDirection: { xs: "column", md: "row" } }}>
            
            {/* Cột trái: Ảnh hóa đơn gốc */}
            <Box 
              ref={setWrapperRef}
              onMouseDown={handleScanMouseDown}
              onMouseMove={handleScanMouseMove}
              onMouseUp={handleScanMouseUp}
              onMouseLeave={handleScanMouseUp}
              sx={{ 
                width: "40%", 
                maxWidth: "40%", 
                flexShrink: 0,
                border: "1px solid rgba(0,0,0,0.12)", 
                borderRadius: "12px", 
                overflow: "hidden", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center", 
                bgcolor: "#fafafa",
                boxShadow: "inset 0 0 10px rgba(0,0,0,0.03)",
                p: 1,
                cursor: scanZoomScale > 1 ? (scanIsDragging ? 'grabbing' : 'grab') : 'default',
                position: 'relative'
              }}
            >
              {selectedScanImage ? (
                <img
                  src={selectedScanImage}
                  alt="Invoice Preview"
                  style={{ 
                    maxWidth: "100%", 
                    maxHeight: "650px", 
                    objectFit: "contain", 
                    borderRadius: "8px",
                    transform: `scale(${scanZoomScale}) translate(${scanPanOffset.x / scanZoomScale}px, ${scanPanOffset.y / scanZoomScale}px)`,
                    transformOrigin: "center center",
                    transition: scanIsDragging ? "none" : "transform 0.1s ease-out",
                    userSelect: "none",
                    pointerEvents: "none"
                  }}
                />
              ) : (
                <Typography color="text.secondary">Chưa chọn ảnh</Typography>
              )}
            </Box>

            {/* Cột phải: Danh sách kết quả từ AI */}
            <Box sx={{ width: "60%", maxWidth: "60%", flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              {isScanning ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, gap: 2 }}>
                  <CircularProgress size={50} thickness={4} sx={{ color: '#512da8' }} />
                  <Typography variant="body1" fontWeight="bold" color="text.primary" sx={{ 
                    animation: 'pulse 1.5s infinite ease-in-out',
                    '@keyframes pulse': {
                      '0%, 100%': { opacity: 0.6 },
                      '50%': { opacity: 1 }
                    }
                  }}>
                    AI đang phân tích hình ảnh và đối khớp với Database...
                  </Typography>
                  <Typography variant="body2" color="text.secondary">Quá trình này có thể mất từ 5 - 15 giây.</Typography>
                </Box>
              ) : scanResults.length > 0 ? (
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: "12px", maxHeight: "550px" }}>
                  <Table stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', width: '60px' }}>STT</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', minWidth: '220px' }}>Sản phẩm khớp (DB)</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Tên trên hóa đơn</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', width: '90px' }}>Số lượng</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', width: '130px' }}>Đơn giá</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', width: '130px' }}>Thành tiền</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', width: '80px' }}>VAT</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5', width: '60px' }}>Xóa</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {scanResults.map((row, index) => {
                        const NEW_PRODUCT_OPTION = {
                          _id: "NEW_PRODUCT",
                          name: "[NEW] Tạo sản phẩm mới",
                          brand: "",
                          code: ""
                        };
                        const matchedProduct = row.matchedProductId === "NEW_PRODUCT"
                          ? NEW_PRODUCT_OPTION
                          : allProducts.find((p) => p._id === row.matchedProductId);
                        const candidateIds = new Set(row.candidateProductIds || []);
                        const candidateProducts = allProducts.filter((product) => candidateIds.has(product._id));
                        const remainingProducts = allProducts.filter((product) => !candidateIds.has(product._id));
                        const productOptions = row.matchStatus === "POSSIBLE_MATCH"
                          ? [...candidateProducts, NEW_PRODUCT_OPTION, ...remainingProducts]
                          : [NEW_PRODUCT_OPTION, ...allProducts];
                        return (
                          <TableRow
                            key={index}
                            hover
                            sx={row.autoSelected && row.requiresReview ? { bgcolor: "#fff8e1" } : undefined}
                          >
                            <TableCell align="center">
                              <TextField
                                value={row.stt || ""}
                                size="small"
                                onChange={(e) => {
                                  const updated = [...scanResults];
                                  updated[index].stt = e.target.value;
                                  setScanResults(updated);
                                }}
                                inputProps={{ style: { textAlign: 'center', padding: '6px 4px' } }}
                                sx={{ width: "50px" }}
                              />
                            </TableCell>
                            <TableCell>
                              <Autocomplete
                                options={productOptions}
                                getOptionLabel={(option) => {
                                  if (!option) return "";
                                  if (option._id === "NEW_PRODUCT") return option.name;
                                  const brandStr = option.brand ? ` [${option.brand}]` : "";
                                  const codeStr = option.code ? ` (${option.code})` : "";
                                  return `${option.name}${codeStr}${brandStr}`;
                                }}
                                value={matchedProduct || null}
                                onChange={(event, newValue) => {
                                  const updated = [...scanResults];
                                  updated[index] = {
                                    ...updated[index],
                                    matchedProductId: newValue ? newValue._id : null,
                                    matchStatus: newValue
                                      ? (newValue._id === "NEW_PRODUCT" ? "NEW_PRODUCT" : "MATCHED")
                                      : ((updated[index].candidateProductIds || []).length > 0 ? "POSSIBLE_MATCH" : "NEW_PRODUCT"),
                                    autoSelected: false,
                                    requiresReview: false,
                                    userSelected: Boolean(newValue),
                                  };
                                  if (newValue && newValue.vat && !updated[index].vat?.toString().trim()) {
                                    updated[index].vat = newValue.vat;
                                  }
                                  setScanResults(updated);
                                }}
                                renderInput={(params) => (
                                  <TextField {...params} label="Chọn sản phẩm" size="small" variant="outlined" />
                                )}
                                size="small"
                                sx={{ minWidth: "220px" }}
                              />
                              {matchedProduct && (
                                <Typography variant="caption" display="block" sx={{ mt: 0.5, color: 'text.secondary', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                                  {matchedProduct._id === "NEW_PRODUCT" 
                                    ? matchedProduct.name 
                                    : `${matchedProduct.name}${matchedProduct.code ? ` (${matchedProduct.code})` : ""}${matchedProduct.brand ? ` [${matchedProduct.brand}]` : ""}`}
                                </Typography>
                              )}
                              {row.autoSelected && row.requiresReview && (
                                <Typography variant="caption" color="warning.dark" display="block" sx={{ mt: 0.5, fontWeight: 700 }}>
                                  ⚠ Đã tự chọn theo model — DB đang dùng mã ngắn. Vui lòng kiểm tra.
                                </Typography>
                              )}
                              {row.matchStatus === "POSSIBLE_MATCH" && !row.matchedProductId && (
                                <Typography variant="caption" color="warning.dark" display="block" sx={{ mt: 0.5, fontWeight: 700 }}>
                                  ⚠ {row.matchReason || "Có sản phẩm cùng model; vui lòng chọn đúng phiên bản."}
                                </Typography>
                              )}
                              {row.confidence === 'low' && (
                                <Typography variant="caption" color="warning.main" display="block" sx={{ mt: 0.5, fontWeight: 'bold' }}>
                                  ⚠️ Độ tin cậy thấp (Không có thông số kỹ thuật)
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary" fontWeight="medium">
                                {row.rawScannedName}
                              </Typography>
                              {(row.rawScannedCode || row.code) && (
                                <Typography variant="caption" display="block" color="text.secondary">
                                  Mã AI đọc: {row.rawScannedCode || row.code}
                                </Typography>
                              )}
                              {(row.canonicalCode || row.code) && (
                                <Typography variant="caption" display="block" color="primary.main" fontWeight={600}>
                                  Mã chuẩn: {row.canonicalCode || row.code}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell align="center">
                              <TextField
                                value={row.quantity}
                                type="number"
                                size="small"
                                onChange={(e) => {
                                  const updated = [...scanResults];
                                  updated[index].quantity = Math.max(1, parseInt(e.target.value) || 1);
                                  setScanResults(updated);
                                }}
                                inputProps={{ min: 1, style: { textAlign: 'center' } }}
                                sx={{ width: "80px" }}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <NumericFormat
                                value={row.price}
                                customInput={TextField}
                                thousandSeparator="."
                                decimalSeparator=","
                                size="small"
                                onValueChange={(values) => {
                                  const updated = [...scanResults];
                                  updated[index].price = parseInt(values.value) || 0;
                                  setScanResults(updated);
                                }}
                                sx={{ width: "120px" }}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" fontWeight="bold">
                                {((row.quantity || 0) * (row.price || 0)).toLocaleString("vi-VN")}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <TextField
                                value={row.vat || ""}
                                size="small"
                                onChange={(e) => {
                                  const updated = [...scanResults];
                                  updated[index].vat = e.target.value;
                                  setScanResults(updated);
                                }}
                                inputProps={{ style: { textAlign: 'center', padding: '6px 4px' } }}
                                sx={{ width: "70px" }}
                              />
                            </TableCell>
                            <TableCell align="center">
                              <IconButton
                                color="error"
                                size="small"
                                onClick={() => {
                                  const updated = scanResults.filter((_, idx) => idx !== index);
                                  setScanResults(updated);
                                }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Typography color="text.secondary">Không tìm thấy hoặc không đọc được sản phẩm nào từ hóa đơn.</Typography>
                </Box>
              )}
            </Box>

          </Box>
        </DialogContent>
        {scanResults.length > 0 && !isScanning && (
          <Box sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            px: 3,
            py: 1.5,
            bgcolor: "#f5f5f5",
            borderTop: "1px solid rgba(0,0,0,0.08)",
            borderBottom: "1px solid rgba(0,0,0,0.08)"
          }}>
            <Typography variant="body1" fontWeight="bold" color="text.primary">
              Tổng số lượng: <span style={{ color: '#512da8' }}>{scanResults.reduce((sum, item) => sum + (item.quantity || 0), 0).toLocaleString("vi-VN")}</span>
            </Typography>
            <Typography variant="subtitle1" fontWeight="bold" color="text.primary">
              Tổng đơn hàng trích xuất (tự tính): <span style={{ color: '#512da8', fontSize: '1.2rem' }}>{scanResults.reduce((sum, item) => sum + (item.quantity || 0) * (item.price || 0), 0).toLocaleString("vi-VN")}đ</span>
            </Typography>
          </Box>
        )}
        <DialogActions sx={{ p: 3, borderTop: scanResults.length > 0 && !isScanning ? 'none' : '1px solid rgba(0,0,0,0.08)' }}>
          <Button 
            onClick={() => {
              setIsScanDialogOpen(false);
              setTempScanImageUrl(null);
            }} 
            disabled={isScanning}
            variant="outlined" 
            color="inherit"
          >
            Hủy bỏ
          </Button>
          <Button 
            onClick={handleConfirmScanImport} 
            disabled={
              isScanning
              || scanResults.filter((row) => row.matchedProductId).length === 0
              || scanResults.some((row) => row.matchStatus === "POSSIBLE_MATCH" && !row.matchedProductId)
            }
            variant="contained" 
            sx={{
              bgcolor: '#512da8',
              "&:hover": { bgcolor: '#311b92' }
            }}
          >
            Xác nhận nhập
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Xem ảnh hóa đơn Zoom đa điểm trực tiếp */}
      <Dialog 
        open={lightboxOpen} 
        onClose={() => setLightboxOpen(false)}
        disableScrollLock
        maxWidth="lg"
        fullWidth
        PaperProps={{
          style: { 
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            color: 'white', 
            overflow: 'hidden',
            margin: 16,
            borderRadius: 12
          }
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 3, py: 1.5, borderBottom: '1px solid #333' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
            Chi tiết ảnh hóa đơn đính kèm (Ảnh {currentImgIndex + 1}/{scannedImages.length})
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button 
              variant="outlined" 
              color="inherit" 
              onClick={handleRotate}
              sx={{ borderColor: '#555', color: '#fff', '&:hover': { borderColor: '#888' } }}
            >
              🔄 Quay ảnh 90°
            </Button>
            <Button 
              variant="outlined" 
              color="inherit" 
              onClick={handleResetZoom}
              sx={{ borderColor: '#555', color: '#fff', '&:hover': { borderColor: '#888' } }}
            >
              🔍 Reset Zoom
            </Button>
            <Button 
              variant="contained" 
              color="error" 
              onClick={() => setLightboxOpen(false)}
              sx={{ minWidth: 80 }}
            >
              Đóng [X]
            </Button>
          </Box>
        </Box>

        <DialogContent 
          ref={containerCallbackRef}
          sx={{ 
            p: 0, 
            bgcolor: '#000', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            position: 'relative',
            height: '75vh',
            overflow: 'hidden',
            cursor: zoomScale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {scannedImages.length > 0 && (
            <>
              {/* Nút Previous */}
              {scannedImages.length > 1 && (
                <IconButton
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentImgIndex((prev) => (prev - 1 + scannedImages.length) % scannedImages.length);
                  }}
                  sx={{ 
                    position: 'absolute', 
                    left: 16, 
                    zIndex: 10, 
                    color: '#fff', 
                    bgcolor: 'rgba(255,255,255,0.1)', 
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' } 
                  }}
                >
                  ◀
                </IconButton>
              )}

              {/* Ảnh chính */}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  width: '100%',
                  height: '100%',
                  userSelect: 'none'
                }}
              >
                <img 
                  key={scannedImages[currentImgIndex]}
                  src={resolveInventoryOrderAssetUrl(scannedImages[currentImgIndex])}
                  alt={`Trang hóa đơn ${currentImgIndex + 1}`} 
                  draggable={false}
                  style={{
                    transform:
                      position.x === 0 &&
                      position.y === 0 &&
                      rotation === 0 &&
                      zoomScale === 1
                        ? 'none'
                        : `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scale(${zoomScale})`,
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                    maxWidth: '100%',
                    maxHeight: '75vh',
                    width: 'auto',
                    height: 'auto',
                    display: 'block',
                    objectFit: 'contain',
                    imageRendering: 'auto',
                    pointerEvents: 'none'
                  }}
                />
              </Box>

              {/* Nút Next */}
              {scannedImages.length > 1 && (
                <IconButton
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentImgIndex((prev) => (prev + 1) % scannedImages.length);
                  }}
                  sx={{ 
                    position: 'absolute', 
                    right: 16, 
                    zIndex: 10, 
                    color: '#fff', 
                    bgcolor: 'rgba(255,255,255,0.1)', 
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' } 
                  }}
                >
                  ▶
                </IconButton>
              )}
            </>
          )}
        </DialogContent>

        <Box sx={{ textAlign: 'center', py: 1.5, bgcolor: '#111', color: '#aaa', fontSize: 13 }}>
          💡 Mẹo: Lăn chuột để phóng to/thu nhỏ. Giữ chuột trái và di chuyển để kéo ảnh. Đã tự động nhớ góc xoay cho từng ảnh.
        </Box>
      </Dialog>
    </Box>
  );
};

export default ExportOrderDetail;
