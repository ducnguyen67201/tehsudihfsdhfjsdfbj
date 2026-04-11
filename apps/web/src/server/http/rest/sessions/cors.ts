import { NextResponse } from "next/server";

export function sessionCorsHeaders(methods = "POST, OPTIONS"): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Content-Encoding",
    "Access-Control-Max-Age": "86400",
  };
}

export function jsonWithCors(
  body: Record<string, unknown>,
  status: number,
  options?: { methods?: string; extraHeaders?: HeadersInit }
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { ...sessionCorsHeaders(options?.methods), ...options?.extraHeaders },
  });
}

export function withCorsHeaders(response: NextResponse, methods?: string): NextResponse {
  for (const [key, value] of Object.entries(sessionCorsHeaders(methods))) {
    response.headers.set(key, value);
  }
  return response;
}
