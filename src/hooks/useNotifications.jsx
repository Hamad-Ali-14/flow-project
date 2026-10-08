import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const NotificationContext = createContext(null);

const seed = () => [
  {
    id: "welcome",
    type: "info",
    title: "Welcome to FLOW OPS",
    message: "Your petroleum station management system is ready. Configure tanks and nozzles to get started.",
    time: new Date().toISOString(),
    read: false,
  },
  {
    id: "price-tip",
    type: "warning",
    title: "Set Fuel Prices",
    message: "Shift closing requires fuel prices to be configured. Visit Tanks & nozzles then Fuel prices.",
    time: new Date(Date.now() - 2 * 60000).toISOString(),
    read: false,
  },
];

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState(seed);

  const addNotification = useCallback((notif) => {
    setNotifications((prev) => [
      {
        ...notif,
        id: notif.id || ("n-" + Date.now()),
        time: new Date().toISOString(),
        read: false,
      },
      ...prev,
    ]);
  }, []);

  const markRead = useCallback((id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const value = useMemo(
    () => ({
      notifications,
      addNotification,
      markRead,
      markAllRead,
      clearAll,
      unreadCount,
    }),
    [notifications, addNotification, markRead, markAllRead, clearAll, unreadCount]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx)
    throw new Error("useNotifications must be inside NotificationProvider");
  return ctx;
}
