import { apiFetch } from './httpClient';

export const sendChatMessage = (payload) => apiFetch('/chat/send', {
  method: 'POST',
  json: payload,
});

export const clearChatHistory = (chatSessionId, visitorId) => apiFetch('/chat/clear', {
  method: 'DELETE',
  json: {
    chatSessionId,
    ...(visitorId ? { visitorId } : {}),
  },
});

export const getChatHistory = (chatSessionId, visitorId) => {
  const params = new URLSearchParams({ chatSessionId });
  if (visitorId) params.set('visitorId', visitorId);
  return apiFetch('/chat/history?' + params.toString(), {
    method: 'GET',
  });
};

export const sendCustomerBehaviorEvents = (events) => apiFetch('/chat/events', {
  method: 'POST',
  json: { events },
});
