export enum WhatsappOccasion {
  MARKETPLACE_PENDING_ADMIN = 'MARKETPLACE_PENDING_ADMIN',
  MARKETPLACE_ORDER_RECEIVED_CUSTOMER = 'MARKETPLACE_ORDER_RECEIVED_CUSTOMER',
  MARKETPLACE_PAYMENT_APPROVED_CUSTOMER = 'MARKETPLACE_PAYMENT_APPROVED_CUSTOMER',
  CUSTOM = 'CUSTOM',
}

const WHATSAPP_OCCASION_LABELS: Record<WhatsappOccasion, string> = {
  [WhatsappOccasion.MARKETPLACE_PENDING_ADMIN]: 'Admin: pedido pendiente de pago',
  [WhatsappOccasion.MARKETPLACE_ORDER_RECEIVED_CUSTOMER]:
    'Cliente: pedido recibido',
  [WhatsappOccasion.MARKETPLACE_PAYMENT_APPROVED_CUSTOMER]:
    'Cliente: pago aprobado',
  [WhatsappOccasion.CUSTOM]: 'Personalizado',
};

export function getWhatsappOccasionLabel(occasion: string): string {
  return WHATSAPP_OCCASION_LABELS[occasion as WhatsappOccasion] ?? occasion;
}
