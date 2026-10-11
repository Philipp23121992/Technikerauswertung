import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
export const SMTP_CONFIG_PATH = path.join(DATA_DIR, "smtp-config.json");

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

export type PublicSmtpConfig = Omit<SmtpConfig, "pass"> & {
  configured: boolean;
  hasPassword: boolean;
};

const EMPTY: SmtpConfig = {
  host: "",
  port: 587,
  secure: false,
  user: "",
  pass: "",
  from: "",
};

function fromEnv(): SmtpConfig | null {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }
  const port = Number(process.env.SMTP_PORT || 587);
  return {
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
  };
}

export async function readSmtpConfig(): Promise<SmtpConfig> {
  try {
    const raw = await fs.readFile(SMTP_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<SmtpConfig>;
    const fileConfig: SmtpConfig = {
      host: typeof parsed.host === "string" ? parsed.host.trim() : "",
      port: Number(parsed.port) || 587,
      secure: Boolean(parsed.secure) || Number(parsed.port) === 465,
      user: typeof parsed.user === "string" ? parsed.user.trim() : "",
      pass: typeof parsed.pass === "string" ? parsed.pass.trim() : "",
      from: typeof parsed.from === "string" ? parsed.from.trim() : "",
    };
    if (fileConfig.host && fileConfig.user && fileConfig.pass) {
      return {
        ...fileConfig,
        from: fileConfig.from || fileConfig.user,
      };
    }
  } catch {
    /* fall through to env */
  }

  return fromEnv() ?? { ...EMPTY };
}

export async function writeSmtpConfig(
  input: Partial<SmtpConfig> & { keepPassword?: boolean },
): Promise<SmtpConfig> {
  const current = await readSmtpConfig();
  const next: SmtpConfig = {
    host: (input.host ?? current.host).trim(),
    port: Number(input.port ?? current.port) || 587,
    secure: Boolean(input.secure ?? current.secure),
    user: (input.user ?? current.user).trim(),
    pass:
      input.keepPassword || input.pass === undefined || input.pass === ""
        ? current.pass
        : input.pass.trim(),
    from: (input.from ?? current.from).trim(),
  };
  if (!next.from) next.from = next.user;
  if (next.port === 465) next.secure = true;

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SMTP_CONFIG_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function toPublicSmtpConfig(config: SmtpConfig): PublicSmtpConfig {
  const configured = Boolean(config.host && config.user && config.pass);
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    from: config.from,
    configured,
    hasPassword: Boolean(config.pass),
  };
}

export function isSmtpConfigReady(config: SmtpConfig): boolean {
  return Boolean(config.host && config.user && config.pass);
}
