# Payphone Cajita de Pagos — checklist de despliegue

Complementa las variables en `api/.env.example` (`PAYPHONE_*`, `MARKETPLACE_TAX_RATE_BPS`).

## Portal Payphone Developer

1. Cuenta **Payphone Business** + usuario rol **Desarrollador**.
2. Crear aplicación tipo **WEB**.
3. **Dominio Web** = host exacto del front (prod HTTPS; local `localhost`).
4. **URL de respuesta** = `{FRONTEND_URL}/tienda/pago/resultado`
   (ejemplo: `https://www.marea-alta.ec/tienda/pago/resultado`).
5. Copiar **TOKEN** y **STOREID** a `PAYPHONE_TOKEN` / `PAYPHONE_STORE_ID`.
6. Usar credenciales de **pruebas** primero; en producción cambiar el token.

## Front / proxy

- El HTML ya declara `<meta name="referrer" content="origin-when-cross-origin"/>`.
- En nginx/CDN, preferir `Referrer-Policy: origin-when-cross-origin` (evitar `no-referrer`).
- Si hay CSP, permitir `cdn.payphonetodoesposible.com` (script + style).

## Admin tienda

1. Ajustes → activar **Pagos con tarjeta (Payphone)**.
2. Configurar **Correo de pedidos y pagos** (`orderNotificationEmail`).

## Prueba E2E (sandbox)

1. Checkout → Pagar con tarjeta → Cajita → tarjeta de prueba.
2. Redirect a `/tienda/pago/resultado` → confirm API → orden `PAID`.
3. Verificar email admin (pedido pagado + IVA + autorización).
4. Cajita >10 min sin pagar → reintentar; stock intacto hasta confirm.
5. Confirm >5 min → Payphone revierte; orden `PAYMENT_FAILED`.
