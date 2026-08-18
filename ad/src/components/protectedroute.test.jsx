import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from './protectedroute';
import {
  getSafeCustomerReturnPath,
  LAST_CUSTOMER_PATH_KEY,
} from './adminroute.utils';

describe('ProtectedRoute customer isolation', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('redirects a customer to the last safe storefront path', async () => {
    sessionStorage.setItem(LAST_CUSTOMER_PATH_KEY, '/product/abc?section=control#detail');
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ role: 'customer', name: 'Khách hàng' }),
    }));
    const onCustomerRedirect = vi.fn();

    render(
      <MemoryRouter initialEntries={['/product']}>
        <ProtectedRoute onCustomerRedirect={onCustomerRedirect}>
          <div>Admin content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(onCustomerRedirect).toHaveBeenCalledWith('/product/abc?section=control#detail');
    });
  });

  it.each(['/admin', '/admin/product', '//example.com/path', 'https://example.com']) (
    'rejects unsafe return path %s',
    (unsafePath) => {
      const storage = {
        getItem: () => unsafePath,
      };

      expect(getSafeCustomerReturnPath(storage)).toBe('/');
    },
  );
});
