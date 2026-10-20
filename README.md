# Style Cut's — Sistema de citas con pago en línea

Página web para una barbería donde el cliente:

1. Elige **servicio**, **barbero**, **día** y **horario**
2. Deja sus datos y **paga en línea**
3. Al pagar, la cita queda agendada y se envía:
   - un **correo a la barbería** con todos los datos de la cita, y
   - un **correo de confirmación al cliente**.

El **administrador** entra con usuario y contraseña y ve:
cuántas citas hay (hoy, próximas, totales, ingresos), el desglose **por barbero**, y la **tabla completa** de citas con cliente, barbero, servicio, día y horario. Puede filtrar y cancelar citas.

---

## 1. Requisitos

- [Node.js](https://nodejs.org) 18 o superior.

## 2. Instalación

```bash
npm install
cp .env.example .env     # en Windows: copy .env.example .env
```

Abre `.env` y rellena tus datos (ver abajo). El usuario y la contraseña del panel son los de `ADMIN_USER` y `ADMIN_PASS` (con el `.env` de ejemplo: `admin` / `cambia-esta-clave`; se respetan mayúsculas y minúsculas). Luego:

```bash
npm start
```

- Sitio de reservas: http://localhost:3000
- Panel de administrador: **no tiene botón en el sitio**. Su dirección es secreta y aparece en la consola al arrancar (`Panel admin (ruta privada…): http://localhost:3000/…`). Para elegirla tú, define `PANEL_RUTA` en `.env`.

### Probar desde el celular u otra computadora (misma red Wi-Fi)
1. Arranca con `npm start`. Además de `localhost`, la consola muestra una línea por cada red, por ejemplo:
   `En tu red (celular u otra computadora): http://192.168.1.50:3000  ·  panel: http://192.168.1.50:3000/…`
2. Abre esa dirección en el celular, conectado **a la misma red Wi-Fi** que la computadora.
3. En Windows, la primera vez aparece un aviso del Firewall para Node.js: permite el acceso en **redes privadas**. Si no aparece y no carga, revisa que la red Wi-Fi esté marcada como **privada**.
4. La computadora debe quedarse encendida y con el servidor corriendo. La IP puede cambiar al reconectarte a la red: revisa la consola.

**Si el celular dice "No se puede acceder" (`ERR_ADDRESS_UNREACHABLE` o `ERR_CONNECTION_TIMED_OUT`):**
- Usa la dirección del adaptador **Wi-Fi** (casi siempre `192.168.x.x` o `10.x.x.x`). Una `169.254.x.x` es de un adaptador sin conexión y nunca funciona. En Windows la confirmas con `ipconfig` → "Adaptador de LAN inalámbrica Wi-Fi" → "Dirección IPv4".
- El celular debe estar en **el mismo Wi-Fi**, no con datos móviles ni en la red de invitados (las redes de invitados suelen impedir que los equipos se vean entre sí).
- En Windows: **Configuración → Red e Internet → Wi-Fi → (tu red)** → perfil de red **Privada**. Con perfil "Pública", el Firewall bloquea las conexiones de otros equipos.
- Si tienes una VPN activa en la computadora, apágala mientras pruebas.

En modo demo todo funciona por la red, incluido el pago simulado. Con un token de prueba de Mercado Pago (`TEST-…`), pon además `BASE_URL=http://TU-IP:3000` en `.env`, para que Mercado Pago regrese al cliente a tu computadora después de pagar. El aviso automático de Mercado Pago (webhook) no llega a una red local; ahí el pago se confirma cuando el cliente regresa al sitio.

## 3. Configuración (`.env`)

| Variable | Para qué sirve |
|---|---|
| `BASE_URL` | URL pública de tu sitio (usa `https://...` en producción). En Render no hace falta salvo con dominio propio. |
| `ADMIN_USER` / `ADMIN_PASS` | Acceso al panel de administrador. **Cambia la contraseña.** |
| `PANEL_RUTA` | Dirección secreta del panel (12 a 64 letras, números o guiones), p. ej. `gestion-sc-8k2v9q4w`. Si no la defines, se genera a partir de `SESSION_SECRET` y se muestra al arrancar. |
| `SESSION_SECRET` | Texto largo y aleatorio para firmar la sesión del admin. |
| `BARBERIA_EMAIL` | Correo que **recibe** el aviso de cada cita. |
| `SMTP_*` / `MAIL_FROM` | Cuenta desde la que se **envían** los correos. |
| `MP_ACCESS_TOKEN` | Access Token de Mercado Pago para cobrar. Vacío = modo demo. |
| `GOOGLE_CALENDAR_ID` / `GOOGLE_CREDENCIALES` | (Opcional) Agenda de Google: el calendario de la barbería y la llave JSON de la cuenta de servicio con permiso sobre él. Pasos en `DESPLIEGUE.md` (Paso 7). |
| `PERMITIR_DEMO` | Solo en producción: `1` permite arrancar en modo demo (sin token). Sin esto, en Render el sitio no arranca si falta el token o la contraseña del panel (mínimo 8 caracteres). |

### Correo con Gmail
Usa una **contraseña de aplicación** (no tu contraseña normal): activa la verificación en dos pasos y genérala en https://myaccount.google.com/apppasswords. Ponla en `SMTP_PASS`.

### Pagos con Mercado Pago
1. Crea tu cuenta en https://www.mercadopago.com.mx y entra al panel de desarrolladores: https://www.mercadopago.com.mx/developers/panel/app
2. Crea una aplicación (tipo "Pagos online" / Checkout Pro) y copia su **Access Token** en `MP_ACCESS_TOKEN`:
   - `TEST-...` para probar sin cobrar.
   - `APP_USR-...` para cobrar de verdad.
3. (Recomendado) Configura el webhook hacia `BASE_URL/api/mp/webhook` escuchando el evento **Pagos** (`payment`). Así la cita se confirma aunque el cliente cierre el navegador. El sistema además verifica cada pago consultándolo directamente con Mercado Pago, así que un aviso falso nunca agenda una cita.
4. Para probar, Mercado Pago te da **tarjetas y usuarios de prueba** en el panel. El cliente también puede pagar con saldo de Mercado Pago, SPEI u OXXO (estos dos quedan "en proceso" hasta acreditarse).

> **Modo demo:** si dejas `MP_ACCESS_TOKEN` vacío, el pago se **simula** para que puedas probar todo el flujo sin cobrar. Los correos sí se envían si configuraste el SMTP.

## 4. Personalizar barberos, servicios y horario

- **Barberos, servicios, precios y horario:** se editan desde el panel de administrador, en la pestaña **"Configuración"**. Los cambios se ven en el sitio al instante. La lista inicial (la primera vez que arranca) está en `db.js`. Un barbero o servicio no se borra: se marca como no visible, para conservar sus citas pasadas.
- **Foto y descripción de cada barbero:** en "Configuración" → "Barberos", botón **Subir foto** y el campo **Descripción breve** (hasta 160 caracteres). El cliente las ve al elegir barbero; sin foto se muestra la inicial. La foto se recorta en cuadro y se reduce sola a 600×600 (pesa unos KB) y se guarda dentro de la base de datos, así que viaja con los respaldos de `barberia.db`.
- El `PASO` al inicio de `server.js` controla cada cuántos minutos hay un turno (30). El horario del pie de página se actualiza solo.
- **Datos de la barbería (nombre, dirección, teléfono, WhatsApp, correo, redes):** el dueño los cambia en el panel → **"Configuración"** → "Datos de la barbería". Los valores de instalación, los **colores** y la **imagen del encabezado** están en `negocio.js`. Para instalar el sistema a otra barbería, cambia `negocio.js` y las imágenes de `public/img/`; no hace falta tocar el HTML.
- **Tienda (ruleta de productos):** edita la lista en `public/productos.js` y pon las fotos en `public/img/`. Cada producto lleva marca, nombre, descripción, detalles, precio (o `null` para "Pregunta por el precio") y fotos. Los productos solo se apartan por WhatsApp y se pagan y recogen en tienda.
- **Referencias (imágenes de trabajos):** panel → pestaña **"Referencias"** → **Subir imágenes** (varias a la vez, hasta 30). En el sitio se ven en un **carrusel** (3 a la vez en computadora, 1 en celular) que avanza solo; al tocar una se abre completa. Se acomodan con flechas y cada una puede llevar un texto. El panel las reduce a máximo 1600 px y les quita los datos ocultos. Mientras no haya imágenes ni videos, la sección no aparece.
- **Referencias (videos):** pon los MP4 en `public/videos/` y agrégalos a la lista de `public/referencias.js`; se muestran debajo del carrusel.
- **Imagen del encabezado:** reemplaza `public/img/banner.webp` (y su versión ligera para celular, `banner-1000.webp`).

- **Aviso de privacidad:** `public/privacidad.html` toma el nombre, dirección y contacto de la configuración. Es un modelo: conviene que lo revise un abogado antes de publicar.

### Agenda de Google (Google Calendar)
Con `GOOGLE_CALENDAR_ID` y `GOOGLE_CREDENCIALES` configurados, cada cita pagada **aparece sola** en el calendario de la barbería (título con barbero, servicio y cliente; un color por barbero; teléfono y código en la descripción) y **se quita** si se cancela en el panel. Si Google no responde, se reintenta cada 10 minutos sin duplicar. Sin configurarla, el correo de cada cita nueva trae el botón **"Agregar a Google Calendar"**. El correo de confirmación al cliente siempre trae **"Agregar a mi Google Calendar"**.

### Recordatorios
Si el correo (SMTP) está configurado, el sistema manda solo un **recordatorio al cliente un día antes** de su cita (revisa cada 10 minutos). No se lo manda a citas pagadas hace menos de 3 horas, porque el cliente acaba de recibir su confirmación.

## 5. ¿Cómo se evita la doble reserva?

Al pagar, el horario se **aparta** por 15 minutos mientras se completa el pago, y la verificación de disponibilidad + el apartado ocurren en una sola transacción de base de datos. Si dos personas intentan el mismo turno, solo una lo obtiene; la otra recibe aviso para elegir otro.

Si un pago llega tarde (por ejemplo un OXXO, o una tarjeta después de los 15 minutos) y el horario ya lo tomó otra persona, la cita **no se encima**: queda como **"Por revisar"** en el panel y se avisa por correo a la barbería y al cliente para reagendar o devolver el pago.

## 6. Archivos

```
server.js        API, pagos, correos, sesión del admin, lógica de horarios
db.js            Base de datos SQLite y datos iniciales
negocio.js       Datos de la barbería: nombre, contacto, colores, banner
mail.js          Envío de correos (barbería + cliente)
agenda.js        Agenda de Google: citas pagadas a Google Calendar (opcional)
SOPORTE.md       Guía para dar soporte: monitoreo, respaldos y problemas comunes
privado/
  panel.html     Panel del administrador (solo se sirve en la ruta secreta)
public/
  index.html     Reserva paso a paso (servicio → barbero → día/hora → datos → pago)
  pago-demo.html Pasarela simulada (solo en modo demo)
  gracias.html   Confirmación tras el pago
  privacidad.html Aviso de privacidad
  productos.js   Productos de la tienda (ruleta)
  img/           Imagen del encabezado y fotos de productos
  styles.css     Estilos
.env.example     Plantilla de configuración
```

## 7. Seguridad

- **Base de datos (inyección SQL):** todas las consultas usan parámetros (`?`); los datos del usuario nunca se pegan al SQL. Los identificadores se validan como enteros.
- **Inyección de JavaScript (XSS):** todo lo que se muestra en las páginas, el panel y los correos va escapado; las plantillas se llenan en una sola pasada (un dato con `{{…}}` se queda como texto) y la política de contenido (CSP con *nonce* por respuesta) solo deja correr los scripts del propio sitio.
- **Sesión del panel:** la cookie solo lleva una llave aleatoria de 256 bits, sin datos dentro; en la base se guarda únicamente su huella SHA-256. Es `HttpOnly`, `SameSite=Strict` y, con HTTPS, `Secure` con prefijo `__Host-`. Cerrar sesión la invalida en el servidor; cambiar `ADMIN_PASS` o `SESSION_SECRET` cierra todas las sesiones; máximo 5 sesiones abiertas.
- **Panel oculto:** sin botones en el sitio; vive en una ruta secreta (`PANEL_RUTA`) y su API también (`/api/<ruta>/…`). `/admin.html` y `/api/admin/…` no existen. La página del panel no se indexa en buscadores y no envía la dirección como *referer*. Es una capa extra: la protección real es la contraseña, la sesión y el límite de intentos.
- **Fotos de barberos:** solo se suben con sesión del panel; se aceptan JPG, PNG o WebP reconocidos por su contenido (no SVG), de máximo 1 MB. El panel las vuelve a dibujar antes de subirlas, lo que les quita los datos ocultos de la cámara (como la ubicación GPS). Se entregan como imagen con `nosniff` y `sandbox`: un archivo disfrazado no puede ejecutar código.
- **Agenda de Google:** la cuenta de servicio solo pide permiso de *eventos de calendario* y solo puede tocar el calendario que el dueño le compartió. La llave se lee de una variable de entorno y nunca se muestra en la consola (ni en los mensajes de error).
- **APIs encapsuladas:** las acciones (POST/PUT) solo se aceptan desde el propio sitio (`Origin` / `Sec-Fetch-Site`); sin CORS, otro sitio no puede leer las respuestas; los datos privados van con `Cache-Control: no-store`; la API pública solo devuelve lo necesario; rutas inexistentes responden un 404 neutro.
- **Límites:** 300 consultas a la API cada 5 min por IP; 6 reservas cada 15 min por IP y 2 horarios apartados sin pagar por teléfono; 5 intentos de login cada 15 min; reservas hasta 60 días adelante.
- **Pagos:** cada pago se verifica con Mercado Pago (estado, monto y moneda); la confirmación solo muestra la cita si coincide su `preference_id`.
- **Cabeceras:** CSP, HSTS (con HTTPS), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; sin `X-Powered-By`.
- **Errores:** nunca muestran rutas ni detalles internos del servidor.
- **Tráfico cifrado:** en Render todo va por HTTPS. La IP de cada visitante se toma del proxy de Render (`trust proxy` = 1); si se despliega en otro lugar sin proxy, hay que ajustar ese valor.

## 8. Soporte, monitoreo y respaldos

- **`/salud`:** responde `{"ok":true}` si el servidor y la base de datos funcionan. Render lo usa para reiniciar el sitio si deja de responder (`healthCheckPath`) y sirve para un monitor externo gratuito.
- **Respaldo:** panel → **Configuración → Respaldo → Descargar respaldo** baja una copia completa y consistente de la base (citas, clientes, configuración y fotos). Render, además, copia el disco cada día.
- **Guía de problemas comunes:** `SOPORTE.md`.

## 9. Notas para producción

- Sirve el sitio por **HTTPS** (así la cookie del admin viaja segura).
- Cambia `ADMIN_PASS` y `SESSION_SECRET`.
- Configura el **webhook de Mercado Pago** para no depender de que el cliente regrese al sitio.
- Descarga un respaldo desde el panel cada mes (ver sección 8).
