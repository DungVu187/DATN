import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ShopContext } from '../context/shopcontext';
import { sendChatMessage } from '../api/chatApi';
import Chatbox from './chatbox';

vi.mock('../api/chatApi', () => ({
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
    vi.clearAllMocks();
    vi.stubEnv('VITE_BACK_END', 'http://backend.test');
    sendChatMessage.mockResolvedValue(successfulResponse());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('opens with an immediate NOVA greeting and the first six suggested questions', () => {
    renderChatbox();

    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý NOVA' }));

    expect(screen.getByRole('region', { name: 'Trợ lý NOVA' })).toBeInTheDocument();
    expect(screen.getByText(/Chào bạn, mình là trợ lý NOVA/)).toBeInTheDocument();
    expect(screen.getByText('Bạn có thể hỏi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tìm PLC Siemens' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chính sách giao hàng thế nào?' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xóa lịch sử chat' })).not.toBeInTheDocument();
    expect(screen.queryByText(/TTSmart/)).not.toBeInTheDocument();
  });

  it('keeps the conversation when closed and reopened without repeating the greeting', async () => {
    renderChatbox();

    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý NOVA' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Tìm PLC Siemens' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể kết nối'));
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/ }));

    await waitFor(() => expect(screen.getByText('Đã thử lại thành công.')).toBeInTheDocument());
    expect(sendChatMessage).toHaveBeenCalledTimes(2);
  });
});
