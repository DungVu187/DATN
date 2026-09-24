import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AddShoppingCartOutlinedIcon from '@mui/icons-material/AddShoppingCartOutlined';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { clearChatHistory, getChatHistory, sendChatMessage } from '../api/chatApi';
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

const CHAT_SESSION_STORAGE_KEY = 'nova_chat_session_id';

const getStoredChatSessionId = () => {
  try {
    return window.localStorage.getItem(CHAT_SESSION_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

const createChatSessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'chat-' + crypto.randomUUID();
  }
  return 'chat-' + Date.now() + '-' + Math.random().toString(36).slice(2);
};

const getOrCreateChatSessionId = () => {
  const stored = getStoredChatSessionId();
  if (stored) return stored;
  const created = createChatSessionId();
  try { window.localStorage.setItem(CHAT_SESSION_STORAGE_KEY, created); } catch (storageError) { console.warn('Không thể lưu mã phiên chat:', storageError); }
  return created;
};

const formatPrice = (value) => {
  const number = Number(String(value || '').replace(/\./g, ''));
  return Number.isFinite(number) && number > 0
    ? number.toLocaleString('vi-VN') + ' VNĐ'
    : 'Liên hệ báo giá';
};

/**
 * Chọn biến thể đại diện để hiển thị nhưng giữ nguyên chỉ số gốc.
 * Không sắp xếp lại danh sách rồi gọi cart API bằng chỉ số mới.
 */
const getRepresentativeVariant = (product) => {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const buyableIndex = variants.findIndex((item) => item.canBuyDirectly === true && Number(item.quantityForSale) > 0);
  if (buyableIndex >= 0) return { variant: variants[buyableIndex], index: buyableIndex };
  const inStockIndex = variants.findIndex((item) => Number(item.quantityForSale) > 0);
  if (inStockIndex >= 0) return { variant: variants[inStockIndex], index: inStockIndex };
  return { variant: variants[0] || {}, index: 0 };
};

const describePriceRange = (product) => {
  const prices = (product?.variants || [])
    .filter((item) => item.canBuyDirectly === true && item.price)
    .map((item) => Number(String(item.price).replace(/\./g, '')))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (prices.length === 0) return 'Liên hệ báo giá';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatPrice(String(min)) : formatPrice(String(min)) + ' – ' + formatPrice(String(max));
};

function ChatProductCard({ product, onAddToCart, onOpenProduct }) {
  const { variant, index } = getRepresentativeVariant(product);
  const image = resolveStorefrontAssetUrl(variant.imgUrl);
  const variantCount = product?.variants?.length || 0;
  const canBuyDirectly = variant.canBuyDirectly === true && Number(variant.quantityForSale) > 0;
  // Nhiều biến thể thì mở trang chi tiết để khách tự chọn, tránh thêm nhầm hàng vào giỏ.
  const hasSingleBuyableVariant = canBuyDirectly && variantCount === 1;
  const availability = product.availability === 'out_of_stock'
    ? 'Hết hàng'
    : product.availability === 'contact_for_price'
      ? 'Còn hàng, liên hệ báo giá'
      : 'Còn ' + (variant.quantityForSale || 0) + (variantCount > 1 ? ' (' + variantCount + ' phiên bản)' : '');

  return (
    <article className="chat-product-card">
      <button type="button" className="chat-product-main" onClick={() => onOpenProduct(product.productId)}>
        <span className="chat-product-image-wrap">
          {image ? <img src={image} alt="" className="chat-product-image" /> : <SmartToyOutlinedIcon />}
        </span>
        <span className="chat-product-copy">
          <strong>{product.name}</strong>
          <small>{[product.code, product.brand || product.type].filter(Boolean).join(' · ') || 'Sản phẩm kỹ thuật'}</small>
          <span className="chat-product-price">{describePriceRange(product)}</span>
          <small className={product.availability === 'out_of_stock' ? 'is-out' : 'is-in'}>{availability}</small>
          {product.reason && <small className="chat-product-reason">{product.reason}</small>}
        </span>
        <OpenInNewRoundedIcon className="chat-product-open" fontSize="small" />
      </button>
      <div className="chat-product-actions">
        <button type="button" onClick={() => onOpenProduct(product.productId)}>Xem chi tiết</button>
        {hasSingleBuyableVariant ? (
          <button type="button" onClick={() => onAddToCart(product.productId, index)}>
            <AddShoppingCartOutlinedIcon fontSize="small" />
            Thêm vào giỏ
          </button>
        ) : (
          <button type="button" onClick={() => onOpenProduct(product.productId)}>
            {variantCount > 1 ? 'Chọn phiên bản' : 'Xem để đặt hàng'}
          </button>
        )}
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
  const [loading, setLoading] = useState(true);
  const submitLockRef = useRef(false);
  const [error, setError] = useState('');
  const [lastFailedMessage, setLastFailedMessage] = useState('');
  const [questionGroupIndex, setQuestionGroupIndex] = useState(0);
  const [chatSessionId] = useState(getOrCreateChatSessionId);
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

  useEffect(() => {
    let active = true;
    getChatHistory(chatSessionId, visitorId)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Không thể tải lịch sử chat.');
        if (!active || !Array.isArray(data.messages) || data.messages.length === 0) return;
        setMessages([GREETING_MESSAGE, ...data.messages.map((item) => ({
          role: item.role,
          content: item.content,
          intent: item.intent,
        }))]);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Không thể tải lịch sử chat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [chatSessionId, visitorId]);

  const handleClearChat = async () => {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const response = await clearChatHistory(chatSessionId, visitorId);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Không thể xóa lịch sử chat.');
      setMessages([GREETING_MESSAGE]);
      setLastFailedMessage('');
      setMessage('');
    } catch (requestError) {
      setError(requestError.message || 'Không thể xóa lịch sử chat.');
    } finally {
      setLoading(false);
    }
  };

  const openProduct = (productId) => {
    if (productId) navigate('/product/' + productId);
  };

  const handleAddToCart = async (productId, variantIndex) => {
    await addToCart(productId, variantIndex, 1);
  };

  const submitMessage = async (event, suggestedMessage, options = {}) => {
    event?.preventDefault();
    const content = String(suggestedMessage ?? message).trim();
    if (!content || loading || submitLockRef.current) return;
    submitLockRef.current = true;

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
          .map((item) => ({ role: item.role, content: item.content.slice(0, 1500) })),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Không thể gửi câu hỏi lúc này.');
      setMessages((current) => [...current, {
        role: 'assistant',
        content: data.reply || 'Mình chưa có câu trả lời phù hợp.',
        products: Array.isArray(data.products) ? data.products : [],
        fallback: data.fallback === true,
        needsHuman: data.needsHuman === true,
      }]);
      setLastFailedMessage('');
    } catch (requestError) {
      setError(requestError.message || 'Trợ lý đang tạm thời không phản hồi.');
    } finally {
      setLoading(false);
      submitLockRef.current = false;
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
            <button type="button" className="chatbox-clear-button" onClick={handleClearChat} disabled={loading} aria-label="Xóa lịch sử chat">Xóa</button>
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
                  {item.needsHuman && <div className="chat-human-handoff"><strong>Cần hỗ trợ trực tiếp?</strong><span>Kênh nhanh nhất hiện có là hotline 09.0151.3825. Bạn cũng có thể để lại số điện thoại trong khung chat để nhân viên xem lại.</span><button type="button" onClick={() => setMessage('Tôi muốn được nhân viên liên hệ lại')}> Để lại liên hệ</button></div>}
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
        {/* Giữ cả hai icon để chuyển qua lại bằng hiệu ứng xoay/mờ thay vì đổi đột ngột */}
        <span className="chatbox-launcher-icon is-chat" aria-hidden="true"><ChatRoundedIcon /></span>
        <span className="chatbox-launcher-icon is-close" aria-hidden="true"><CloseRoundedIcon /></span>
        {!open && <span className="chatbox-launcher-tooltip" aria-hidden="true">Hỏi trợ lý NOVA</span>}
      </button>
    </aside>
  );
}

export default Chatbox;
