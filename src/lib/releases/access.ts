import { NextResponse } from "next/server";
import { denyIfResponse, forbiddenResponse, requireUser } from "@/lib/auth/guards";
import { readReleasesDb } from "./db";
import { flagEnabledForUser, isAdminUser, normalizeFlagId } from "./types";

/** API-Schutz für noch nicht freigegebene Funktionen. */
export async function requireReleaseFlag(req: Request, id: string) {
  const user = await requireUser(req);
  if (denyIfResponse(user)) return user;
  const flagId = normalizeFlagId(id);
  const db = await readReleasesDb();
  const flag = db.flags.find((item) => item.id === flagId);
  if (!flag) {
    if (isAdminUser(user)) return user;
    return forbiddenResponse("Diese Funktion ist noch nicht freigegeben.");
  }
  if (!flagEnabledForUser(flag, user)) {
    return forbiddenResponse("Diese Funktion ist noch nicht freigegeben.");
  }
  return user;
}
