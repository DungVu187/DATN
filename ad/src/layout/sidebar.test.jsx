import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  const { forwardRef } = await vi.importActual('react');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: forwardRef(({ to, children, ...rest }, ref) => (
      <a ref={ref} href={to} {...rest}>{children}</a>
    )),
  };
});

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../context/useordercontext', () => ({
  useOrderContext: () => ({ orderChanged: false }),
}));

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

const mockPermissions = vi.hoisted(() => ({
  profile: { name: 'Test User', phone: '0123456789', role: 'staff', permissions: [] },
  role: 'staff',
  isAdminOrSuperadmin: false,
  can: vi.fn().mockReturnValue(false),
  isLoading: false,
}));

vi.mock('../context/usepermissions', () => ({
  usePermissions: () => mockPermissions,
}));

import Sidebar from './sidebar';

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions.profile = { name: 'Test User', phone: '0123456789', role: 'staff', permissions: [] };
    mockPermissions.role = 'staff';
    mockPermissions.isAdminOrSuperadmin = false;
    mockPermissions.can = vi.fn().mockReturnValue(false);
    mockPermissions.isLoading = false;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, count: 0 }),
    });
  });

  it('shows only product menu for staff with product.view', () => {
    mockPermissions.can = vi.fn((perm) => perm === 'product.view');

    render(<Sidebar />);

    expect(screen.getByText('Sản phẩm')).toBeInTheDocument();
    expect(screen.queryByText('Đơn bán hàng')).not.toBeInTheDocument();
    expect(screen.queryByText('Đơn nhập hàng')).not.toBeInTheDocument();
    expect(screen.queryByText('Đơn xuất hàng')).not.toBeInTheDocument();
    expect(screen.queryByText('Khách hàng')).not.toBeInTheDocument();
    expect(screen.queryByText('Quản lý trang chủ')).not.toBeInTheDocument();
    expect(screen.queryByText('Nội dung trang chủ')).not.toBeInTheDocument();
    expect(screen.queryByText('Hiển thị sản phẩm')).not.toBeInTheDocument();
    expect(screen.queryByText('Lịch sử kho')).not.toBeInTheDocument();
    expect(screen.queryByText('Phân quyền')).not.toBeInTheDocument();
    expect(screen.queryByText('Lịch sử hoạt động')).not.toBeInTheDocument();
  });

  it('shows order group for staff with order.view', () => {
    mockPermissions.can = vi.fn((perm) => perm === 'order.view');

    render(<Sidebar />);

    expect(screen.getByText('Đơn bán hàng')).toBeInTheDocument();
  });

  it('shows customer menu for staff with customer.view only', () => {
    mockPermissions.can = vi.fn((perm) => perm === 'customer.view');

    render(<Sidebar />);

    expect(screen.getByText('Khách hàng')).toBeInTheDocument();
  });

  it('groups storefront management links in one dropdown', () => {
    mockPermissions.can = vi.fn((perm) => perm === 'storefront.manage');

    render(<Sidebar />);

    expect(screen.getByText('Quản lý trang chủ')).toBeInTheDocument();
    expect(screen.queryByText('Nội dung trang chủ')).not.toBeInTheDocument();
    expect(screen.queryByText('Hiển thị sản phẩm')).not.toBeInTheDocument();
    expect(screen.queryByText('Chính sách')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Quản lý trang chủ'));

    expect(screen.getByText('Nội dung trang chủ')).toBeInTheDocument();
    expect(screen.getByText('Hiển thị sản phẩm')).toBeInTheDocument();
    expect(screen.getByText('Chính sách')).toBeInTheDocument();
  });

  it('shows admin-only menus for admin/superadmin', () => {
    mockPermissions.isAdminOrSuperadmin = true;
    mockPermissions.can = vi.fn().mockReturnValue(true);

    render(<Sidebar />);

    expect(screen.getByText('Phân quyền')).toBeInTheDocument();
    expect(screen.getByText('Lịch sử hoạt động')).toBeInTheDocument();
  });

  it('shows history menus for staff with those permissions', () => {
    mockPermissions.can = vi.fn((perm) =>
      perm === 'history_import.view' ||
      perm === 'history_export.view'
    );

    render(<Sidebar />);

    expect(screen.getByText('Lịch sử kho')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Lịch sử kho'));

    expect(screen.getByText('Lịch sử nhập kho')).toBeInTheDocument();
    expect(screen.getByText('Lịch sử xuất kho')).toBeInTheDocument();
  });

  it('shows only the permitted history submenu for staff', () => {
    mockPermissions.can = vi.fn((perm) => perm === 'history_import.view');

    render(<Sidebar />);

    fireEvent.click(screen.getByText('Lịch sử kho'));

    expect(screen.getByText('Lịch sử nhập kho')).toBeInTheDocument();
    expect(screen.queryByText('Lịch sử xuất kho')).not.toBeInTheDocument();
  });

  it('shows activity history for staff with activitylog.view', () => {
    mockPermissions.can = vi.fn((perm) => perm === 'activitylog.view');

    render(<Sidebar />);

    expect(screen.getByText('Lịch sử hoạt động')).toBeInTheDocument();
  });

  it('always shows logout regardless of permissions', () => {
    mockPermissions.can = vi.fn().mockReturnValue(false);
    mockPermissions.isAdminOrSuperadmin = false;

    render(<Sidebar />);

    expect(screen.getByText('Đăng xuất')).toBeInTheDocument();
  });

  it('does not fetch processing count when user lacks order.view', () => {
    mockPermissions.can = vi.fn().mockReturnValue(false);

    render(<Sidebar />);

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('shows greeting with user name from profile', () => {
    mockPermissions.can = vi.fn().mockReturnValue(false);

    render(<Sidebar />);

    const greeting = screen.getByText((content, element) =>
      element?.tagName === 'P' && element.textContent === 'Xin chào, Test User'
    );
    expect(greeting).toBeInTheDocument();
  });

  it('hides customer menu when customer.view is missing', () => {
    mockPermissions.can = vi.fn().mockReturnValue(false);

    render(<Sidebar />);

    expect(screen.queryByText('Khách hàng')).not.toBeInTheDocument();
  });
});
