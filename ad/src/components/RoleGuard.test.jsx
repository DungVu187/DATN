import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoleGuard from './RoleGuard';

const mockNavigate = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('react-hot-toast', () => ({
  default: {
    error: mockToastError,
  },
}));

const mockPermissions = vi.hoisted(() => ({
  isLoading: false,
  profile: { role: 'staff', permissions: [] },
  can: vi.fn().mockReturnValue(false),
  canAny: vi.fn().mockReturnValue(false),
  isAdminOrSuperadmin: false,
}));

vi.mock('../context/usepermissions', () => ({
  usePermissions: () => mockPermissions,
}));

describe('RoleGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions.isLoading = false;
    mockPermissions.profile = { role: 'staff', permissions: [] };
    mockPermissions.can = vi.fn().mockReturnValue(false);
    mockPermissions.canAny = vi.fn().mockReturnValue(false);
    mockPermissions.isAdminOrSuperadmin = false;
  });

  it('shows loading spinner while isLoading is true', () => {
    mockPermissions.isLoading = true;

    const { container } = render(
      <RoleGuard requiredPermission="order.view">
        <div>Protected content</div>
      </RoleGuard>
    );

    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(container.querySelector('[role="progressbar"]')).toBeInTheDocument();
  });

  it('renders children when staff has the required permission', async () => {
    mockPermissions.can = vi.fn().mockReturnValue(true);

    render(
      <RoleGuard requiredPermission="order.view">
        <div>Allowed content</div>
      </RoleGuard>
    );

    expect(await screen.findByText('Allowed content')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockPermissions.can).toHaveBeenCalledWith('order.view');
  });

  it('redirects when staff lacks the required permission', async () => {
    mockPermissions.can = vi.fn().mockReturnValue(false);

    render(
      <RoleGuard requiredPermission="order.view">
        <div>Denied content</div>
      </RoleGuard>
    );

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/product'));
    expect(screen.queryByText('Denied content')).not.toBeInTheDocument();
    expect(mockToastError).toHaveBeenCalled();
  });

  it('renders children for adminOnly when user is admin', async () => {
    mockPermissions.isAdminOrSuperadmin = true;
    mockPermissions.profile = { role: 'admin', permissions: [] };

    render(
      <RoleGuard adminOnly>
        <div>Admin content</div>
      </RoleGuard>
    );

    expect(await screen.findByText('Admin content')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirects staff from adminOnly route', async () => {
    mockPermissions.isAdminOrSuperadmin = false;

    render(
      <RoleGuard adminOnly>
        <div>Admin content</div>
      </RoleGuard>
    );

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/product'));
    expect(screen.queryByText('Admin content')).not.toBeInTheDocument();
    expect(mockToastError).toHaveBeenCalled();
  });

  it('renders children when staff has at least one permission from array (any-of)', async () => {
    mockPermissions.canAny = vi.fn().mockReturnValue(true);

    render(
      <RoleGuard requiredPermission={['iporder.view', 'iporder.edit']}>
        <div>Any-of content</div>
      </RoleGuard>
    );

    expect(await screen.findByText('Any-of content')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockPermissions.canAny).toHaveBeenCalledWith(['iporder.view', 'iporder.edit']);
  });

  it('redirects to login when profile is null (unauthenticated)', async () => {
    mockPermissions.profile = null;

    render(
      <RoleGuard requiredPermission="order.view">
        <div>Content</div>
      </RoleGuard>
    );

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
    expect(mockToastError).toHaveBeenCalled();
  });

  it('renders children when no props are passed and user is logged in', async () => {
    mockPermissions.profile = { role: 'staff', permissions: [] };

    render(
      <RoleGuard>
        <div>Open content</div>
      </RoleGuard>
    );

    expect(await screen.findByText('Open content')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
