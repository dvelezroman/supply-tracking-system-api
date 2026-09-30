import { sanitizeWhatchimpTemplateParam } from './whatchimp-template-text.util';
import { WhatsappService } from './whatsapp.service';
import {
  buildBankTransferWhatsappSummary,
  buildMarketplacePendingAdminCopy,
} from './whatsapp-messages.util';

describe('sanitizeWhatchimpTemplateParam', () => {
  it('collapses newlines and excess spaces', () => {
    expect(sanitizeWhatchimpTemplateParam('Hola\nmundo\taquí')).toBe(
      'Hola mundo aquí',
    );
    expect(sanitizeWhatchimpTemplateParam('a     b')).toBe('a    b');
  });
});

describe('buildMarketplacePendingAdminCopy', () => {
  it('includes payment method and order short id', () => {
    const copy = buildMarketplacePendingAdminCopy({
      adminName: 'Ana',
      customerName: 'Cliente Demo',
      orderNumber: 'MA-ABCDEFGH',
      subtotalCents: 2500,
      currency: 'USD',
      paymentMethod: 'BANK_TRANSFER',
    });
    expect(copy.contact).toBe('Ana');
    expect(copy.contentMessage).toContain('Transferencia');
    expect(copy.contentMessageExt).toContain('Cliente Demo');
  });
});

describe('buildBankTransferWhatsappSummary', () => {
  it('builds one-line bank summary', () => {
    const summary = buildBankTransferWhatsappSummary({
      orderNumber: 'MA-12345678',
      subtotalCents: 1999,
      currency: 'USD',
      paymentMethod: 'BANK_TRANSFER',
      bankTransfer: {
        bankName: 'Pichincha',
        bankAccountType: 'Ahorros',
        bankAccountNumber: '1234567890',
        bankBeneficiaryName: 'Marea Alta',
        bankBeneficiaryRuc: '1799999999001',
      },
    });
    expect(summary).toContain('Banco: Pichincha');
    expect(summary).toContain('Beneficiario: Marea Alta');
    expect(summary).toContain('RUC: 1799999999001');
    expect(summary).toContain('1234567890');
    expect(summary).toContain('Referencia: MA-12345678');
    expect(summary.length).toBeLessThanOrEqual(1024);
  });
});

describe('WhatsappService', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  let service: WhatsappService;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NOTIFICADOR_ENABLED;
    delete process.env.NOTIFICADOR_BASE_URL;
    delete process.env.NOTIFICADOR_API_KEY;
    delete process.env.NOTIFICADOR_TEMPLATE_DEFAULT;
    delete process.env.NOTIFICADOR_WHATSAPP_SEND_PATH;
    delete process.env.NOTIFICADOR_TIMEOUT_MS;
    delete process.env.NOTIFICADOR_PHONE_FORMAT;
    service = new WhatsappService();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('reports not configured when disabled', () => {
    expect(service.isEnabled()).toBe(false);
    expect(service.isConfigured()).toBe(false);
  });

  it('sends template when enabled and configured', async () => {
    process.env.NOTIFICADOR_ENABLED = 'true';
    process.env.NOTIFICADOR_BASE_URL = 'https://ws-api.example/api/v1';
    process.env.NOTIFICADOR_API_KEY = 'secret-key';
    process.env.NOTIFICADOR_TEMPLATE_DEFAULT = 'tpl-1';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(JSON.stringify({ status: '1', message: 'ok' })),
    });
    global.fetch = fetchMock as typeof fetch;

    const result = await service.sendDefaultTemplate({
      phoneDigits: '+593991234567',
      contact: 'Ana',
      contentMessage: 'Pedido confirmado.',
      contentMessageExt: 'Total $10.00',
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://ws-api.example/api/v1/whatchimp/messages/send-template-message',
    );
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('secret-key');
    expect(typeof init.body).toBe('string');
    const body = JSON.parse(init.body as string) as {
      phoneNumber: string;
      templateVariables: Record<string, string>;
    };
    expect(body.phoneNumber).toBe('+593991234567');
    expect(body.templateVariables.contact).toBe('Ana');
  });
});
