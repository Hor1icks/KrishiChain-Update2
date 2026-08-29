import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import * as notifications from '../api/notifications';

const POLL_MS = 30_000;

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const role = user?.role;
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!role) return;
    const ticket = ++seq.current;
    setLoading(true);
    try {
      const [list, count] = await Promise.all([
        notifications.listNotifications(role),
        notifications.countUnread(role),
      ]);
      if (ticket !== seq.current) return;
      setItems(list);
      setUnread(count);
      setError('');
    } catch (e) {
      if (ticket === seq.current) setError(e.message);
    } finally {
      if (ticket === seq.current) setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    if (!role) {
      setItems([]);
      setUnread(0);
      return undefined;
    }
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [role, refresh]);

  const markRead = useCallback(async (id) => {
    setItems((prev) =>
      prev.map((n) => (n.notificationId === id ? { ...n, isRead: 'Y' } : n))
    );
    setUnread((n) => Math.max(0, n - 1));
    try {
      await notifications.markRead(id);
    } catch {
      refresh(); // put the truth back if the write failed
    }
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: 'Y' })));
    setUnread(0);
    try {
      await notifications.markAllRead(role);
    } catch {
      refresh();
    }
  }, [role, refresh]);

  return (
    <NotificationContext.Provider
      value={{ items, unread, loading, error, refresh, markRead, markAllRead }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used inside <NotificationProvider>');
  return context;
}
