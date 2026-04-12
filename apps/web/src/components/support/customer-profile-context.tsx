"use client";

import type { SupportCustomerProfileSummary } from "@shared/types";
import { createContext, useContext } from "react";

type ProfileMap = Record<string, SupportCustomerProfileSummary>;

interface ProfileContextValue {
  profiles: ProfileMap;
  currentUserName: string | null;
}

const CustomerProfileContext = createContext<ProfileContextValue>({
  profiles: {},
  currentUserName: null,
});

export function CustomerProfileProvider({
  profiles,
  currentUserName,
  children,
}: {
  profiles: ProfileMap;
  currentUserName: string | null;
  children: React.ReactNode;
}) {
  return (
    <CustomerProfileContext value={{ profiles, currentUserName }}>
      {children}
    </CustomerProfileContext>
  );
}

export function useCustomerProfile(externalUserId: string | null): SupportCustomerProfileSummary | null {
  const { profiles } = useContext(CustomerProfileContext);
  if (!externalUserId) return null;
  return profiles[externalUserId] ?? null;
}

export function useCurrentUserName(): string | null {
  return useContext(CustomerProfileContext).currentUserName;
}
