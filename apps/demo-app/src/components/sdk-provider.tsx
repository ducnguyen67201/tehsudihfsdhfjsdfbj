"use client";

import { initSDK } from "@/lib/sdk";
import { type ReactNode, useEffect } from "react";

export function SDKProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initSDK();
  }, []);

  return <>{children}</>;
}
