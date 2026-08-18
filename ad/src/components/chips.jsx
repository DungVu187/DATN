
import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TablePagination,
} from "@mui/material";
import "./style/chips.css";
import toast from "react-hot-toast";
import {
  addChipValue,
  addProductSectionValue,
  deleteProductSectionImage,
  deleteProductSectionValue,
  getChipValues,
  getProductSectionDevices,
  getProductSections,
  removeChipValue,
  updateProductSectionImage,
  updateProductSectionValue,
  uploadProductSectionImage,
} from "../api/productManagementApi";

const Chips = ({ onlySection = false }) => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const showOnlySection = onlySection || searchParams.get("onlySection") === "true";

  const [colorRows, setColorRows] = useState([]);
  const [shapeRows, setShapeRows] = useState([]);
  const [frameRows, setFrameRows] = useState([]);
  const [buttonRows, setButtonRows] = useState([]);

  const [openDialog, setOpenDialog] = useState(false);
  const [chipValue, setChipValue] = useState("");
  const [chipType, setChipType] = useState("");

  const [selectedChip, setSelectedChip] = useState(null);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);

  const [colorPagination, setColorPagination] = useState({
    page: 0,
    rowsPerPage: 10,
  });
  const [shapePagination, setShapePagination] = useState({
    page: 0,
    rowsPerPage: 10,
  });
  const [framePagination, setFramePagination] = useState({
    page: 0,
    rowsPerPage: 10,
  });
  const [buttonPagination, setButtonPagination] = useState({
    page: 0,
    rowsPerPage: 10,
  });

  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState(""); // Thêm state mới cho section được chọn
  const [sectionDevices, setSectionDevices] = useState([]);
  const [devicePagination, setDevicePagination] = useState({
    page: 0,
    rowsPerPage: 10,
  });
  const [openValueDialog, setOpenValueDialog] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [sectionImageUrl, setSectionImageUrl] = useState(null);
  const [currentImageFilename, setCurrentImageFilename] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [editDeviceValue, setEditDeviceValue] = useState("");
  const fileInputRef = useRef();

  const handleSectionChange = (event, newValue) => {
    setSelectedSection(newValue);
    setDevicePagination({ page: 0, rowsPerPage: 10 });
  };

  const handleDevicePageChange = (event, newPage) => {
    setDevicePagination((prev) => ({ ...prev, page: newPage }));
  };

  const handleDeviceRowsPerPageChange = (event) => {
    setDevicePagination({
      page: 0,
      rowsPerPage: parseInt(event.target.value, 10),
    });
  };

  const renderDeviceTable = () => {
    if (!selectedSection || sectionDevices.length === 0) {
      return null;
    }

    const paginatedDevices = sectionDevices.slice(
      devicePagination.page * devicePagination.rowsPerPage,
      devicePagination.page * devicePagination.rowsPerPage +
        devicePagination.rowsPerPage
    );

    const handleRowClick = (device) => {
      setSelectedDevice(device);
      setEditDeviceValue(device);
    };

    const handleClose = () => {
      setSelectedDevice(null);
      setEditDeviceValue("");
    };

    const handleUpdate = async () => {
      try {
        const { ok, data } = await updateProductSectionValue(
          selectedSection,
          selectedDevice,
          editDeviceValue,
        );

        if (!ok) {
          throw new Error(data.message || "Cập nhật thất bại");
        }

        toast.success("Cập nhật thiết bị thành công!");
        fetchSectionDevices(selectedSection); // Refresh data
        handleClose();
      } catch (error) {
        console.error("Error updating device:", error);
        toast.error(error.message || "Lỗi khi cập nhật thiết bị");
      }
    };

    const handleDelete = async () => {
      try {
        const { ok, data } = await deleteProductSectionValue(
          selectedSection,
          selectedDevice,
        );

        if (!ok) {
          throw new Error(data.message || "Xóa thất bại");
        }

        toast.success("Xóa thiết bị thành công!");
        fetchSectionDevices(selectedSection); // Refresh data
        handleClose();
      } catch (error) {
        console.error("Error deleting device:", error);
        toast.error(error.message || "Lỗi khi xóa thiết bị");
      }
    };

    return (
      <div className="chip-table-container">
        <h3>Thiết bị trong {selectedSection}</h3>
        <Table>
          <TableBody>
            {paginatedDevices.map((device, index) => (
              <TableRow
                key={index}
                onClick={() => handleRowClick(device)}
                style={{ cursor: "pointer" }}
              >
                <TableCell>{device}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={sectionDevices.length}
          page={devicePagination.page}
          onPageChange={handleDevicePageChange}
          rowsPerPage={devicePagination.rowsPerPage}
          onRowsPerPageChange={handleDeviceRowsPerPageChange}
        />

        {/* Dialog chỉnh sửa/xóa */}
        <Dialog open={selectedDevice !== null} onClose={handleClose} disableScrollLock>
          <DialogTitle>Chỉnh sửa thiết bị</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="Giá trị"
              fullWidth
              variant="outlined"
              value={editDeviceValue}
              onChange={(e) => setEditDeviceValue(e.target.value)}
              sx={{ marginTop: 2 }}
              size="small"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleDelete} color="error" variant="contained">
              Xóa
            </Button>
            <Button onClick={handleUpdate} color="primary" variant="contained">
              Sửa
            </Button>
            <Button onClick={handleClose} color="secondary" variant="outlined">
              Hủy
            </Button>
          </DialogActions>
        </Dialog>
      </div>
    );
  };

  const fetchData = async () => {
    const data = await getChipValues();
    setColorRows(
      data.Color.map((color, index) => ({
        id: index + 1,
        type: "Color",
        value: color,
      }))
    );
    setShapeRows(
      data.Shapes.map((shape, index) => ({
        id: index + 1,
        type: "Shapes",
        value: shape,
      }))
    );
    setFrameRows(
      data.Frames.map((frame, index) => ({
        id: index + 1,
        type: "Frames",
        value: frame,
      }))
    );
    setButtonRows(
      data.ButtonCount.map((button, index) => ({
        id: index + 1,
        type: "ButtonCount",
        value: button,
      }))
    );
  };

  const fetchSections = async () => {
    try {
      setSections(await getProductSections());
    } catch (error) {
      console.error("Error fetching section:", error);
    }
  };

const fetchSectionDevices = async (sectionName) => {
  try {
    const { devices, image } = await getProductSectionDevices(sectionName);
    if (image !== undefined) {
      setSectionImageUrl(image.imgUrl);
      setCurrentImageFilename(image.filename);
    }
    setSectionDevices(devices);
  } catch (error) {
    console.error("Error fetching section devices:", error);
    setSectionDevices([]);
  }
};

  useEffect(() => {
    fetchData();
    fetchSections();
  }, []);

  useEffect(() => {
    if (selectedSection) {
      fetchSectionDevices(selectedSection);
    } else {
      setSectionDevices([]); // Reset khi không có section được chọn
    }
  }, [selectedSection]);

  const handleOpenDialog = () => setOpenDialog(true);
  const handleCloseDialog = () => {
    setOpenDialog(false);
    setChipType("");
    setChipValue("");
  };

  const handleOpenValueDialog = () => setOpenValueDialog(true);
  const handleCloseValueDialog = () => setOpenValueDialog(false);

  const handleChipValueChange = (event) => setChipValue(event.target.value);
  const handleChipTypeChange = (event) => setChipType(event.target.value);

  const handleAddChip = async () => {
    if (!chipType || !chipValue.trim()) {
      toast.error("Vui lòng chọn loại và nhập giá trị!");
      return;
    }
    const { ok, data } = await addChipValue(chipType, chipValue.trim());

    if (ok) {
      toast.success("Thêm chip thành công!");
      fetchData();
      handleCloseDialog();
    } else {
      toast.error(data.message || "Có lỗi xảy ra khi thêm chip.");
    }
  };

  const handleRowClick = (chip) => {
    setSelectedChip(chip);
    setOpenDeleteDialog(true);
  };

  const handleDeleteChip = async () => {
    if (!selectedChip) return;

    const removed = await removeChipValue(
      selectedChip.type,
      selectedChip.value,
    );

    if (removed) {
      toast.success("Xóa chip thành công!");
      fetchData();
      setOpenDeleteDialog(false);
    } else {
      alert("Có lỗi xảy ra khi xóa chip.");
    }
  };

  const handleColorPageChange = (event, newPage) => {
    setColorPagination((prev) => ({ ...prev, page: newPage }));
  };

  const handleColorRowsPerPageChange = (event) => {
    setColorPagination({
      page: 0,
      rowsPerPage: parseInt(event.target.value, 10),
    });
  };

  const handleShapePageChange = (event, newPage) => {
    setShapePagination((prev) => ({ ...prev, page: newPage }));
  };

  const handleShapeRowsPerPageChange = (event) => {
    setShapePagination({
      page: 0,
      rowsPerPage: parseInt(event.target.value, 10),
    });
  };

  const handleFramePageChange = (event, newPage) => {
    setFramePagination((prev) => ({ ...prev, page: newPage }));
  };

  const handleFrameRowsPerPageChange = (event) => {
    setFramePagination({
      page: 0,
      rowsPerPage: parseInt(event.target.value, 10),
    });
  };

  const handleButtonPageChange = (event, newPage) => {
    setButtonPagination((prev) => ({ ...prev, page: newPage }));
  };

  const handleButtonRowsPerPageChange = (event) => {
    setButtonPagination({
      page: 0,
      rowsPerPage: parseInt(event.target.value, 10),
    });
  };

  const addValueToSection = async (sectionName, newValue) => {
    try {
      const { ok, data } = await addProductSectionValue(sectionName, newValue);

      if (!ok) {
        throw new Error(data.message || "Có lỗi xảy ra");
      }

      toast.success("Thêm giá trị thành công!");
      handleCloseValueDialog();
      fetchSectionDevices(selectedSection);
      setNewValue("");
    } catch (error) {
      console.error("Lỗi:", error.message);
      toast.error("Lỗi khi thêm giá trị!");
    }
  };

  const renderTable = (
    rows,
    title,
    pagination,
    onPageChange,
    onRowsPerPageChange
  ) => {
    const paginatedRows = rows.slice(
      pagination.page * pagination.rowsPerPage,
      pagination.page * pagination.rowsPerPage + pagination.rowsPerPage
    );

    return (
      <div className="chip-table-container">
        <h3>{title}</h3>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Giá trị</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedRows.map((row) => (
              <TableRow
                key={row.id}
                onClick={() => handleRowClick(row)}
                style={{ cursor: "pointer" }}
              >
                <TableCell>{row.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={rows.length}
          page={pagination.page}
          onPageChange={onPageChange}
          rowsPerPage={pagination.rowsPerPage}
          onRowsPerPageChange={onRowsPerPageChange}
        />
      </div>
    );
  };

  const handleImageUpload = async (event) => {
  const file = event.target.files[0];
  if (!file || !selectedSection) return;

  try {
    const { ok, data: uploadData } = await uploadProductSectionImage(file);
    if (!ok) throw new Error("Lỗi upload ảnh");
    const newImgUrl = uploadData.imgUrl;
    const newFilename = newImgUrl.split("/").pop();

    // Nếu đã có ảnh cũ => xoá
    if (currentImageFilename) {
      await deleteProductSectionImage(currentImageFilename);
    }

    // Gửi API cập nhật imgUrl cho section
    await updateProductSectionImage(
      selectedSection,
      sectionDevices[0],
      newImgUrl,
    );

    setSectionImageUrl(newImgUrl);
    setCurrentImageFilename(newFilename);
    toast.success("Cập nhật ảnh thành công!");
  } catch (err) {
    toast.error(err.message || "Upload ảnh thất bại");
  }
};

  return (
    <div className="chip-main-container">
      <div className="sticky-header">
        <h2>Quản lý cụm thiết bị</h2>
        <div style={{ display: "flex", gap: "30px", alignItems: "center" }}>
          <Autocomplete
            options={sections}
            getOptionLabel={(option) => option}
            value={selectedSection}
            onChange={handleSectionChange}
            size="small"
            sx={{ width: 200 }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Chọn cụm"
                variant="outlined"
                sx={{ bgcolor: "white" }}
              />
            )}
          />
          <Button
            sx={{ height: "40px", margin: "auto 0", justifyContent: "center" }}
            variant="contained"
            disabled={!selectedSection}
            onClick={handleOpenValueDialog}
          >
            Thêm thiết bị
          </Button>
          {selectedSection && (
            <div style={{ marginLeft: 20 }}>
              {sectionDevices.length > 0 && sectionImageUrl ? (
                <img
                  src={sectionImageUrl}
                  alt="section"
                  style={{
                    width: 100,
                    height: 100,
                    objectFit: "cover",
                    cursor: "pointer",
                  }}
                  onClick={() => fileInputRef.current?.click()}
                />
              ) : (
                <Button
                  variant="outlined"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Thêm ảnh
                </Button>
              )}
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleImageUpload}
              />
            </div>
          )}
        </div>
      </div>
      {renderDeviceTable()}

      {!showOnlySection && (
        <>
          <h2>Danh mục Chip</h2>
          <Button
            variant="contained"
            sx={{ width: 200, margin: 2 }}
            onClick={handleOpenDialog}
          >
            Thêm Chip
          </Button>
          <div className="chip-content-container">
            {renderTable(
              colorRows,
              "Màu sắc",
              colorPagination,
              handleColorPageChange,
              handleColorRowsPerPageChange
            )}
            {renderTable(
              shapeRows,
              "Hình dáng",
              shapePagination,
              handleShapePageChange,
              handleShapeRowsPerPageChange
            )}
            {renderTable(
              frameRows,
              "Viền",
              framePagination,
              handleFramePageChange,
              handleFrameRowsPerPageChange
            )}
            {renderTable(
              buttonRows,
              "Số nút",
              buttonPagination,
              handleButtonPageChange,
              handleButtonRowsPerPageChange
            )}
          </div>

          <Dialog open={openDialog} onClose={handleCloseDialog} disableScrollLock>
            <DialogTitle>Thêm Chip</DialogTitle>
            <DialogContent>
              <FormControl fullWidth sx={{ marginTop: 2 }}>
                <InputLabel size="small">Loại Chip</InputLabel>
                <Select
                  value={chipType}
                  onChange={handleChipTypeChange}
                  label="Loại Chip"
                  size="small"
                >
                  <MenuItem value="Color">Màu</MenuItem>
                  <MenuItem value="Shapes">Dáng</MenuItem>
                  <MenuItem value="Frames">Viền</MenuItem>
                  <MenuItem value="ButtonCount">Số nút</MenuItem>
                </Select>
              </FormControl>
              <TextField
                autoFocus
                margin="dense"
                label="Giá trị"
                fullWidth
                variant="outlined"
                value={chipValue}
                onChange={handleChipValueChange}
                size="small"
                sx={{ marginTop: 2 }}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={handleAddChip} color="success" variant="contained">
                Thêm
              </Button>
              <Button
                onClick={handleCloseDialog}
                color="secondary"
                variant="outlined"
              >
                Đóng
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog
            open={openDeleteDialog}
            onClose={() => setOpenDeleteDialog(false)}
            disableScrollLock
          >
            <DialogTitle>Xác nhận xóa</DialogTitle>
            <DialogContent>
              <p>Bạn có chắc chắn muốn xóa chip này?</p>
              <p>
                <strong>{selectedChip ? selectedChip.value : ""}</strong>
              </p>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleDeleteChip} color="error" variant="contained">
                Có
              </Button>
              <Button
                onClick={() => setOpenDeleteDialog(false)}
                color="secondary"
                variant="outlined"
              >
                Hủy
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}

      {/* Dialog thêm thiết bị */}
      <Dialog open={openValueDialog} onClose={handleCloseValueDialog} disableScrollLock>
        <DialogTitle>Thêm thiết bị</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Giá trị mới"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            sx={{ marginTop: 2 }}
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseValueDialog} color="secondary">
            Hủy
          </Button>
          <Button
            onClick={() => addValueToSection(selectedSection, newValue)}
            color="primary"
          >
            Xác nhận
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default Chips;
