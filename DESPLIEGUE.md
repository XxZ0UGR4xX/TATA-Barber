# Cómo poner Tata Barber en línea (cobrando de verdad)

Guía paso a paso. La ruta más sencilla es **Render**. Tiempo: ~30–40 min.

## Resumen de costos
- **Hosting (Render Starter):** ~$7 USD/mes (~$130 MXN). Siempre encendido.
- **Dominio** (ej. `tatabarber.com`): ~$10–15 USD/año. Opcional al inicio.
- **Correos:** gratis con Gmail (contraseña de aplicación).
- **Mercado Pago:** sin mensualidad. Comisión ~3.5–4% + IVA por pago (varía según el plazo en que recibes el dinero; lo eliges en tu panel de Mercado Pago).

---

## Paso 1 — Sube el código a GitHub
1. Crea un repo (puede ser privado) en https://github.com.
2. Sube esta carpeta. El archivo `.gitignore` ya evita subir `.env`, `node_modules` y la base de datos.

## Paso 2 — Crea la cuenta de Mercado Pago y consigue tu Access Token
1. Regístrate / entra en https://www.mercadopago.com.mx
2. Ve al panel de desarrolladores: https://www.mercadopago.com.mx/developers/panel/app → **Crea una aplicación** (Checkout Pro / Pagos online).
3. En **Credenciales** copia el **Access Token**:
   - `TEST-…` para probar sin cobrar.
   - `APP_USR-…` para cobrar de verdad.

## Paso 3 — Prepara el correo (Gmail)
1. Activa la verificación en dos pasos en la cuenta de Gmail de la barbería.
2. Crea una **contraseña de aplicación**: https://myaccount.google.com/apppasswords
3. Guarda esa contraseña (16 letras). Va en `SMTP_PASS`.

## Paso 4 — Despliega en Render
1. Entra a https://render.com y conecta tu GitHub.
2. **New → Blueprint** y elige el repo (detecta el archivo `render.yaml` incluido).
3. Render creará el servicio **tata-barber** con su disco persistente ya configurado.
4. En **Environment**, llena las variables:
   - `ADMIN_USER` → usuario del panel (ej. `tata`)
   - `ADMIN_PASS` → una contraseña fuerte
   - `BARBERIA_EMAIL` → correo donde quieres recibir el aviso de cada cita
   - `SMTP_HOST` → `smtp.gmail.com`
   - `SMTP_PORT` → `587`
   - `SMTP_USER` → el Gmail de la barbería
   - `SMTP_PASS` → la contraseña de aplicación del Paso 3
   - `MAIL_FROM` → `Tata Barber <el-gmail@gmail.com>`
   - `MP_ACCESS_TOKEN` → tu Access Token de Mercado Pago
   - (`SESSION_SECRET` se genera solo. `BASE_URL` no hace falta: el sistema usa la URL pública de Render)
5. Dale **Deploy**. Si falta `ADMIN_PASS` (mínimo 8 caracteres) o `MP_ACCESS_TOKEN`, el servicio no arranca y en **Logs** dice qué falta: es a propósito, para que el panel nunca quede con una contraseña por defecto ni se puedan agendar citas sin pagar. En unos minutos tendrás una URL tipo `https://tata-barber.onrender.com`.

## Paso 5 — Conecta el webhook de Mercado Pago (importante)
Esto confirma el pago aunque el cliente cierre el navegador.
1. En el panel de tu aplicación → **Webhooks / Notificaciones** → agrega una URL de producción.
2. URL: `https://TU-URL-DE-RENDER/api/mp/webhook`
3. Evento: **Pagos** (`payment`).
4. Guarda. No necesitas pegar ningún secreto: el sistema confirma cada pago consultándolo directamente con Mercado Pago usando tu `MP_ACCESS_TOKEN`.

## Paso 6 — (Opcional) Dominio propio
1. Compra `tatabarber.com` (Namecheap, Cloudflare, GoDaddy).
2. En Render → **Settings → Custom Domain**, agrégalo y sigue las instrucciones de DNS.
3. En Render → **Environment**, agrega la variable `BASE_URL` con `https://tatabarber.com` y guarda (se redespliega solo).
4. En Mercado Pago, cambia la URL del webhook a `https://tatabarber.com/api/mp/webhook`.

---

## Probar antes de cobrar real
Pon `MP_ACCESS_TOKEN` con tu token de prueba (`TEST-…`). En el panel de Mercado Pago,
sección **Cuentas de prueba / Tarjetas de prueba**, crea un comprador de prueba y usa
las tarjetas que ahí te dan (por ejemplo, Mastercard de prueba, cualquier fecha futura y
CVC). Cuando todo funcione, cambia el token por el de producción (`APP_USR-…`).

## Personalizar barberos, servicios y horario
- **Barberos, servicios, precios y horario**: entra al panel (`/admin.html`) → pestaña
  **"Configuración"**. Ahí también se cambian el nombre, la dirección, el teléfono, el WhatsApp y las redes.
  Los cambios se ven en el sitio al instante, sin redesplegar.

## Alternativa: Railway (con Docker)
El proyecto incluye `Dockerfile`. En https://railway.app → New Project → Deploy from repo.
Agrega un **Volume** montado en `/data` y las mismas variables de entorno. Plan Hobby ~$5 USD/mes.
