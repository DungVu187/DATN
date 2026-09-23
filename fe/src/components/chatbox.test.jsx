import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ShopContext } from '../context/shopcontext';
import { clearChatHistory, getChatHistory, sendChatMessage } from '../api/chatApi';
import Chatbox from './chatbox';

vi.mock('../api/chatApi', () => ({
  clearChatHistory: vi.fn(),
  getChatHistory: vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ messages: [] }) }),
  sendChatMessage: vi.fn(),
}));

const renderChatbox = () => render(
  <MemoryRouter initialEntries={['/']}>
    <ShopContext.Provider value={{ addToCart: vi.fn() }}>
      <Chatbox />
    </ShopContext.Provider>
  </MemoryRouter>,
);

const successfulResponse = (reply = 'Mình đã tìm thấy sản phẩm phù hợp.') => ({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue({
    reply,
    products: [],
    fallback: false,
  }),
});

describe('Chatbox NOVA', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    getChatHistory.mockResolvedValue({ ok: true, json: async () => ({ messages: [] }) });
    clearChatHistory.mockResolvedValue({ ok: true, json: async () => ({ success: 1 }) });
    vi.stubEnv('VITE_BACK_END', 'http://backend.test');
    sendChatMessage.mockResolvedValue(successfulResponse());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('opens with an immediate NOVA greeting and the first six suggested questions', async () => {
    renderChatbox();

    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý NOVA' }));

    expect(screen.getByRole('region', { name: 'Trợ lý NOVA' })).toBeInTheDocument();
    expect(screen.getByText(/Chào bạn, mình là trợ lý NOVA/)).toBeInTheDocument();
    expect(screen.getByText('Bạn có thể hỏi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tìm PLC Siemens' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chính sách giao hàng thế nào?' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xóa lịch sử chat' })).toBeEnabled());
    expect(screen.queryByText(/TTSmart/)).not.toBeInTheDocument();
  });

  it('keeps the conversation when closed and reopened without repeating the greeting', async () => {
    renderChatbox();

    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý NOVA' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tìm PLC Siemens' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Tìm PLC Siemens' }));

    await waitFor(() => expect(screen.getByText('Mình đã tìm thấy sản phẩm phù hợp.')).toBeInTheDocument());
    expect(screen.getAllByText(/Chào bạn, mình là trợ lý NOVA/)).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Đóng Chatbox' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý NOVA' }));

    expect(screen.getByText('Mình đã tìm thấy sản phẩm phù hợp.')).toBeInTheDocument();
    expect(screen.getAllByText(/Chào bạn, mình là trợ lý NOVA/)).toHaveLength(1);
  });

  it('keeps quick chips after a reply and changes the group without sending a request', async () => {
    renderChatbox();

    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý NOVA' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tìm PLC Siemens' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Tìm PLC Siemens' }));
    await waitFor(() => expect(screen.getByText('Câu hỏi nhanh')).toBeInTheDocument());

    const callsBeforeChangingGroup = sendChatMessage.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /Gợi ý khác/ }));

    expect(sendChatMessage).toHaveBeenCalledTimes(callsBeforeChangingGroup);
    expect(screen.getByRole('button', { name: 'Chính sách bảo hành thế nào?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kiểm tra đơn hàng của tôi' })).toBeInTheDocument();
  });

  it('retries a failed request from the inline error state', async () => {
    sendChatMessage
      .mockRejectedValueOnce(new Error('Không thể kết nối'))
      .mockResolvedValueOnce(successfulResponse('Đã thử lại thành công.'));
    renderChatbox();

    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý NOVA' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tìm PLC Siemens' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Tìm PLC Siemens' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể kết nối'));
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/ }));

    await waitFor(() => expect(screen.getByText('Đã thử lại thành công.')).toBeInTheDocument());
    expect(sendChatMessage).toHaveBeenCalledTimes(2);
  });

  it('restores the same session after remounting and clears it on the server', async () => {
    const firstMount = renderChatbox();
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý NOVA' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tìm PLC Siemens' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Tìm PLC Siemens' }));
    await screen.findByText('Mình đã tìm thấy sản phẩm phù hợp.');
    const { chatSessionId, visitorId } = sendChatMessage.mock.calls[0][0];
    firstMount.unmount();

    getChatHistory.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [
        { role: 'user', content: 'Tìm PLC Siemens' },
        { role: 'assistant', content: 'Nội dung đã lưu trong MongoDB.' },
      ] }),
    });
    const secondMount = renderChatbox();
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý NOVA' }));
    await screen.findByText('Nội dung đã lưu trong MongoDB.');
    expect(getChatHistory).toHaveBeenLastCalledWith(chatSessionId, visitorId);
    expect(sendChatMessage).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xóa lịch sử chat' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Xóa lịch sử chat' }));
    await waitFor(() => expect(screen.queryByText('Nội dung đã lưu trong MongoDB.')).not.toBeInTheDocument());
    expect(clearChatHistory).toHaveBeenCalledWith(chatSessionId, visitorId);
    secondMount.unmount();

    renderChatbox();
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý NOVA' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tìm PLC Siemens' })).toBeEnabled());
    expect(screen.queryByText('Nội dung đã lưu trong MongoDB.')).not.toBeInTheDocument();
  });

  const productResponse = (products) => ({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ reply: 'Kết quả phù hợp.', products, fallback: false }),
  });

  const askAndWait = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý NOVA' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tìm PLC Siemens' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Tìm PLC Siemens' }));
    await screen.findByText('Kết quả phù hợp.');
  };

  it('adds a single-variant product to the cart with its own index', async () => {
    const addToCart = vi.fn();
    sendChatMessage.mockResolvedValue(productResponse([{
      productId: 'p1',
      name: 'Aptomat 10A',
      code: 'A9F74210',
      brand: 'Schneider',
      availability: 'available',
      reason: 'đúng nhóm Aptomat, đang còn hàng.',
      variants: [{ variantId: 'v1', price: '310000', quantityForSale: 20, canBuyDirectly: true }],
    }]));
    render(
      <MemoryRouter initialEntries={['/']}>
        <ShopContext.Provider value={{ addToCart }}>
          <Chatbox />
        </ShopContext.Provider>
      </MemoryRouter>,
    );

    await askAndWait();
    expect(screen.getByText('đúng nhóm Aptomat, đang còn hàng.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Thêm vào giỏ/ }));
    expect(addToCart).toHaveBeenCalledWith('p1', 0, 1);
  });

  it('opens the detail page instead of adding a multi-variant product to the cart', async () => {
    const addToCart = vi.fn();
    sendChatMessage.mockResolvedValue(productResponse([{
      productId: 'p2',
      name: 'Contactor LC1D',
      brand: 'Schneider',
      availability: 'available',
      variants: [
        { variantId: 'v1', price: '', quantityForSale: 0, canBuyDirectly: false },
        { variantId: 'v2', price: '560000', quantityForSale: 7, canBuyDirectly: true },
      ],
    }]));
    render(
      <MemoryRouter initialEntries={['/']}>
        <ShopContext.Provider value={{ addToCart }}>
          <Chatbox />
        </ShopContext.Provider>
      </MemoryRouter>,
    );

    await askAndWait();
    // Biến thể đầu hết hàng nhưng sản phẩm vẫn còn hàng ở biến thể thứ hai.
    expect(screen.getByText('Còn 7 (2 phiên bản)')).toBeInTheDocument();
    expect(screen.getByText('560.000 VNĐ')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Thêm vào giỏ/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Chọn phiên bản' }));
    expect(addToCart).not.toHaveBeenCalled();
  });

  it('does not offer a fake contact button for an out-of-stock product', async () => {
    sendChatMessage.mockResolvedValue(productResponse([{
      productId: 'p3',
      name: 'Aptomat 16A',
      availability: 'out_of_stock',
      variants: [{ variantId: 'v1', price: '', quantityForSale: 0, canBuyDirectly: false }],
    }]));
    renderChatbox();

    await askAndWait();
    expect(screen.getByText('Hết hàng')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Liên hệ' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem để đặt hàng' })).toBeInTheDocument();
  });

  it('keeps history visible if the delete API fails', async () => {
    getChatHistory.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ role: 'assistant', content: 'Giữ nguyên hội thoại.' }] }),
    });
    clearChatHistory.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Không thể xóa lịch sử chat.' }),
    });
    renderChatbox();
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý NOVA' }));
    await screen.findByText('Giữ nguyên hội thoại.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xóa lịch sử chat' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Xóa lịch sử chat' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể xóa lịch sử chat.');
    expect(screen.getByText('Giữ nguyên hội thoại.')).toBeInTheDocument();
  });
});
