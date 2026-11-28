# FieldFlow

**ES** · PWA bilingüe (español/inglés) de agendamiento, coordinación y logística para el agro. El cliente escribe por WhatsApp → recibe un botón → abre la app → conversa con el asistente (texto o voz) → su cita queda en el calendario del negocio.
**EN** · Bilingual PWA for agro scheduling, coordination and logistics. Customer messages on WhatsApp → gets a button → opens the app → chats with the assistant (text or voice) → the booking lands on the business calendar.

```
WhatsApp ──► /webhooks/whatsapp ──► botón con enlace personal (7 días)
                                        ▼
                  PWA /#/chat ─► Groq (LLM) + herramientas ─► Postgres (Neon)
                  PWA /#/negocio (calendario, chats, clientes, ajustes)
```

---

## Español

### ⚠️ Importante sobre el plan gratis de Vercel
El plan **Hobby** de Vercel es solo para **uso personal y no comercial** (según sus términos). FieldFlow es un producto para un negocio/cliente: para producción con clientes reales necesitarás el plan **Pro**. Para pruebas, demos y desarrollo, Hobby sirve. Revisa los términos vigentes en vercel.com/legal.

### 1. Qué incluye
PWA instalable (iPhone incl. Pro Max y compactos, Android, iPad, laptop; claro/oscuro; contraste AA). Cliente: chat con asistente (texto + voz), «Mis citas». Negocio: Hoy, calendario por «parcelas», bandeja con toma de control humana, clientes, ajustes, simulador de WhatsApp. Backend: Vercel Functions + Postgres, sin doble agendamiento, webhook firmado, idempotencia. Sin `LLM_API_KEY` el asistente usa un flujo guiado (sin IA).

### 2. Desplegar en Vercel
1. Descomprime el ZIP y sube el **contenido** de la carpeta `fieldflow/` a un repositorio de GitHub (el `package.json` debe quedar en la raíz).
2. En vercel.com → **Add New → Project** → importa el repositorio. Framework Preset: **Other**. No cambies nada más: `vercel.json` ya define build (`npm run build`), carpeta de salida (`public`) y funciones.
3. **Base de datos:** en el proyecto → **Storage → Create / Connect → Neon (Postgres)** (plan gratis). Vercel crea `DATABASE_URL` automáticamente. Las tablas se crean solas en la primera petición (`db/migrations/`).
4. **Variables de entorno** (Settings → Environment Variables):

| Variable | Valor |
|---|---|
| `APP_URL` | `https://tu-dominio.com` |
| `SESSION_SECRET` | cadena aleatoria ≥ 32 caracteres |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | tu acceso inicial (contraseña ≥ 8) |
| `LLM_BASE_URL` | `https://api.groq.com/openai/v1` |
| `LLM_MODEL` | `openai/gpt-oss-120b` |
| `LLM_API_KEY` | tu clave de Groq |
| `LLM_DAILY_LIMIT` | p. ej. `800` |
| `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID` | de Meta |
| `APP_SECRET` | secreto de la app de Meta |
| `VERIFY_TOKEN` | texto que tú inventas |
| `WHATSAPP_PUBLIC_NUMBER` | número con país, sin `+` |
| `BREVO_API_KEY` | clave v3 de la API de Brevo (códigos de verificación y recuperar contraseña) |
| `MAIL_FROM` | remitente verificado en Brevo, p. ej. `FieldFlow <no-reply@tudominio.com>` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | ingreso con Google (ver 2c) |
| `APP_URL` | (opcional) dirección pública, p. ej. `https://fieldflow-six-topaz.vercel.app` |

5. **Vuelve a desplegar** (Deployments → ⋯ → Redeploy): las variables nuevas solo aplican a despliegues nuevos.
6. Entra a `https://tu-dominio.com/#/negocio` con `ADMIN_EMAIL`/`ADMIN_PASSWORD` → Ajustes → **Cargar datos de ejemplo** (opcional) → **Probar asistente**.

### 2b. Registro, recuperar contraseña y correo (Brevo)
Cualquier negocio puede crear su cuenta en `/#/registro`: empresa, nombre, correo, teléfono, contraseña, tipo de negocio, ubicación, fines y aceptación de términos. Se envía un **código de 6 dígitos** al correo (vence en 15 min, 5 intentos, reenvío cada 60 s); la cuenta se crea solo al verificarlo. **Cada negocio es independiente**: ve únicamente sus clientes, citas, chats y ajustes.
1. Crea una cuenta en brevo.com → **Senders, domains & dedicated IPs → Senders → Add a sender** con el correo que enviará los códigos y confírmalo desde ese buzón (con dominio propio, autentícalo también con SPF/DKIM/DMARC para que no caiga en spam).
2. **SMTP & API → API Keys → Generate a new API key** y copia la clave a `BREVO_API_KEY`; define `MAIL_FROM` con el remitente ya verificado (`FieldFlow <correo@dominio>`). Redeploy.
3. Sin esas dos variables el registro y la recuperación responden «el envío de correos aún no está configurado» (no se crea nada).
- **Recuperar contraseña:** `/#/recuperar` envía un código de 6 dígitos (15 min, 5 intentos) por Brevo y deja crear la clave nueva. No revela si el correo existe.

### 2c. Ingreso con Google
1. En console.cloud.google.com crea un proyecto → **APIs y servicios → Pantalla de consentimiento de OAuth** (externo, nombre FieldFlow) → **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**.
2. En **URI de redireccionamiento autorizados** agrega exactamente `https://TU-DOMINIO/api/auth/google/callback` (p. ej. `https://fieldflow-six-topaz.vercel.app/api/auth/google/callback`).
3. Copia el ID y el secreto a `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en Vercel y redeploy. Quien entra con Google por primera vez recibe una cuenta con un negocio inicial (cámbiale el nombre en Ajustes); su correo debe estar verificado por Google. Puede crear una contraseña con «¿Olvidaste tu contraseña?».
- El correo `ADMIN_EMAIL` sigue entrando con `ADMIN_PASSWORD`: es el **negocio principal** y es el único que usa el WhatsApp de la plataforma (variables `WHATSAPP_*`). Los demás negocios usan el simulador hasta que exista WhatsApp por negocio.
- Páginas legales: `/terminos` y `/privacidad` (bilingües; texto en `public/js/legal-content.js`, contacto `fieldflow-ayuda@googlegroups.com`). Son un **borrador sólido** basado en la Ley 1581 de 2012: que un abogado lo revise antes del lanzamiento comercial, y actualiza la fecha `UPDATED` cuando cambies el texto. `/legal.html` redirige a `/terminos`.
- Primera actualización a esta versión: la migración `20261121…multi_negocio.sql` **reconstruye las tablas** (borra los datos de prueba). Hazlo antes de tener clientes reales.

### 3. Dominio (Hostinger → Vercel)
En Vercel: Project → **Settings → Domains → Add**. Vercel te muestra los valores exactos; normalmente:
- **A:** en la zona DNS de Hostinger: `A @ → 76.76.21.21` y `CNAME www → cname.vercel-dns.com`.
- **B:** cambiar los *nameservers* de Hostinger a los de Vercel (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`).
El certificado HTTPS es automático.

### 4. WhatsApp (Meta Cloud API)
Webhook `https://tu-dominio.com/webhooks/whatsapp` (Vercel lo reescribe a `/api/whatsapp`), token = `VERIFY_TOKEN`, campo `messages`. Dentro de 24 h tras el mensaje del cliente la respuesta es gratuita; fuera de esa ventana se requieren plantillas aprobadas (recordatorios: pendiente). Prueba sin Meta con el **Simulador WhatsApp** de la app.

### 5. Desarrollo local
Node ≥ 22.13. `npm run dev` → http://localhost:8888 (`admin@fieldflow.test` / `fieldflow-demo`, SQLite local). `npm test` → pruebas de backend, i18n y contraste.

### 6. Pendiente y límites
- No probado todavía en Vercel real, con Neon real ni con Meta/Groq reales (solo con pruebas automáticas y SQLite; el esquema SQL sí se validó en PostgreSQL 16).
- Funciones en Hobby: máx. 60 s; el asistente corta a 22 s por mensaje.
- Plan gratis de Groq: límites y sin SLA; si falla, el chat pasa a atención humana.
- Pendiente: recordatorios (plantillas Meta / push), WhatsApp propio por negocio (credenciales de Meta por negocio), recuperar contraseña por correo, pagos, roles de usuario dentro de un negocio, bloqueo por intentos de login (hoy solo hay una pausa), límite de IA por negocio (hoy es compartido).
- Zona horaria fija America/Bogota (UTC-5). Los *preview deployments* usan las variables de Preview: usa una base distinta (datos personales, Ley 1581).
- La voz usa Web Speech API del navegador (Safari/Chrome).

---

## English

**Heads-up:** Vercel's free **Hobby** plan is for personal, non-commercial use only. For real customers use **Pro**. Hobby is fine for demos and testing.

**Deploy:** push the *contents* of `fieldflow/` to GitHub → Vercel *Add New → Project* (preset **Other**) → *Storage → Neon (Postgres)* creates `DATABASE_URL` (tables are created automatically on first request) → set the environment variables from the table above → **Redeploy** → open `/#/negocio`, sign in, *Settings → Test assistant*.

**Domain:** Vercel *Settings → Domains*; at Hostinger add `A @ → 76.76.21.21` and `CNAME www → cname.vercel-dns.com` (use the values Vercel shows) or switch nameservers to Vercel's.

**WhatsApp:** webhook `https://your-domain.com/webhooks/whatsapp`, verify token = `VERIFY_TOKEN`, subscribe to `messages`. Free replies inside the 24-hour window; templates needed outside it.

**Local:** `npm run dev`, `npm test`.

**Not verified / not built:** real Vercel/Neon/Meta/Groq runs; reminders, multi-tenant, payments, roles, login lockout. Fixed UTC-5 timezone.

**Sign-up (new):** `/#/registro` collects company, name, email, phone, password, business type, location, purposes and terms; a 6-digit code is emailed via Brevo (`BREVO_API_KEY`, `MAIL_FROM`); `/#/recuperar` resets a password the same way; Google sign-in uses `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and the account is created only after verification. Each business is isolated (own customers, bookings, chats, settings). `ADMIN_EMAIL` is the principal business and owns the platform WhatsApp number. The `multi_negocio` migration rebuilds tables (pre-launch data is wiped). `/terminos` and `/privacidad` are the legal pages (a draft for legal review; `/legal.html` redirects).

## Panel, Contactos (CRM) y Día
- **Panel** (`#/hoy`): cifras con cambio, ingresos por rango, calendario, atención pendiente, embudo, caja de hoy y bandeja.
- **Contactos** (`#/crm`): embudo por etapas (arrastrar o flechas) y lista; ficha con historial, llamada, WhatsApp y envío de correo por Brevo (las respuestas llegan al correo del usuario). Quienes escriben al asistente se agregan solos.
- **Día** (`#/dia/AAAA-MM-DD`): caja (apertura, ingresos, egresos) y productos libres (stock) con cierre diario; cada día abre con lo contado el día anterior. Migración `20261128000000_crm_caja_stock.sql`.
