export async function findActiveKioskByIdentifier(ctx: any, identifier?: string | null) {
  const lookup = identifier?.trim();
  if (!lookup) {
    return null;
  }

  const byDocumentId = await ctx.db.get(lookup as any).catch(() => null);
  if (byDocumentId?.active) {
    return byDocumentId;
  }

  const directMatches = await ctx.db
    .query("kiosks")
    .withIndex("by_kiosk_id", (q: any) => q.eq("kioskId", lookup))
    .collect();
  const directMatch = directMatches.find((k: any) => k.active);
  if (directMatch) {
    return directMatch;
  }

  const normalizedLookup = lookup.toLowerCase();
  const kiosks = await ctx.db
    .query("kiosks")
    .withIndex("by_active", (q: any) => q.eq("active", true))
    .collect();
  return kiosks.find(
    (k: any) =>
      k.name.trim().toLowerCase() === normalizedLookup ||
      (k.kioskId || "").trim().toLowerCase() === normalizedLookup,
  ) || null;
}
