import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireOwnerAuth } from "@/lib/auth";
import { getDb, initDb } from "@/lib/db";
import { logError } from "@/lib/logger";
import crypto from "node:crypto";

/**
 * The public homepage renders the service catalogue. Marking it for
 * revalidation means an owner's edit is visible on the next visit instead of
 * waiting for the time-based revalidate window to lapse.
 */
function refreshPublicMenu(): void {
  try {
    revalidatePath("/");
  } catch {
    // Revalidation is an optimisation; never fail the mutation because of it.
  }
}

/**
 * Service images are served from this site, so only site-relative paths are
 * accepted. That prevents an owner account from pointing the public menu at an
 * arbitrary third-party origin (and from injecting a `javascript:` URL).
 */
function normalizeImageUrl(value: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "Image must be a site path such as /images/gallery/gallery-2.jpg." };
  const trimmed = value.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.length > 300) return { ok: false, error: "Image path must be 300 characters or fewer." };
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return { ok: false, error: "Image path must start with a single / and point to a file on this site." };
  }
  if (/[\s"'<>\\]/.test(trimmed)) return { ok: false, error: "Image path contains characters that are not allowed." };
  return { ok: true, value: trimmed };
}

export async function GET() {
  const isAuth = await requireOwnerAuth();
  if (!isAuth) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  await initDb();
  const db = getDb();

  const result = await db.execute(
    `SELECT id, category_id, category_name, name, description, price_rupees, duration_minutes, is_active, sort_order, image_url, price_verified
     FROM services 
     ORDER BY category_name ASC, sort_order ASC, name ASC;`
  );

  return NextResponse.json({
    success: true,
    services: result.rows.map((r) => ({
      id: String(r.id),
      categoryId: String(r.category_id),
      categoryName: String(r.category_name),
      name: String(r.name),
      description: r.description ? String(r.description) : null,
      priceRupees: r.price_rupees !== null ? Number(r.price_rupees) : null,
      durationMinutes: Number(r.duration_minutes),
      isActive: Boolean(r.is_active),
      sortOrder: Number(r.sort_order),
      imageUrl: r.image_url ? String(r.image_url) : null,
      priceVerified: Number(r.price_verified) === 1,
    })),
  });
}

export async function PUT(request: NextRequest) {
  const isAuth = await requireOwnerAuth();
  if (!isAuth) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, name, description, priceRupees, durationMinutes, isActive, imageUrl } = body;

    if (typeof id !== "string" || id.length > 100 || typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100 || (description != null && typeof description !== "string") || typeof isActive !== "boolean") {
      return NextResponse.json({ success: false, error: "id and name are required" }, { status: 400 });
    }

    const image = normalizeImageUrl(imageUrl);
    if (!image.ok) return NextResponse.json({ success: false, error: image.error }, { status: 400 });

    await initDb();
    const db = getDb();

    if (priceRupees !== null && priceRupees !== undefined && (!Number.isInteger(Number(priceRupees)) || Number(priceRupees) < 0 || Number(priceRupees) > 1000000)) {
      return NextResponse.json({ success: false, error: "Price must be a whole number from 0 to 1,000,000, or null." }, { status: 400 });
    }
    if (!Number.isInteger(Number(durationMinutes)) || Number(durationMinutes) < 5 || Number(durationMinutes) > 480) {
      return NextResponse.json({ success: false, error: "Duration must be between 5 and 480 minutes." }, { status: 400 });
    }

    const result = await db.execute({
      // Saving the row is what turns a proposed starting price into an
      // owner-reviewed one, which is what the public menu reports.
      sql: `UPDATE services 
            SET name = ?, description = ?, price_rupees = ?, duration_minutes = ?, is_active = ?, image_url = ?, price_verified = 1
            WHERE id = ?`,
      args: [
        name.trim(),
        description?.trim() || null,
        priceRupees !== undefined && priceRupees !== null ? Number(priceRupees) : null,
        durationMinutes ? Number(durationMinutes) : 30,
        isActive === true ? 1 : 0,
        image.value,
        id,
      ],
    });

    if (!result.rowsAffected) return NextResponse.json({ success: false, error: "Service not found." }, { status: 404 });

    refreshPublicMenu();
    return NextResponse.json({ success: true, message: "Service updated successfully" });
  } catch (error: unknown) {
    logError("owner.services.update", error);
    return NextResponse.json({ success: false, error: "Could not save that service. Please try again." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireOwnerAuth())) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 100 || !Number.isInteger(body.durationMinutes) || body.durationMinutes < 5 || body.durationMinutes > 480 || (body.priceRupees != null && (!Number.isInteger(body.priceRupees) || body.priceRupees < 0 || body.priceRupees > 1000000)) || (body.description != null && typeof body.description !== "string") || (body.categoryName != null && typeof body.categoryName !== "string")) {
      return NextResponse.json({ success: false, error: "Valid name, duration, and optional non-negative whole number price are required." }, { status: 400 });
    }
    await initDb();
    const db = getDb();
    const image = normalizeImageUrl(body.imageUrl);
    if (!image.ok) return NextResponse.json({ success: false, error: image.error }, { status: 400 });
    const id = crypto.randomUUID();
    const categoryName = typeof body.categoryName === "string" && body.categoryName.trim() ? body.categoryName.trim().slice(0, 80) : "Other";
    // A service the owner creates by hand carries their own price from the start.
    await db.execute({ sql: `INSERT INTO services (id, category_id, category_name, name, description, price_rupees, duration_minutes, is_active, sort_order, image_url, price_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 999, ?, 1, ?)`, args: [id, categoryName.toLowerCase().replace(/[^a-z0-9]+/g, "-"), categoryName, body.name.trim(), typeof body.description === "string" ? body.description.trim().slice(0, 500) : null, body.priceRupees ?? null, body.durationMinutes, body.isActive === true ? 1 : 0, image.value, new Date().toISOString()] });
    refreshPublicMenu();
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error: unknown) {
    logError("owner.services.create", error);
    return NextResponse.json({ success: false, error: "Could not add that service. Please try again." }, { status: 500 });
  }
}
