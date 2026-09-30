export type SendWhatsappTemplateArgs = {
  templateId: string;
  /** Digits only or E.164; service strips non-digits for formatting. */
  phoneDigits: string;
  contact: string;
  contentMessage: string;
  contentMessageExt?: string;
};

export type SendWhatsappResult = {
  ok: boolean;
  status: number;
  body: unknown;
};
