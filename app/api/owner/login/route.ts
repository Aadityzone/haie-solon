import { NextRequest, NextResponse } from "next/server";
import {
  authenticateOwner,
  isOwnerAccountConfigured,
  setOwnerSessionCookie,
  setupOwnerPassword,
} from "@/lib/auth";
import { rateLimit, resetRateLimit, clientIp, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET() {
  try {
    const configured = await isOwnerAccountConfigured();
    return NextResponse.json({ success: true, isConfigured: configured });
  } catch (error: unknown) {
    console.error("Auth status error:", error);
    return NextResponse.json({ success: false, error: "Failed to check setup state" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = clientIp(request);
    const limit = await rateLimit("owner-login", identity, RATE_LIMITS.login.limit, RATE_LIMITS.login.windowMs);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many sign-in attempts. Try again later." },
        { status: 429, headers: rateLimitHeaders(limit) }
      );
    }

    const body = await request.json();
    const { password, isSetup } = body;

    if (typeof password !== "string" || password.length === 0 || password.length > 256) {
      return NextResponse.json({ success: false, error: "Password is required" }, { status: 400 });
    }

    const isConfigured = await isOwnerAccountConfigured();

    // If account not configured yet and user is setting it up
    if (!isConfigured && isSetup) {
      const setupToken = process.env.OWNER_SETUP_TOKEN;
      if (!setupToken || typeof body.setupToken !== "string" || body.setupToken !== setupToken) {
        return NextResponse.json({ success: false, error: "Owner setup is disabled or the setup token is invalid." }, { status: 403 });
      }
      if (password.length < 8) {
        return NextResponse.json(
          { success: false, error: "Password must be at least 8 characters long." },
          { status: 400 }
        );
      }
      await setupOwnerPassword(password);
      await resetRateLimit("owner-login", identity, RATE_LIMITS.login.windowMs);
      await setOwnerSessionCookie();
      return NextResponse.json({ success: true, message: "Owner password initialized successfully" });
    }

    // Authenticate
    const isValid = await authenticateOwner(password);
    if (!isValid) {
      return NextResponse.json({ success: false, error: "Invalid password" }, { status: 401 });
    }

    // A correct password clears the count, so mistyping a few times before
    // succeeding does not leave the owner one attempt from a lockout.
    await resetRateLimit("owner-login", identity, RATE_LIMITS.login.windowMs);
    await setOwnerSessionCookie();
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Authentication error";
    console.error("Login error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
