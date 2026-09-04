import { sendCustomerBehaviorEvents } from '../api/chatApi';

const VISITOR_ID_KEY = 'NOVA:chatVisitorId';
const BEHAVIOR_SESSION_ID_KEY = 'NOVA:behaviorSessionId';
const FLUSH_DELAY_MS = 700;
const DEDUPE_WINDOW_MS = 5000;

let pendingEvents = [];
let flushTimer = null;
const recentEventKeys = new Map();

const createId = (prefix) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return prefix + '-' + crypto.randomUUID();
  }
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);
};

const getStorageId = (storage, key, prefix) => {
  try {
    let value = storage.getItem(key);
    if (!value) {
      value = createId(prefix);
      storage.setItem(key, value);
    }
    return value;
  } catch (_error) {
    return createId(prefix);
  }
};

export const getCustomerVisitorId = () =>
  getStorageId(window.localStorage, VISITOR_ID_KEY, 'visitor');

export const getCustomerBehaviorSessionId = () =>
  getStorageId(window.sessionStorage, BEHAVIOR_SESSION_ID_KEY, 'behavior-session');

export const getCustomerSessionId = getCustomerBehaviorSessionId;

const getEventKey = (event) => [
  event.eventType, event.productId || '', event.query || '', event.path || '',
].join('|');

const flushEvents = async () => {
  flushTimer = null;
  if (pendingEvents.length === 0) return;
  const events = pendingEvents.splice(0, pendingEvents.length);
  try {
    const response = await sendCustomerBehaviorEvents(events);
    if (!response.ok) throw new Error('Tracking request failed');
  } catch (error) {
    // Tracking không được làm gián đoạn thao tác mua hàng của khách.
    console.warn('Không thể gửi dữ liệu hành vi khách hàng:', error);
  }
};

export const trackCustomerBehavior = (event = {}) => {
  if (typeof window === 'undefined' || !event.eventType) return;
  const now = Date.now();
  const eventKey = getEventKey(event);
  const previousTime = recentEventKeys.get(eventKey);
  if (previousTime && now - previousTime < DEDUPE_WINDOW_MS) return;
  recentEventKeys.set(eventKey, now);

  for (const [key, timestamp] of recentEventKeys) {
    if (now - timestamp > DEDUPE_WINDOW_MS * 2) recentEventKeys.delete(key);
  }

  pendingEvents.push({
    visitorId: getCustomerVisitorId(),
    sessionId: getCustomerBehaviorSessionId(),
    eventType: event.eventType,
    ...(event.productId ? { productId: String(event.productId) } : {}),
    ...(event.query ? { query: String(event.query).slice(0, 300) } : {}),
    ...(event.path ? { path: String(event.path).slice(0, 500) } : {}),
  });

  if (!flushTimer) flushTimer = window.setTimeout(flushEvents, FLUSH_DELAY_MS);
};

export const flushCustomerBehavior = () => flushEvents();

export const resetCustomerBehaviorTracker = () => {
  pendingEvents = [];
  if (flushTimer) window.clearTimeout(flushTimer);
  flushTimer = null;
  recentEventKeys.clear();
};
