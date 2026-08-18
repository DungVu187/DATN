
import React, { useEffect, useState } from "react";
import {
  Box,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Pagination,
  FormControl,
  Select,
  MenuItem,
  TextField,
  Button,
  Chip,
  Autocomplete,
} from "@mui/material";
import moment from "moment";
import { useNavigate } from "react-router-dom";
import { getAccountPermissionCatalog } from "../api/accountApi";
import { getAdminActivityLogs } from "../api/adminAuditApi";
import {
  ACTIVITY_ACTION_LABELS,
  buildActivityPermissionLabels,
  formatActivityTarget,
  formatActivityValue,
  getActivityActionLabel,
  getActivityFieldLabel,
} from "../utils/activityLogFormatting";

const removeVietnameseTones = (str) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
};

// Màu sắc cho từng loại thao tác
const ACTION_COLORS = {
  create_product: "success",
  update_product: "primary",
  delete_product: "error",
  update_variant: "info",
  update_earn: "warning",
  update_import_price: "warning",
  toggle_display: "default",
  add_variant: "success",
  delete_variant: "error",
};

const getActionColor = (action) => {
  if (ACTION_COLORS[action]) return ACTION_COLORS[action];
  if (!action) return "default";
  if (action.startsWith("create_") || action.startsWith("add_")) return "success";
  if (action.startsWith("delete_") || action.startsWith("remove_")) return "error";
  if (action.startsWith("update_")) return "primary";
  return "default";
};

const ActivityLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit, setLimit] = useState(20);
  const [actionLabels, setActionLabels] = useState(ACTIVITY_ACTION_LABELS);
  const [permissionLabels, setPermissionLabels] = useState(
    buildActivityPermissionLabels(),
  );
  const [references, setReferences] = useState({ products: {} });

  // bộ lọc
  const [userName, setUserName] = useState("");
  const [productName, setProductName] = useState("");
  const [action, setAction] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // debounced values cho tìm kiếm chữ
  const [debouncedUserName, setDebouncedUserName] = useState("");
  const [debouncedProductName, setDebouncedProductName] = useState("");

  const navigate = useNavigate();

  const uniqueUserNames = React.useMemo(() => {
    const names = logs.map((log) => log.userName).filter(Boolean);
    return Array.from(new Set(names));
  }, [logs]);

  const uniqueProductNames = React.useMemo(() => {
    const names = logs.map((log) => log.productName).filter(Boolean);
    return Array.from(new Set(names)).map((value) => ({
      value,
      label: formatActivityTarget(value),
    }));
  }, [logs]);

  const selectedProductName = React.useMemo(
    () => uniqueProductNames.find((option) => option.value === productName) || productName,
    [productName, uniqueProductNames],
  );

  useEffect(() => {
    let active = true;

    getAccountPermissionCatalog()
      .then((data) => {
        if (active && data?.catalog) {
          setPermissionLabels(buildActivityPermissionLabels(data.catalog));
        }
      })
      .catch((error) => {
        console.error("Không thể tải nhãn quyền hạn:", error);
      });

    return () => {
      active = false;
    };
  }, []);

  // Debounce hiệu ứng gõ phím
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedUserName(userName);
    }, 500);
    return () => clearTimeout(handler);
  }, [userName]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedProductName(productName);
    }, 500);
    return () => clearTimeout(handler);
  }, [productName]);

  const fetchLogs = async (currentPage = page, currentUserName = debouncedUserName, currentProductName = debouncedProductName) => {
    try {
      setLoading(true);
      const res = await getAdminActivityLogs({
        page: currentPage,
        limit,
        ...(currentUserName && { userName: currentUserName }),
        ...(currentProductName && { productName: currentProductName }),
        ...(action && { action }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });
      if (!res.ok) throw new Error("Lỗi khi tải dữ liệu lịch sử hoạt động");
      const data = await res.json();
      setLogs(data.logs || []);
      setTotalPages(data.totalPages || 1);
      setActionLabels((current) => ({ ...current, ...(data.actionLabels || {}) }));
      setReferences(data.references || { products: {} });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Tự động gọi API khi bất kỳ bộ lọc hoặc trang nào thay đổi
  useEffect(() => {
    fetchLogs(page, debouncedUserName, debouncedProductName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, startDate, endDate, action, debouncedUserName, debouncedProductName]);

  const handleResetFilters = () => {
    setUserName("");
    setProductName("");
    setAction("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  return (
    <Box className="admin-list-page">
      <Typography variant="h5" mb={2} fontWeight="bold">
        Lịch sử hoạt động
      </Typography>

      <Box className="admin-list-controls" display="flex" gap={1} flexWrap="wrap" mb={2} alignItems="center">
        <Autocomplete
          freeSolo
          size="small"
          options={uniqueUserNames}
          value={userName}
          onInputChange={(event, newInputValue) => {
            setUserName(newInputValue);
            setPage(1);
          }}
          onChange={(event, newValue) => {
            setUserName(newValue || "");
            setPage(1);
          }}
          filterOptions={(options, state) => {
            const inputValue = removeVietnameseTones(state.inputValue);
            return options.filter((option) =>
              removeVietnameseTones(option).includes(inputValue)
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Người thực hiện"
              placeholder="Nhập tên..."
              variant="outlined"
              sx={{ width: 200 }}
            />
          )}
        />
        <Autocomplete
          freeSolo
          size="small"
          options={uniqueProductNames}
          value={selectedProductName}
          getOptionLabel={(option) => (
            typeof option === "string" ? formatActivityTarget(option) : option.label
          )}
          onInputChange={(event, newInputValue, reason) => {
            if (reason !== "input") return;
            setProductName(newInputValue);
            setPage(1);
          }}
          onChange={(event, newValue) => {
            setProductName(
              typeof newValue === "string" ? newValue : newValue?.value || "",
            );
            setPage(1);
          }}
          filterOptions={(options, state) => {
            const inputValue = removeVietnameseTones(state.inputValue);
            return options.filter((option) =>
              removeVietnameseTones(option.label).includes(inputValue)
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Đối tượng"
              placeholder="Nhập tên đối tượng..."
              variant="outlined"
              sx={{ width: 200 }}
            />
          )}
        />
        <TextField
          label="Từ ngày"
          type="date"
          size="small"
          InputLabelProps={{ shrink: true }}
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          label="Đến ngày"
          type="date"
          size="small"
          InputLabelProps={{ shrink: true }}
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          select
          label="Loại thao tác"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          size="small"
          sx={{ width: "180px", minWidth: "150px" }}
          SelectProps={{ native: true }}
          InputLabelProps={{ shrink: true }}
        >
          <option value="">Tất cả</option>
          {Object.entries(actionLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </TextField>
        <Button variant="outlined" color="secondary" onClick={handleResetFilters}>
          Xóa bộ lọc
        </Button>
        <FormControl size="small" sx={{ minWidth: 104, ml: "auto" }}>
          <Select
            value={limit}
            onChange={(e) => {
              setLimit(e.target.value);
              setPage(1);
            }}
            sx={{ height: 40, backgroundColor: "#FFFFFF" }}
          >
            <MenuItem value={20}>20 dòng</MenuItem>
            <MenuItem value={50}>50 dòng</MenuItem>
            <MenuItem value={100}>100 dòng</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" my={4}>
          <CircularProgress />
        </Box>
      ) : logs.length === 0 ? (
        <Typography>Không có dữ liệu lịch sử hoạt động</Typography>
      ) : (
        <>
          <TableContainer component={Paper} className="admin-list-table" sx={{ overflow: "auto" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell align="center">
                    <b>Người thực hiện</b>
                  </TableCell>
                  <TableCell align="center">
                    <b>Thao tác</b>
                  </TableCell>
                  <TableCell align="center">
                    <b>Sản phẩm</b>
                  </TableCell>
                  <TableCell align="left">
                    <b>Chi tiết thay đổi</b>
                  </TableCell>
                  <TableCell align="center">
                    <b>Thời gian</b>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.map((row) => (
                  <TableRow key={row._id}>
                    <TableCell align="center">{row.userName || ""}</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={getActivityActionLabel(row.action, actionLabels)}
                        color={getActionColor(row.action)}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">
                      {row.productId ? (
                        <span
                          style={{
                            cursor: "pointer",
                            color: "#1976d2",
                            textDecoration: "underline",
                          }}
                          onClick={() =>
                            navigate(`/product/${row.productId}`)
                          }
                        >
                          {formatActivityTarget(row.productName)}
                        </span>
                      ) : (
                        formatActivityTarget(row.productName)
                      )}
                    </TableCell>
                    <TableCell align="left">
                      {row.details && row.details.length > 0 ? (
                        <Box
                          component="ul"
                          sx={{
                            m: 0,
                            pl: 2,
                            listStyleType: "none",
                            "& li": { mb: 0.3 },
                          }}
                        >
                          {row.details.map((detail, index) => {
                            const oldValue = formatActivityValue(detail.oldValue, {
                              fieldName: detail.field,
                              permissionLabels,
                              references,
                            });
                            const newValue = formatActivityValue(detail.newValue, {
                              fieldName: detail.field,
                              permissionLabels,
                              references,
                            });

                            return (
                            <li key={index}>
                              <Typography
                                variant="body2"
                                component="span"
                                sx={{ fontWeight: 500 }}
                              >
                                {getActivityFieldLabel(detail.field)}:
                              </Typography>{" "}
                              {oldValue ? (
                                <Typography
                                  variant="body2"
                                  component="span"
                                  sx={{
                                    color: "#d32f2f",
                                    textDecoration: "line-through",
                                    mr: 0.5,
                                  }}
                                >
                                  {oldValue}
                                </Typography>
                              ) : null}
                              {oldValue && newValue ? " → " : ""}
                              {newValue ? (
                                <Typography
                                  variant="body2"
                                  component="span"
                                  sx={{
                                    color: "#2e7d32",
                                    fontWeight: 600,
                                  }}
                                >
                                  {newValue}
                                </Typography>
                              ) : null}
                            </li>
                            );
                          })}
                        </Box>
                      ) : (
                        ""
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {moment(row.createdAt).format("DD/MM/YYYY HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Box display="flex" justifyContent="center" my={2}>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(e, value) => setPage(value)}
              color="primary"
            />
          </Box>
        </>
      )}
    </Box>
  );
};

export default ActivityLog;
