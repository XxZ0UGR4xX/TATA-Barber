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
| `BASE_URL` | URL pública de tu sitio (usa `https://...` en producción). |
| `ADMIN_USER` / `ADMIN_PASS` | Acceso al panel de administrador. **Cambia la contraseña.** |
| `SESSION_SECRET` | Texto largo y aleatorio para firmar la sesión del admin. |
| `BARBERIA_EMAIL` | Correo que **recibe** el aviso de cada cita. |
| `SMTP_*` / `MAIL_FROM` | Cuenta desde la que se **envían** los correos. |
| `MP_ACCESS_TOKEN` | Access Token de Mercado Pago para cobrar. Vacío = modo demo. |

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

- **Barberos y servicios:** se crean automáticamente la primera vez en `db.js`. Para cambiarlos después, edítalos directamente en la base de datos, o borra `barberia.db` y ajusta la lista inicial en `db.js` antes de volver a arrancar.
- **Horario de atención:** edita el objeto `HORARIO` al inicio de `server.js` (día de la semana → `['apertura','cierre']`, o `null` si cierran). El `PASO` controla cada cuántos minutos hay un turno. El horario del pie de página se actualiza solo con este objeto.
- **Pie de página (dirección, teléfono, redes, correo):** edita el bloque marcado con ✏️ al final de `public/index.html`.

## 5. ¿Cómo se evita la doble reserva?

Al pagar, el horario se **aparta** por 15 minutos mientras se completa el pago, y la verificación de disponibilidad + el apartado ocurren en una sola transacción de base de datos. Si dos personas intentan el mismo turno, solo una lo obtiene; la otra recibe aviso para elegir otro.

## 6. Archivos

```
server.js        API, pagos, correos, sesión del admin, lógica de horarios
db.js            Base de datos SQLite y datos iniciales
mail.js          Envío de correos (barbería + cliente)
public/
  index.html     Reserva paso a paso (servicio → barbero → día/hora → datos → pago)
  pago-demo.html Pasarela simulada (solo en modo demo)
  gracias.html   Confirmación tras el pago
  admin.html     Panel del administrador
  styles.css     Estilos
.env.example     Plantilla de configuración
```

## 7. Notas para producción

- Sirve el sitio por **HTTPS** (así la cookie del admin viaja segura).
- Cambia `ADMIN_PASS` y `SESSION_SECRET`.
- Configura el **webhook de Mercado Pago** para no depender de que el cliente regrese al sitio.
- Haz respaldos del archivo `barberia.db`.
