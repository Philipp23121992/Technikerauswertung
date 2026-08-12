import { createHash, randomBytes, timingSafeEqual } from "crypto";

const PASSWORD_PEPPER = "APM-Servicetools-Users";

export function createPasswordSalt(): string {
  return randomBytes(16).toString("hex");
}

export function hashPassword(password: string, salt: string): string {
  return createHash("sha256")
    .update(`${salt}|${password}|${PASSWORD_PEPPER}`)
    .digest("hex");
}

export function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): boolean {
  const hash = hashPassword(password, salt);
  try {
    return timingSafeEqual(Buffer.from(hash, "utf8"), Buffer.from(expectedHash, "utf8"));
  } catch {
    return false;
  }
}
