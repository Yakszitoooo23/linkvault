"use client";

import { createContext, ReactNode, useContext, useMemo, useRef } from "react";
import { createSdk } from "@whop/iframe";

type WhopProviderProps = {
  children: ReactNode;
};

type WhopSdk = ReturnType<typeof createSdk> | null;

const WhopSdkContext = createContext<WhopSdk>(null);

export function WhopProvider({ children }: WhopProviderProps) {
  const appId = process.env.NEXT_PUBLIC_WHOP_APP_ID;
  const sdkRef = useRef<WhopSdk>(null);

  const sdk = useMemo(() => {
    if (!appId) {
      return null;
    }

    if (!sdkRef.current) {
      sdkRef.current = createSdk({ appId });
    }

    return sdkRef.current;
  }, [appId]);

  if (!sdk) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[WhopProvider] NEXT_PUBLIC_WHOP_APP_ID is not set. Whop iframe SDK features will be disabled."
      );
    }
    return <>{children}</>;
  }

  return <WhopSdkContext.Provider value={sdk}>{children}</WhopSdkContext.Provider>;
}

export function useWhopIframeSdk() {
  const sdk = useContext(WhopSdkContext);
  if (!sdk) {
    throw new Error("useWhopIframeSdk must be used within a WhopProvider");
  }
  return sdk;
}

