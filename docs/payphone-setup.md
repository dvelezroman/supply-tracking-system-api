# Guía de prueba: Payphone (Cajita de Pagos)

Documentación para configurar la cuenta Payphone, completar el `.env` del API y probar el checkout con tarjeta en la tienda (`/tienda/checkout`).

Documentación oficial: [Cajita de Pagos](https://docs.payphone.app/cajita-de-pagos).

---

## 1. Qué hace el sistema

| Paso | Quién | Qué ocurre |
|------|--------|------------|
| 1 | Cliente | Elige **Pagar con tarjeta** en checkout |
| 2 | API | Crea orden `AWAITING_PAYMENT` (stock **aún no** baja) y devuelve config de la Cajita |
| 3 | Front | Renderiza Payphone Cajita v2 (modal) |
| 4 | Payphone | Cliente paga; redirige a la **URL de respuesta** |
| 5 | Front | `/tienda/pago/resultado` lee `id` + `clientTransactionId` |
| 6 | API | `POST` a Payphone Confirm (Bearer token) en ≤ **5 minutos** |
| 7 | API | Si aprobado: baja stock, marca `PAID`, email al admin |

Sin confirmación en 5 min, Payphone **revierte** el cobro automáticamente.

---

## 2. Configuración en la plataforma Payphone

### 2.1 Cuenta y acceso Developer

1. Regístrate / inicia sesión en **[Payphone Business](https://www.payphone.app/)**.
2. Crea (o usa) un usuario con rol **Desarrollador**.
3. Entra al portal **Payphone Developer** (consola de integraciones).

### 2.2 Crear aplicación tipo WEB

1. Crear nueva aplicación / API.
2. Tipo de aplicación: **`WEB`** (obligatorio para Cajita; no es app móvil nativa).
3. Completar campos obligatorios:

| Campo en Payphone | Valor local (dev) | Valor producción |
|-------------------|-------------------|------------------|
| **Dominio Web** | `localhost` (según permita Payphone; a veces `http://localhost:4200`) | Host exacto del front, ej. `www.marea-alta.ec` (sin path) |
| **URL de respuesta** | `http://localhost:4200/tienda/pago/resultado` | `https://TU-DOMINIO/tienda/pago/resultado` |

La Cajita **solo funciona en el dominio registrado**. Otro host → error “Acceso denegado”.

### 2.3 Credenciales a copiar

Tras guardar la app WEB, copia:

| Credencial Payphone | Variable en `.env` |
|---------------------|--------------------|
| **TOKEN** (Bearer) | `PAYPHONE_TOKEN` |
| **STOREID** / Store ID | `PAYPHONE_STORE_ID` |

Usa primero el entorno de **pruebas / sandbox** del Developer. En producción cambia TOKEN/STOREID a los de live.

### 2.4 Entorno de pruebas vs producción

| Entorno | Comportamiento | Dónde revisar |
|---------|----------------|---------------|
| **Pruebas** | Transacciones simuladas (suelen aprobarse); sin cobro bancario real | Developer → Probadores → Transacciones |
| **Producción** | Cobros reales a la cuenta Payphone | Payphone Business → Ventas |

Opcional: invitar usuarios de la app Payphone como **probadores** para simular pagos desde la app.

### 2.5 Checklist portal (antes de probar)

- [ ] App tipo **WEB** creada
- [ ] Dominio Web = mismo host desde el que abres la tienda
- [ ] URL de respuesta = `{FRONTEND_URL}/tienda/pago/resultado` (sin slash final raro; path exacto)
- [ ] TOKEN y STOREID copiados
- [ ] Estás usando credenciales de **pruebas** para el primer E2E

---

## 3. Variables en `api/.env`

Archivo: `api/.env` (plantilla en `api/.env.example`).

### 3.1 Obligatorias para Payphone

```env
# Debe coincidir con el origen del Angular y con Dominio/URL en Payphone Developer
FRONTEND_URL=http://localhost:4200

# Credenciales de la app WEB (Payphone Developer)
PAYPHONE_TOKEN=pega_aqui_el_token
PAYPHONE_STORE_ID=pega_aqui_el_store_id
```

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `FRONTEND_URL` | Sí | Origen del front; la URL de respuesta en Payphone debe ser `{FRONTEND_URL}/tienda/pago/resultado` |
| `PAYPHONE_TOKEN` | Sí | Bearer Token de la app Developer |
| `PAYPHONE_STORE_ID` | Sí | Store ID / STOREID del comercio |

Sin TOKEN + STOREID (o con flag apagado), el checkout **no muestra** “Pagar con tarjeta”.

### 3.2 Opcionales (defaults seguros)

```env
# Endpoint Confirm (dejar default salvo que Payphone indique otro)
PAYPHONE_CONFIRM_URL=https://paymentbox.payphonetodoesposible.com/api/confirm

# false / 0 desactiva Payphone aunque haya token (kill-switch)
PAYPHONE_PAYMENTS_ENABLED=true

# IVA exclusivo en centavos: 1500 = 15% (amountWithTax=subtotal, tax=round(subtotal*0.15))
MARKETPLACE_TAX_RATE_BPS=1500

# Timeout HTTP al llamar Confirm (ms)
PAYPHONE_CONFIRM_TIMEOUT_MS=15000

# Coordenadas opcionales para la Cajita (Ecuador / Portoviejo por defecto)
PAYPHONE_LAT=-1.0547
PAYPHONE_LNG=-80.4545
```

### 3.3 Relacionadas (email de avisos)

```env
# Fallback si en Admin no hay “Correo de pedidos y pagos”
CONTACT_EMAIL=pedidos@tudominio.com

# SMTP para que lleguen avisos de pedido pagado / solicitud
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=noreply@tudominio.com
```

El destino preferido se configura en **Admin → Ajustes de tienda → Correo de pedidos y pagos** (`orderNotificationEmail`). Si está vacío, se usa `CONTACT_EMAIL`.

### 3.4 Ejemplo mínimo para local

```env
FRONTEND_URL=http://localhost:4200
PAYPHONE_TOKEN=eyJ...tu_token_de_pruebas
PAYPHONE_STORE_ID=123456
PAYPHONE_PAYMENTS_ENABLED=true
MARKETPLACE_TAX_RATE_BPS=1500
CONTACT_EMAIL=tu-correo@ejemplo.com
```

Reinicia el API después de editar `.env`.

---

## 4. Configuración en Admin (app)

1. Login como **ADMIN**.
2. Ir a **Marketplace → Ajustes**.
3. Activar **Pagos con tarjeta (Payphone)** (`cardPaymentsEnabled`).
4. (Recomendado) Completar **Correo de pedidos y pagos**.
5. Guardar.

La opción de tarjeta en checkout solo aparece si:

`cardPaymentsEnabled` (admin) **y** `PAYPHONE_TOKEN` + `PAYPHONE_STORE_ID` **y** `PAYPHONE_PAYMENTS_ENABLED` ≠ false.

---

## 5. Cómo probar (E2E)

### 5.1 Preparación

1. Migraciones aplicadas: `cd api && npx prisma migrate deploy`
2. API en marcha (`npm run start:dev` o equivalente).
3. Web en `FRONTEND_URL` (ej. `http://localhost:4200`).
4. Productos publicados con stock.
5. Dominio en Payphone = el mismo host que usas en el navegador.

### 5.2 Flujo feliz (tarjeta)

1. Abrir `/tienda`, agregar productos al carrito.
2. `/tienda/checkout` → datos cliente (nombre, email, teléfono Ecuador).
3. Elegir **Pagar con tarjeta**.
4. Verificar resumen: subtotal + **IVA 15%** + total.
5. Confirmar → se abre el modal de la **Cajita**.
6. Pagar con tarjeta / flujo de prueba de Payphone.
7. Redirect a `/tienda/pago/resultado?id=...&clientTransactionId=...`.
8. La app confirma en el API → redirige a `/tienda/pedido/{orderNumber}`.
9. Orden en admin: estado **PAID**, stock decrementado.
10. Email al correo configurado: asunto tipo pedido pagado + IVA + autorización.

### 5.3 Casos negativos / borde

| Caso | Resultado esperado |
|------|--------------------|
| Cerrar modal sin pagar | Orden `AWAITING_PAYMENT`; stock **sin** bajar; sin email de “pagado” |
| Cajita > ~10 min | Formulario expira; reintentar checkout |
| Confirm > 5 min | Payphone revierte; orden puede quedar `PAYMENT_FAILED` |
| TOKEN/STORE mal | No aparece tarjeta, o error al iniciar / confirmar |
| Dominio no registrado | Cajita: “Acceso denegado” |
| `Referrer-Policy: no-referrer` | Mismo error de acceso; usar `origin` / `origin-when-cross-origin` (ya en `index.html`) |

### 5.4 Flujo email / transferencia (sin Payphone)

Siguen disponibles en checkout híbrido; no requieren `PAYPHONE_*`.

---

## 6. Troubleshooting

| Síntoma | Revisar |
|---------|---------|
| No aparece “Pagar con tarjeta” | Admin `cardPaymentsEnabled`, `.env` TOKEN/STOREID, reinicio API, `PAYPHONE_PAYMENTS_ENABLED` |
| Acceso denegado en Cajita | Dominio Web en Developer vs URL real; Referrer-Policy |
| Redirect OK pero pago no confirma | Logs API al llamar Confirm; TOKEN; ventana de 5 min; body `id` + `clientTxId` |
| Email no llega | SMTP_*, `orderNotificationEmail` / `CONTACT_EMAIL` |
| Monto distinto al carrito | IVA 15% exclusivo: total = subtotal + tax (`MARKETPLACE_TAX_RATE_BPS=1500`) |

---

## 7. Seguridad (recordatorio)

- **Nunca** commits de `PAYPHONE_TOKEN` en git.
- Confirmación Payphone **solo en el API** (Bearer no debe ir al browser salvo el token que la propia Cajita exige en el botón; ese token lo entrega el endpoint de checkout tras crear la orden).
- En producción: HTTPS, dominio registrado, credenciales de **producción** distintas a pruebas.

---

## 8. Referencias internas

- Variables plantilla: [`api/.env.example`](../.env.example)
- Deploy VPS / Referrer: [`api/docs/vps-deploy.md`](./vps-deploy.md)
- Ruta retorno front: `/tienda/pago/resultado`
- Endpoint confirm API: `POST /api/v0/marketplace/orders/payphone/confirm`
