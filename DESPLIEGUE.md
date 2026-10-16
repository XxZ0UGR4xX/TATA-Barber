# Cómo poner Tata Barber en línea (cobrando de verdad)

Guía paso a paso. La ruta más sencilla es **Render**. Tiempo: ~30–40 min.

## Resumen de costos
- **Hosting (Render Starter + disco de 1 GB):** US$7.25/mes (~$125–145 MXN según el dólar y tu banco). Siempre encendido.
- **Dominio** (ej. `tatabarber.com`): ~$150–300 MXN el primer año; ~$300–550 al renovar. Opcional al inicio.
- **Correos:** gratis con Gmail (contraseña de aplicación).
- **Agenda de Google (Google Calendar):** gratis.
- **Mercado Pago:** sin mensualidad. Comisión de 3.49% (al instante) a 2.95% (a 30 días) + IVA por pago, y puede sumarse un cargo fijo de $4 + IVA; lo eliges y lo ves en tu cuenta de Mercado Pago.

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
   - `PANEL_RUTA` → la dirección secreta del panel, p. ej. `gestion-sc-8k2v9q4w` (12 a 64 letras, números o guiones; invéntala y no la compartas). Si la dejas vacía se genera una sola y aparece en **Logs**
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

## Paso 7 — (Opcional) Agenda de Google: las citas en Google Calendar
Con esto, cada cita pagada aparece sola en el Google Calendar de la barbería (con un color por barbero, el
teléfono del cliente y el código) y se quita si la cancelas en el panel. Es gratis. Sin este paso, cada correo
de cita nueva trae un botón **"Agregar a Google Calendar"** para agregarla con un clic.

1. Con el Gmail de la barbería entra a https://console.cloud.google.com y crea un proyecto
   (por ejemplo "Agenda barbería"). No pide tarjeta.
2. Menú → **APIs y servicios → Biblioteca** → busca **Google Calendar API** → **Habilitar**.
3. Menú → **IAM y administración → Cuentas de servicio** → **Crear cuenta de servicio** → nombre `agenda-citas`
   → **Listo** (no necesita roles).
4. Abre esa cuenta → pestaña **Claves** → **Agregar clave → Crear clave nueva → JSON**. Se descarga un archivo
   `.json`: es una llave, guárdalo y no lo compartas.
5. Copia el correo de la cuenta de servicio (termina en `@….iam.gserviceaccount.com`).
6. En https://calendar.google.com (con el Gmail de la barbería) → ⚙ **Configuración** → en
   **Configuración de mis calendarios** elige el calendario → **Compartir con determinadas personas** →
   **Agregar personas** → pega ese correo → permiso **"Hacer cambios en los eventos"** → **Enviar**.
   - Recomendado: crea un calendario aparte llamado "Citas" (**Otros calendarios → + → Crear calendario**),
     compártelo así y usa su **ID de calendario** (en su configuración, sección **Integrar el calendario**).
     Así las citas no se mezclan con lo personal.
7. En Render → **Environment** agrega:
   - `GOOGLE_CALENDAR_ID` → el Gmail de la barbería (o el ID del calendario "Citas").
   - `GOOGLE_CREDENCIALES` → abre el `.json` con el Bloc de notas, copia **todo** y pégalo como valor.
   Guarda (se redespliega solo). En **Logs** debe decir `Agenda de Google activa → …` y en el panel,
   **Configuración → Agenda de Google: Conectada**.
8. Haz una reserva de prueba: aparece en el calendario en segundos. En el celular, instala Google Calendar con
   la misma cuenta y activa las notificaciones.

Si en **Logs** aparece `¿Compartiste el calendario … con …?`, falta el paso 6 (o el permiso no es
"Hacer cambios en los eventos"). En tu computadora, `GOOGLE_CREDENCIALES` también puede ser la ruta al
archivo, por ejemplo `GOOGLE_CREDENCIALES=./agenda-citas.json` (no lo subas a GitHub).

---

## Probar antes de cobrar real
Pon `MP_ACCESS_TOKEN` con tu token de prueba (`TEST-…`). En el panel de Mercado Pago,
sección **Cuentas de prueba / Tarjetas de prueba**, crea un comprador de prueba y usa
las tarjetas que ahí te dan (por ejemplo, Mastercard de prueba, cualquier fecha futura y
CVC). Cuando todo funcione, cambia el token por el de producción (`APP_USR-…`).

## Personalizar barberos, servicios y horario
- **Barberos, servicios, precios y horario**: entra al panel (`https://TU-SITIO/` + tu `PANEL_RUTA`; en **Logs** aparece la dirección completa) → pestaña
  **"Configuración"**. Ahí también se cambian el nombre, la dirección, el teléfono, el WhatsApp y las redes.
  Los cambios se ven en el sitio al instante, sin redesplegar.
- **Imágenes de referencia (carrusel)**: panel → pestaña **"Referencias"** → **Subir imágenes** (puedes elegir
  varias a la vez). Se acomodan con las flechas y cada una puede llevar un texto corto. Las fotos verticales
  son las que mejor se ven.

## Alternativa: Railway (con Docker)
El proyecto incluye `Dockerfile`. En https://railway.app → New Project → Deploy from repo.
Agrega un **Volume** montado en `/data` y las mismas variables de entorno. Plan Hobby ~$5 USD/mes.
