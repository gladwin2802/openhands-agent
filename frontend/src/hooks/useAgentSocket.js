import { useState, useEffect, useRef, useCallback } from 'react';
import { getWebSocketUrl, getSessionEvents } from '../api';

/**
 * Custom hook for WebSocket connection to stream agent events.
 *
 * @param {string|null} sessionId - The session to connect to.
 * @returns {{ events, isConnected }}
 */
export default function useAgentSocket(sessionId) {
  const [events, setEvents] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const isMountedRef = useRef(false);

  const loadInitialEvents = async (sid) => {
    try {
      const initialEvents = await getSessionEvents(sid);
      if (isMountedRef.current) {
        setEvents(initialEvents);
      }
    } catch (e) {
      console.error('Failed to load initial events:', e);
    }
  };

  const connect = useCallback(() => {
    if (!sessionId) return;

    const url = getWebSocketUrl(sessionId);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      if (!isMountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        setEvents((prev) => {
          // Deduplicate exact events if they have an ID
          if (data.id && prev.some(e => e.id === data.id)) {
            return prev;
          }
          if (data.event_type === 'message') {
            const isStreaming = data.payload?.streaming;
            const role = data.payload?.role;
            const content = data.payload?.content || '';

            if (isStreaming && role === 'assistant') {
              const lastEvent = prev[prev.length - 1];
              if (lastEvent && lastEvent.event_type === 'message' && lastEvent.payload?.role === 'assistant' && lastEvent.payload?.streaming) {
                const newPrev = [...prev];
                newPrev[newPrev.length - 1] = {
                  ...lastEvent,
                  payload: {
                    ...lastEvent.payload,
                    content: lastEvent.payload.content + content
                  }
                };
                return newPrev;
              } else {
                return [...prev, data];
              }
            } else if (!isStreaming && role === 'assistant' && prev.length > 0) {
              const lastEvent = prev[prev.length - 1];
              if (lastEvent.event_type === 'message' && lastEvent.payload?.role === 'assistant' && lastEvent.payload?.streaming) {
                const newPrev = [...prev];
                newPrev[newPrev.length - 1] = {
                  ...lastEvent,
                  payload: {
                    ...lastEvent.payload,
                    content: content,
                    streaming: false
                  }
                };
                return newPrev;
              }
            }
          }
          return [...prev, data];
        });
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.onclose = () => {
      if (!isMountedRef.current) return;
      setIsConnected(false);
      // Attempt reconnect after 3 seconds
      reconnectTimerRef.current = setTimeout(() => {
        if (sessionId && isMountedRef.current) connect();
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      ws.close();
    };
  }, [sessionId]);

  useEffect(() => {
    isMountedRef.current = true;
    // Reset events when session changes
    setEvents([]);

    if (sessionId) {
      loadInitialEvents(sessionId).then(() => {
        if (isMountedRef.current) {
          connect();
        }
      });
    }

    return () => {
      isMountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent onclose from firing after unmount
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [sessionId, connect]);

  return { events, isConnected };
}
