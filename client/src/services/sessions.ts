import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { getClientId } from "@/lib/client-id";
import { apiUrl } from "@/lib/api-base";
import type { SessionInfo } from "@/types/session";

export const listSessions = () =>
  apiGet<{ sessions: SessionInfo[] }>("/api/sessions").then((r) => r.sessions ?? []);

export const createSession = (name: string, plan?: "free" | "paid") =>
  apiPost<{ id: string }>("/api/sessions", { name, plan });

export const deleteSession = (id: string) => apiDelete(`/api/sessions/${id}`);

export const logoutSession = (id: string) => apiPost<void>(`/api/sessions/${id}/logout`, {});

export const pairSession = (id: string) => apiPost<void>(`/api/sessions/${id}/pair`, {});

export type SessionUpdate = {
  name: string;
  color: string;
  isDefault: boolean;
  allowGroups: boolean;
  queueId: string;
  redirectMinutes: number;
  flowId: string;
  chatFlowId?: string;
  greetingMessage?: string;
  completionMessage?: string;
  outOfHoursMessage?: string;
  surveyEnabled?: boolean;
  surveyPrompt?: string;
};

export const updateSession = async (id: string, body: SessionUpdate): Promise<void> => {
  await apiPut<void>(`/api/sessions/${id}`, body);
};

export const regenerateToken = async (id: string): Promise<string> => {
  const j = await apiPost<{ token: string }>(`/api/sessions/${id}/token`, {});
  return j.token;
};

export type AccountHealth = {
  sessionId: string;
  connected: boolean;
  loggedIn: boolean;
  state: string;
  paired: boolean;
  jid: string;
  lid: string;
  pushName: string;
  businessName: string;
  platform: string;
  isBusiness: boolean;
  restricted: boolean;
  restrictionKey: string;
  reachoutExpiresAt: number;
  capTotal: number;
  capUsed: number;
  capCycleStart: number;
  capCycleEnd: number;
  oteStatus: string;
  mvStatus: string;
  cappingStatus: string;
  queriedAt: number;
};

export const fetchAccountHealth = (id: string) =>
  apiGet<AccountHealth>(`/api/sessions/${id}/health`);
