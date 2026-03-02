"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

interface TimezoneCtx {
  timezone: string;
  setTimezone: (tz: string) => void;
}

const TimezoneContext = createContext<TimezoneCtx>({
  timezone: "UTC",
  setTimezone: () => {},
});

export function useTimezone() {
  return useContext(TimezoneContext);
}

export function TimezoneProvider({ children }: { children: React.ReactNode }) {
  const [timezone, setTzState] = useState(() =>
    typeof window !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"
  );

  // Load saved preference
  useEffect(() => {
    fetch("/api/user/timezone")
      .then((r) => r.json())
      .then((d) => { if (d.timezone) setTzState(d.timezone); })
      .catch(() => {});
  }, []);

  const setTimezone = useCallback((tz: string) => {
    setTzState(tz);
    fetch("/api/user/timezone", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: tz }),
    }).catch(() => {});
  }, []);

  return (
    <TimezoneContext.Provider value={{ timezone, setTimezone }}>
      {children}
    </TimezoneContext.Provider>
  );
}
