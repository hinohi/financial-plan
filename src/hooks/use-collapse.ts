import { useCallback, useState } from "react";

const STORAGE_PREFIX = "fp.collapse.";

function read(key: string, initial: boolean): boolean {
  if (typeof window === "undefined") return initial;
  try {
    const v = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (v === null) return initial;
    return v === "1";
  } catch {
    return initial;
  }
}

function write(key: string, collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, collapsed ? "1" : "0");
  } catch {
    // ignore
  }
}

/** 折りたたみ状態を localStorage に永続化するフック */
export function useCollapse(key: string, initial = false): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => read(key, initial));
  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      write(key, next);
      return next;
    });
  }, [key]);
  return [collapsed, toggle];
}
