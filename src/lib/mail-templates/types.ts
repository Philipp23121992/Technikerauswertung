export const MAIL_TEMPLATE_IDS = [
  "meetings-due",
  "aufgaben-due",
  "aufgaben-rhythm",
  "serviceboard-due",
  "serviceboard-assign",
  "projekte-due",
  "dienstreisen-due",
  "hp-rechnungen-rhythm",
  "kostenvoranschlaege-due",
] as const;

export type MailTemplateId = (typeof MAIL_TEMPLATE_IDS)[number];

export type MailPlaceholder = {
  key: string;
  label: string;
};

export type MailTemplateMeta = {
  id: MailTemplateId;
  name: string;
  description: string;
  placeholders: MailPlaceholder[];
};

export type MailTemplate = {
  id: MailTemplateId;
  enabled: boolean;
  subject: string;
  body: string;
};

export type MailTemplatesDb = {
  version: 1;
  templates: MailTemplate[];
};
