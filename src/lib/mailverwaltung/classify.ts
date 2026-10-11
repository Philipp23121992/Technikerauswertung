import type {
  FileCategory,
  MailPriority,
  SenderRole,
} from "./types";

const ROLE_HINTS: { role: SenderRole; tests: RegExp[] }[] = [
  {
    role: "system",
    tests: [
      /no-?reply|noreply|mailer-daemon|notifications?@|alert@|monitor@/i,
    ],
  },
  {
    role: "behoerde",
    tests: [
      /\.(bund|gov|gouv|gc\.ca|europa\.eu)$/i,
      /finanzamt|zoll|arbeitsagentur|ihk|handelskammer/i,
    ],
  },
  {
    role: "chef",
    tests: [
      /geschaeftsfuehrung|geschäftsführung|vorstand|ceo@|gf@|leitung@/i,
    ],
  },
  {
    role: "lieferant",
    tests: [/invoice@|billing@|einkauf|lieferant|supplier|vendor/i],
  },
  {
    role: "kunde",
    tests: [/kunde|customer|support@|service@|gmbh|ag\b|ug\b/i],
  },
];

export function inferSenderRole(email: string, name = ""): SenderRole {
  const hay = `${name} ${email}`.toLowerCase();
  for (const hint of ROLE_HINTS) {
    if (hint.tests.some((test) => test.test(hay))) return hint.role;
  }
  return "unbekannt";
}

const CRITICAL_WORDS =
  /\b(sofort|asap|kritisch|ausfall|offline|eskalation|escalat|notfall|produktion down|klage|abmahnung)\b/i;
const HIGH_WORDS =
  /\b(dringend|eilig|frist|heute noch|deadline|sla|gewährleistung|garantie|reklamation|zahlung überfällig)\b/i;
const LOW_WORDS =
  /\b(newsletter|info-mail|unterlage|fyi|zur kenntnis|einladung zum afterwork)\b/i;

const ROLE_WEIGHT: Record<SenderRole, number> = {
  chef: 2,
  behoerde: 2,
  kunde: 1,
  lieferant: 1,
  system: 0,
  unbekannt: 0,
};

export type PriorityInput = {
  fromEmail: string;
  fromName: string;
  subject: string;
  bodyText: string;
  hasAttachments: boolean;
  attachmentNames: string[];
  senderRole: SenderRole;
  previousCriticalCount: number;
};

export function prioritizeMail(input: PriorityInput): {
  priority: MailPriority;
  reason: string;
} {
  let score = 1;
  const reasons: string[] = [];

  const roleScore = ROLE_WEIGHT[input.senderRole];
  if (roleScore) {
    score += roleScore;
    reasons.push(`Absenderrolle ${input.senderRole}`);
  }

  const text = `${input.subject}\n${input.bodyText}`;
  if (CRITICAL_WORDS.test(text)) {
    score += 4;
    reasons.push("kritische Schlüsselwörter");
  } else if (HIGH_WORDS.test(text)) {
    score += 2;
    reasons.push("Dringlichkeit im Text");
  } else if (LOW_WORDS.test(text)) {
    score -= 1;
    reasons.push("Info-/Newsletter-Charakter");
  }

  const invoiceLike = input.attachmentNames.some((name) =>
    /rechnung|invoice|vertrag|contract|mahnung/i.test(name),
  );
  if (invoiceLike) {
    score += 1;
    reasons.push("geschäftskritischer Anhang");
  } else if (input.hasAttachments) {
    score += 0.5;
    reasons.push("Anhang vorhanden");
  }

  if (input.previousCriticalCount > 0) {
    score += 1;
    reasons.push("historisch kritische Korrespondenz");
  }

  let priority: MailPriority = "normal";
  if (score >= 5) priority = "kritisch";
  else if (score >= 3) priority = "hoch";
  else if (score <= 0) priority = "niedrig";

  return {
    priority,
    reason: reasons.join(", ") || "Standardbewertung",
  };
}

export function classifyAttachment(
  fileName: string,
  mimeType = "",
): { category: FileCategory; important: boolean } {
  const name = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();

  if (/^image\//.test(mime) || /\.(png|jpe?g|gif|webp|tiff?)$/i.test(name)) {
    return { category: "bild", important: false };
  }
  if (/rechnung|invoice|gutschrift|mahnung|zahlung/i.test(name)) {
    return { category: "rechnung", important: true };
  }
  if (/vertrag|contract|nda|vereinbarung|sla/i.test(name)) {
    return { category: "vertrag", important: true };
  }
  if (/formular|antrag|anmeldung|form_/i.test(name)) {
    return { category: "formular", important: true };
  }
  if (/bericht|report|protokoll|auswertung/i.test(name)) {
    return { category: "bericht", important: true };
  }
  if (/\.(pdf|docx?|xlsx?|csv)$/i.test(name)) {
    return { category: "sonstiges", important: true };
  }
  return { category: "sonstiges", important: false };
}
