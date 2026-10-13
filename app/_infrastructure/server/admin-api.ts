import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseClientForToken } from "@/app/_infrastructure/supabase/server";

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly retryable = false,
  ) {
    super(code);
  }
}

export interface AdminRequestContext {
  client: SupabaseClient;
  user: User;
  accessToken: string;
}

export async function requireAdminRequest(request: Request): Promise<AdminRequestContext> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) throw new AdminApiError(401, "AUTH_REQUIRED");

  const accessToken = match[1];
  const client = getSupabaseClientForToken(accessToken);
  if (!client) throw new AdminApiError(503, "AI_REPORT_NOT_CONFIGURED", true);

  const { data: userData, error: userError } = await client.auth.getUser(accessToken);
  if (userError || !userData.user || userData.user.is_anonymous) {
    throw new AdminApiError(401, "AUTH_REQUIRED");
  }
  const { data: profile, error: profileError } = await client.from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) throw new AdminApiError(503, "AUTH_CHECK_FAILED", true);
  if (profile?.role !== "admin") throw new AdminApiError(403, "ADMIN_REQUIRED");
  return { client, user: userData.user, accessToken };
}

/** QR 참여자(익명 Supabase 세션) 요청. 조회는 호출자 토큰 그대로 RLS 를 통과해야 한다. */
export async function requireParticipantRequest(request: Request): Promise<AdminRequestContext> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) throw new AdminApiError(401, "AUTH_REQUIRED");
  const accessToken = match[1];
  const client = getSupabaseClientForToken(accessToken);
  if (!client) throw new AdminApiError(503, "SUPABASE_NOT_CONFIGURED", true);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user || !data.user.is_anonymous) throw new AdminApiError(401, "AUTH_REQUIRED");
  return { client, user: data.user, accessToken };
}

export function adminApiErrorResponse(error: unknown) {
  if (error instanceof AdminApiError) {
    return Response.json({ error: { code: error.code, retryable: error.retryable } }, { status: error.status });
  }
  return Response.json({ error: { code: "AI_REPORT_INTERNAL_ERROR", retryable: true } }, { status: 500 });
}

export async function readSmallJsonBody(request: Request, maxBytes = 16_384): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new AdminApiError(413, "REQUEST_TOO_LARGE");
  }
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > maxBytes) throw new AdminApiError(413, "REQUEST_TOO_LARGE");
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new AdminApiError(400, "INVALID_JSON");
  }
}
