import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Profile } from "@/app/_model/types";
import { fetchWithAbortedTransactionRetry } from "./fetch-retry";

let browserClient: SupabaseClient | null = null;
let ownerWriteClient: SupabaseClient | null = null;
let audienceClient: SupabaseClient | null = null;
let anonymousSignInPromise: ReturnType<SupabaseClient["auth"]["signInAnonymously"]> | null = null;
let ownerAccessToken: string | null = null;

export const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_DATA_MODE === "supabase" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

export function getSupabaseClient() {
  if (!supabaseConfigured) return null;
  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      // detectSessionInUrl: /auth/callback 으로 돌아온 첫 로드에서 ?code= 를 세션으로 교환한다.
      {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
        global: { fetch: fetchWithAbortedTransactionRetry }
      }
    );
  }
  return browserClient;
}

/** 인증 이벤트가 전달한 최신 토큰을 hot-path 쓰기에서 auth lock 없이 재사용한다. */
export function setOwnerAccessToken(accessToken: string | null) {
  ownerAccessToken = accessToken;
}

/** 강의 토글처럼 짧은 쓰기는 메모리 토큰을 써서 매 요청의 getSession lock을 피한다. */
export function getOwnerWriteSupabaseClient() {
  if (!supabaseConfigured) return null;
  if (!ownerWriteClient) {
    ownerWriteClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        accessToken: async () => ownerAccessToken,
        global: { fetch: fetchWithAbortedTransactionRetry }
      }
    );
  }
  return ownerWriteClient;
}

/**
 * 청중 페이지는 강사 로그인과 별도의 Auth 저장소를 사용한다.
 * 같은 브라우저에서 발표자 화면과 청중 화면을 함께 열어도 청중 쓰기가
 * admin JWT로 전송되어 participant 전용 RLS에 막히지 않게 한다.
 */
export function getAudienceSupabaseClient() {
  if (!supabaseConfigured) return null;
  if (!audienceClient) {
    audienceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        auth: {
          storageKey: "pin-class-audience-auth-v1",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: "pkce"
        },
        global: { fetch: fetchWithAbortedTransactionRetry }
      }
    );
  }
  return audienceClient;
}

/** 현재 세션 사용자. 없다고 해서 익명 세션을 만들지는 않는다. */
export async function getSessionUser(): Promise<User | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.user ?? null;
}

/**
 * /api/convert 가 업로드를 사용자 폴더에 넣으려면 누가 보냈는지 알아야 한다.
 * 업로드는 로그인한 강사 전용이므로 익명 세션으로 대체하지 않는다.
 */
export async function getAccessToken() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  if (!data.session || data.session.user.is_anonymous) return null;
  return data.session.access_token ?? null;
}

/** Local magic links and older OAuth callbacks may return validated tokens in the URL fragment. */
export async function restoreSessionFromUrlHash(hash: string) {
  if (!hash.startsWith("#")) return false;
  const params = new URLSearchParams(hash.slice(1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return false;
  const client = getSupabaseClient();
  if (!client) return false;
  const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw error;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return true;
}

export async function signInWithGoogle(next = "/") {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 모드에서만 로그인할 수 있습니다.");
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  if (error) throw error;
}

export function canUseLocalDevelopmentLogin() {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return false;
  return window.location.hostname === "127.0.0.1"
    || window.location.hostname === "localhost"
    || window.location.hostname === "::1";
}

/** 로컬 개발 서버에서만 일회용 토큰을 받아 복제 데이터의 강사로 로그인한다. */
export async function signInForLocalDevelopment() {
  if (!canUseLocalDevelopmentLogin()) throw new Error("로컬 개발 환경에서만 자동 로그인할 수 있습니다.");
  const client = getSupabaseClient();
  if (!client) throw new Error("로컬 Supabase가 설정되지 않았습니다.");

  const response = await fetch("/api/dev/local-login", {
    method: "POST",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { tokenHash?: string; error?: string } | null;
  if (!response.ok || !payload?.tokenHash) {
    throw new Error(payload?.error ?? "로컬 자동 로그인에 실패했습니다.");
  }

  const { error } = await client.auth.verifyOtp({
    token_hash: payload.tokenHash,
    type: "magiclink",
  });
  if (error) throw error;
}

export async function signOutUser() {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function fetchOwnProfile(userId: string): Promise<Profile | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.from("profiles")
    .select("id, role, email, display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, role: data.role, email: data.email, displayName: data.display_name, avatarUrl: data.avatar_url };
}

/** 수강생(QR 참여) 전용 — 세션이 없으면 익명으로 만들어 준다. */
export async function ensureAnonymousUser() {
  const client = getAudienceSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  if (data.session?.user?.is_anonymous) return data.session.user;
  if (data.session?.user) await client.auth.signOut({ scope: "local" });
  if (!anonymousSignInPromise) anonymousSignInPromise = client.auth.signInAnonymously();
  try {
    const { data: signedIn, error } = await anonymousSignInPromise;
    if (error) throw error;
    return signedIn.user;
  } finally {
    anonymousSignInPromise = null;
  }
}

/** 참여자 전용 API 호출에 쓰는 익명 세션 토큰. 강사 토큰과 섞지 않는다. */
export async function getAudienceAccessToken() {
  const client = getAudienceSupabaseClient();
  if (!client) return null;
  await ensureAnonymousUser();
  const { data } = await client.auth.getSession();
  return data.session?.user?.is_anonymous ? data.session.access_token : null;
}
