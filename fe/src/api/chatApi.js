import { apiFetch } from './httpClient';

export const sendChatMessage = (payload) => apiFetch('/chat/send', {
  method: 'POST',
  json: payload,
});

export const clearChatHistory = (sessionId) => apiFetch('/chat/clear', {
  method: 'DELETE',
  json: sessionId ? { sessionId } : {},
});

export const sendCustomerBehaviorEvents = (events) => apiFetch('/chat/events', {
  method: 'POST',
  json: { events },
});
