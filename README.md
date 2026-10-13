# The Barber Co. — Sistema de citas con pago en línea

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

Abre `.env` y rellena tus datos (ver abajo). Luego:

```bash
npm start
```

- Sitio de reservas: http://localhost:3000
- Panel de administrador: http://localhost:3000/admin.html

## 3. Configuración (`.env`)

| Variable | Para qué sirve |
|---|---|
| `BASE_URL` | URL pública de tu sitio (usa `https://...` en producción). En Render no hace falta salvo con dominio propio. |
| `ADMIN_USER` / `ADMIN_PASS` | Acceso al panel de administrador. **Cambia la contraseña.** |
| `SESSION_SECRET` | Texto largo y aleatorio para firmar la sesión del admin. |
| `BARBERIA_EMAIL` | Correo que **recibe** el aviso de cada cita. |
| `SMTP_*` / `MAIL_FROM` | Cuenta desde la que se **envían** los correos. |
| `MP_ACCESS_TOKEN` | Access Token de Mercado Pago para cobrar. Vacío = modo demo. |
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
- El `PASO` al inicio de `server.js` controla cada cuántos minutos hay un turno (30). El horario del pie de página se actualiza solo.
- **Datos de la barbería (nombre, dirección, teléfono, WhatsApp, correo, redes):** el dueño los cambia en el panel → **"Configuración"** → "Datos de la barbería". Los valores de instalación, los **colores** y la **imagen del encabezado** están en `negocio.js`. Para instalar el sistema a otra barbería, cambia `negocio.js` y las imágenes de `public/img/`; no hace falta tocar el HTML.
- **Tienda (ruleta de productos):** edita la lista en `public/productos.js` y pon las fotos en `public/img/`. Cada producto lleva marca, nombre, descripción, detalles, precio (o `null` para "Pregunta por el precio") y fotos. Los productos solo se apartan por WhatsApp y se pagan y recogen en tienda.
- **Referencias (videos de trabajos):** pon los MP4 en `public/videos/` y agrégalos a la lista de `public/referencias.js`. Mientras la lista esté vacía, la sección no aparece.
- **Imagen del encabezado:** reemplaza `public/img/banner.webp` (y su versión ligera para celular, `banner-1000.webp`).

- **Aviso de privacidad:** `public/privacidad.html` toma el nombre, dirección y contacto de la configuración. Es un modelo: conviene que lo revise un abogado antes de publicar.

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
public/
  index.html     Reserva paso a paso (servicio → barbero → día/hora → datos → pago)
  pago-demo.html Pasarela simulada (solo en modo demo)
  gracias.html   Confirmación tras el pago
  admin.html     Panel del administrador (citas y configuración)
  privacidad.html Aviso de privacidad
  productos.js   Productos de la tienda (ruleta)
  img/           Imagen del encabezado y fotos de productos
  styles.css     Estilos
.env.example     Plantilla de configuración
```

## 7. Seguridad

- **Base de datos:** todas las consultas usan parámetros (`?`); los datos del usuario nunca se pegan al SQL.
- **Inyección de JavaScript (XSS):** todo lo que se muestra en las páginas, el panel y los correos va escapado, y la política de contenido (CSP con *nonce*) solo deja correr los scripts del propio sitio.
- **Cabeceras:** CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` y HSTS con HTTPS.
- **Abuso de la agenda:** máximo 6 reservas cada 15 min por IP y 2 horarios apartados sin pagar por teléfono; solo se reserva hasta 60 días adelante.
- **Pagos:** cada pago se verifica con Mercado Pago (estado, monto y moneda); la página de confirmación solo muestra la cita si coincide el `preference_id`.
- **Panel:** contraseña obligatoria en producción (mínimo 8 caracteres), 5 intentos de login cada 15 min por IP, cookie `httpOnly` + `SameSite=Strict`; cambiar `ADMIN_PASS` cierra todas las sesiones.
- **Errores:** nunca muestran rutas ni detalles internos del servidor.

## 8. Notas para producción

- Sirve el sitio por **HTTPS** (así la cookie del admin viaja segura).
- Cambia `ADMIN_PASS` y `SESSION_SECRET`.
- Configura el **webhook de Mercado Pago** para no depender de que el cliente regrese al sitio.
- Haz respaldos del archivo `barberia.db`.
