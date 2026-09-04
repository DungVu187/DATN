import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AddShoppingCartOutlinedIcon from '@mui/icons-material/AddShoppingCartOutlined';
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { sendChatMessage } from '../api/chatApi';
import { ShopContext } from '../context/shopcontext';
import { resolveStorefrontAssetUrl } from '../api/storefrontCatalogApi';
import {
  getCustomerBehaviorSessionId,
  getCustomerVisitorId,
} from '../utils/customerBehaviorTracker';
import './style/chatbox.css';

const QUICK_QUESTION_GROUPS = [
  [
    'Tìm PLC Siemens',
    'Giá của sản phẩm này bao nhiêu?',
    'Sản phẩm này còn hàng không?',
    'Có sản phẩm tương tự không?',
    'Cho tôi thông số kỹ thuật',
    'Chính sách giao hàng thế nào?',
  ],
  [
    'Chính sách bảo hành thế nào?',
    'Chính sách mua hàng ra sao?',
    'Chính sách bảo mật thông tin?',
    'Kiểm tra đơn hàng của tôi',
    'Tôi cần tư vấn chọn sản phẩm',
    'Tôi muốn liên hệ nhân viên',
  ],
];

const GREETING_MESSAGE = {
  role: 'assistant',
  isGreeting: true,
  content: 'Chào bạn, mình là trợ lý NOVA.\nMình có thể hỗ trợ tìm sản phẩm, kiểm tra giá, tồn kho, thông số kỹ thuật, giao hàng, bảo hành và đơn hàng.',
};

const createChatSessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'chat-' + crypto.randomUUID();
  }
  return 'chat-' + Date.now() + '-' + Math.random().toString(36).slice(2);
};

const formatPrice = (value) => {
  const number = Number(String(value || '').replace(/\./g, ''));
  return Number.isFinite(number) && number > 0
    ? number.toLocaleString('vi-VN') + ' VNĐ'
    : 'Liên hệ báo giá';
};

const getVariant = (product) => product?.variants?.[0] || {};

function ChatProductCard({ product, onAddToCart, onOpenProduct }) {
  const variant = getVariant(product);
  const image = resolveStorefrontAssetUrl(variant.imgUrl);
  const canBuyDirectly = variant.canBuyDirectly === true && Number(variant.quantityForSale) > 0;
  const availability = product.availability === 'out_of_stock'
    ? 'Hết hàng'
    : product.availability === 'contact_for_price'
      ? 'Còn hàng, liên hệ báo giá'
      : 'Còn ' + (variant.quantityForSale || 0);

  return (
    <article className="chat-product-card">
      <button type="button" className="chat-product-main" onClick={() => onOpenProduct(product.productId)}>
        <span className="chat-product-image-wrap">
          {image ? <img src={image} alt="" className="chat-product-image" /> : <SmartToyOutlinedIcon />}
        </span>
        <span className="chat-product-copy">
          <strong>{product.name}</strong>
          <small>{product.brand || product.type || 'Sản phẩm kỹ thuật'}</small>
          <span className="chat-product-price">{formatPrice(variant.price)}</span>
          <small className={product.availability === 'out_of_stock' ? 'is-out' : 'is-in'}>{availability}</small>
        </span>
        <OpenInNewRoundedIcon className="chat-product-open" fontSize="small" />
      </button>
      <div className="chat-product-actions">
        <button type="button" onClick={() => onOpenProduct(product.productId)}>Xem chi tiết</button>
        <button type="button" disabled={!canBuyDirectly} onClick={() => onAddToCart(product.productId, 0)}>
          <AddShoppingCartOutlinedIcon fontSize="small" />
          {canBuyDirectly ? 'Thêm vào giỏ' : 'Liên hệ'}
        </button>
      </div>
    </article>
  );
}

function Chatbox() {
  const navigate = useNavigate();
  const location = useLocation();
  const { addToCart } = useContext(ShopContext);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([GREETING_MESSAGE]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastFailedMessage, setLastFailedMessage] = useState('');
  const [questionGroupIndex, setQuestionGroupIndex] = useState(0);
  const [chatSessionId] = useState(createChatSessionId);
  const quickQuestionsRef = useRef(null);
  const quickDragRef = useRef({ active: false, moved: false, startX: 0, scrollLeft: 0 });
  const behaviorSessionId = useMemo(() => getCustomerBehaviorSessionId(), []);
  const visitorId = useMemo(() => getCustomerVisitorId(), []);

  const quickQuestions = QUICK_QUESTION_GROUPS[questionGroupIndex];
  const isFreshConversation = messages.length === 1 && messages[0].isGreeting;

  useEffect(() => {
    const messagesPanel = document.querySelector('.chatbox-messages');
    if (messagesPanel) messagesPanel.scrollTop = messagesPanel.scrollHeight;
  }, [messages, loading]);

  const openProduct = (productId) => {
    if (productId) navigate('/product/' + productId);
  };

  const handleAddToCart = async (productId, variantIndex) => {
    await addToCart(productId, variantIndex, 1);
  };

  const submitMessage = async (event, suggestedMessage, options = {}) => {
    event?.preventDefault();
    const content = String(suggestedMessage ?? message).trim();
    if (!content || loading) return;

    setMessage('');
    setError('');
    setLastFailedMessage(content);
    if (!options.skipAppend) {
      setMessages((current) => [...current, { role: 'user', content }]);
    }
    setLoading(true);

    try {
      const historyMessages = messages.filter((item) => !item.isGreeting);
      const normalizedHistory = options.skipAppend
        && historyMessages.at(-1)?.role === 'user'
        && historyMessages.at(-1)?.content === content
        ? historyMessages.slice(0, -1)
        : historyMessages;
      const response = await sendChatMessage({
        message: content,
        chatSessionId,
        sessionId: behaviorSessionId,
        visitorId,
        currentProductId: location.pathname.startsWith('/product/')
          ? location.pathname.split('/')[2]
          : undefined,
        currentPath: location.pathname + location.search,
        history: normalizedHistory
          .slice(-10)
          .map((item) => ({ role: item.role, content: item.content })),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Không thể gửi câu hỏi lúc này.');
      setMessages((current) => [...current, {
        role: 'assistant',
        content: data.reply || 'Mình chưa có câu trả lời phù hợp.',
        products: Array.isArray(data.products) ? data.products : [],
        fallback: data.fallback === true,
      }]);
      setLastFailedMessage('');
    } catch (requestError) {
      setError(requestError.message || 'Trợ lý đang tạm thời không phản hồi.');
    } finally {
      setLoading(false);
    }
  };

  const retryLastMessage = () => {
    if (lastFailedMessage) submitMessage(undefined, lastFailedMessage, { skipAppend: true });
  };

  const changeQuestionGroup = () => {
    setQuestionGroupIndex((current) => (current + 1) % QUICK_QUESTION_GROUPS.length);
  };

  const handleQuickQuestionsPointerDown = (event) => {
    const container = quickQuestionsRef.current;
    if (!container) return;

    // Chỉ bắt kéo chuột. Trên mobile để trình duyệt xử lý vuốt ngang native,
    // tránh làm mất sự kiện click của nút câu hỏi.
    if (event.pointerType !== 'mouse') return;

    quickDragRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      scrollLeft: container.scrollLeft,
    };
  };

  const handleQuickQuestionsPointerMove = (event) => {
    const container = quickQuestionsRef.current;
    const drag = quickDragRef.current;
    if (!container || !drag.active || event.pointerType !== 'mouse') return;

    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) > 4) drag.moved = true;
    if (!drag.moved) return;

    event.preventDefault();
    container.scrollLeft = drag.scrollLeft - distance;
  };

  const handleQuickQuestionsPointerEnd = (event) => {
    quickDragRef.current.active = false;
  };

  const handleQuickQuestionClick = (event, question) => {
    if (quickDragRef.current.moved) {
      event.preventDefault();
      event.stopPropagation();
      quickDragRef.current.moved = false;
      return;
    }
    submitMessage(event, question);
  };

  return (
    <aside className={'chatbox-root' + (open ? ' is-open' : '')}>
      {open && (
        <section className="chatbox-panel" aria-label="Trợ lý NOVA">
          <header className="chatbox-header">
            <div className="chatbox-title">
              <span className="chatbox-avatar"><SmartToyOutlinedIcon fontSize="small" /></span>
              <div><strong>Trợ lý NOVA</strong><small>Tư vấn sản phẩm và đơn hàng</small></div>
            </div>
            <button type="button" className="chatbox-close-button" onClick={() => setOpen(false)} aria-label="Đóng Chatbox">
              <CloseRoundedIcon fontSize="small" />
            </button>
          </header>

          <div className="chatbox-messages" aria-live="polite">
            {messages.map((item, index) => (
              <div className={'chat-message-row is-' + item.role} key={item.role + '-' + index}>
                <div className="chat-message-bubble">
                  <p>{item.content}</p>
                  {item.fallback && <small className="chat-fallback-note">Đang dùng dữ liệu hệ thống để trả lời tạm thời.</small>}
                  {item.products?.length > 0 && (
                    <div className="chat-product-list">
                      {item.products.map((product) => <ChatProductCard key={product.productId} product={product} onAddToCart={handleAddToCart} onOpenProduct={openProduct} />)}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isFreshConversation && (
              <div className="chatbox-welcome-suggestions">
                <div className="chatbox-suggestion-heading"><SmartToyOutlinedIcon fontSize="small" /><strong>Bạn có thể hỏi</strong></div>
                <div className="chatbox-suggestion-list">
                  {quickQuestions.map((question) => <button type="button" key={question} disabled={loading} onClick={(event) => submitMessage(event, question)}>{question}<OpenInNewRoundedIcon fontSize="small" /></button>)}
                </div>
              </div>
            )}

            {loading && <div className="chat-message-row is-assistant"><div className="chat-message-bubble chat-typing" aria-label="Đang trả lời"><span /><span /><span /></div></div>}
            {error && (
              <div className="chatbox-error" role="alert">
                <span>{error}</span>
                {lastFailedMessage && <button type="button" onClick={retryLastMessage} disabled={loading}><RefreshRoundedIcon fontSize="small" /> Thử lại</button>}
              </div>
            )}
          </div>

          {!isFreshConversation && (
            <div className="chatbox-quick-bar" aria-label="Câu hỏi nhanh">
              <div className="chatbox-quick-bar-heading"><span>Câu hỏi nhanh</span><button type="button" onClick={changeQuestionGroup} disabled={loading}><RefreshRoundedIcon fontSize="small" /> Gợi ý khác</button></div>
              <div
                className="chatbox-quick-chips"
                ref={quickQuestionsRef}
                onPointerDown={handleQuickQuestionsPointerDown}
                onPointerMove={handleQuickQuestionsPointerMove}
                onPointerUp={handleQuickQuestionsPointerEnd}
                onPointerCancel={handleQuickQuestionsPointerEnd}
              >
                {quickQuestions.map((question) => <button type="button" key={question} disabled={loading} onClick={(event) => handleQuickQuestionClick(event, question)}>{question}</button>)}
              </div>
            </div>
          )}

          <form className="chatbox-compose" onSubmit={submitMessage}>
            <label className="sr-only" htmlFor="chatbox-message">Nội dung câu hỏi</label>
            <input id="chatbox-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Nhập câu hỏi của bạn..." maxLength={2000} disabled={loading} />
            <button type="submit" aria-label="Gửi câu hỏi" disabled={!message.trim() || loading}><SendRoundedIcon fontSize="small" /></button>
          </form>
        </section>
      )}

      <button type="button" className="chatbox-launcher" onClick={() => setOpen((current) => !current)} aria-label={open ? 'Đóng trợ lý NOVA' : 'Mở trợ lý NOVA'}>
        {open ? <CloseRoundedIcon /> : <ChatBubbleOutlineOutlinedIcon />}
        {!open && <span className="chatbox-launcher-label">Hỏi trợ lý</span>}
      </button>
    </aside>
  );
}

export default Chatbox;
