import { NextResponse } from "next/server";

/* Turns database/connection failures into a clean 503 instead of an unhandled 500,
   so the game keeps working (guest mode) when MongoDB is down or not configured. */
export function withDb<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: "database not configured" }, { status: 503 });
    }
    try {
      return await handler(...args);
    } catch (e) {
      console.error("[api]", e);
      return NextResponse.json({ error: "database unavailable" }, { status: 503 });
    }
  };
}
