import { redirect } from "next/navigation";

export default function MeetingsSmtpRedirect() {
  redirect("/einstellungen/smtp");
}
