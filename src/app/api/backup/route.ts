import { NextResponse } from "next/server";
import {
  mergeAndWriteLocalBackup,
  readLocalBackup,
  type LocalBackupPayload,
} from "@/lib/local-backup";

export const runtime = "nodejs";

/** Liefert alle serverseitig gespeicherten lokalen App-Daten. */
export async function GET() {
  const backup = await readLocalBackup();
  return NextResponse.json({
    ...backup,
    stats: {
      trackerTickets: Object.keys(backup.tracker?.tickets ?? {}).length,
      trackerTechnicians: backup.tracker?.technicians?.length ?? 0,
      urlaubeRequests: backup.urlaube.requests.length,
      meetingsTechniker: backup.meetingsTechniker.protocols.length,
      meetingsRessourcen: backup.meetingsRessourcen.protocols.length,
      meetingsTechnicians: backup.meetingsTechnicians.technicians.length,
    },
  });
}

/**
 * Nimmt Browser-localStorage-Daten entgegen und speichert die reichere Version
 * dauerhaft unter /data (für GitHub/Server).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as LocalBackupPayload | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Ungültige Backup-Daten." }, { status: 400 });
  }

  const saved = await mergeAndWriteLocalBackup({
    ...body,
    source: body.source ?? "browser-localstorage",
  });

  return NextResponse.json({
    ok: true,
    exportedAt: saved.exportedAt,
    stats: {
      trackerTickets: Object.keys(saved.tracker?.tickets ?? {}).length,
      trackerTechnicians: saved.tracker?.technicians?.length ?? 0,
      urlaubeRequests: saved.urlaube.requests.length,
      meetingsTechniker: saved.meetingsTechniker.protocols.length,
      meetingsRessourcen: saved.meetingsRessourcen.protocols.length,
      meetingsTechnicians: saved.meetingsTechnicians.technicians.length,
    },
  });
}
