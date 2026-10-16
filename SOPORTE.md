# Guía de soporte

Para quien administra el sitio y da soporte a la barbería. El sitio está en Render y se publica solo con cada
`git push`; casi todo se revisa en el panel de Render: **Logs** (errores), **Events** (despliegues),
**Environment** (variables) y **Disks** (copias diarias de la base).

## 1. Enterarte antes que el cliente

1. **Monitor gratuito** (UptimeRobot o Better Stack):
   - Crea un monitor **HTTP(s)** con la URL `https://TU-DOMINIO/salud`, revisando cada 5 minutos.
   - `/salud` responde `{"ok":true}` solo si el servidor **y** la base de datos funcionan.
   - Activa los avisos por correo y, si quieres, por la app del celular o Telegram.
2. **Avisos de Render:** en la configuración de notificaciones de tu cuenta de Render, deja activados los correos de despliegues fallidos.
3. **Reinicio automático:** Render revisa `/salud` (`healthCheckPath` en `render.yaml`); si deja de responder,
   reinicia el sitio solo.

## 2. Respaldos

- **Automático:** Render guarda una copia del disco cada día y la conserva al menos 7 días
  (**Disks → Snapshots**). Restaurar regresa *toda* la base a ese día: se pierde lo que pasó después.
- **Manual:** en el panel, **Configuración → Respaldo → Descargar respaldo**. Es una copia completa
  (citas, clientes, barberos, servicios, horario, fotos y referencias). Descárgala una vez al mes y antes de
  cualquier cambio grande. Trae datos personales de clientes: guárdala en un lugar seguro.
- El archivo `.db` se abre con [DB Browser for SQLite](https://sqlitebrowser.org) para consultarlo, y sirve
  para mudar el sitio a otro servidor (se copia como `barberia.db`).

## 3. Problemas comunes

| Síntoma | Dónde ver | Qué hacer |
|---|---|---|
| El sitio no abre | Render → **Logs** y **Events** | Si un despliegue falló, en **Events** regresa al anterior (**Rollback**). Si no, reinícialo con **Restart service**. |
| No arranca después de cambiar variables | **Logs**: línea que empieza con `✖` | Dice qué variable falta o está mal (`ADMIN_PASS`, `SESSION_SECRET`, `MP_ACCESS_TOKEN`, `PANEL_RUTA`). |
| Pagaron pero la cita no aparece | Panel (estado **Por revisar**) y **Logs** (`[pago]`, `[webhook MP]`) | Revisa el webhook de Mercado Pago (`/api/mp/webhook`, evento **Pagos**) y que `MP_ACCESS_TOKEN` sea el de producción. |
| No llegan los correos | **Logs**: `[correo …]` | Si cambiaron la contraseña de Gmail, la contraseña de aplicación deja de servir: genera otra y ponla en `SMTP_PASS`. |
| La agenda de Google no se actualiza | **Logs**: `[agenda de Google]` | El mensaje dice si falta compartir el calendario o si la llave ya no es válida (ver `DESPLIEGUE.md`, Paso 7). Al corregirlo, las citas pendientes se agregan solas en máximo 10 minutos. |
| El dueño olvidó la contraseña del panel | — | Cambia `ADMIN_PASS` en **Environment**. Se cierran todas las sesiones abiertas. |
| No encuentran el panel | **Environment** (`PANEL_RUTA`) o **Logs** (`Panel admin …`) | La dirección es `https://TU-DOMINIO/` + `PANEL_RUTA`. |
| "Demasiados intentos" al entrar al panel | — | Espera 15 minutos o reinicia el servicio (**Restart service**), que borra el contador. |
| Se borró o dañó información | **Disks → Snapshots** | Primero descarga un respaldo del estado actual; luego restaura la copia del día que necesites. |

## 4. Cambios que pide la barbería

- **Los hace el dueño en su panel** (no cuentan como cambio): precios, servicios, barberos y sus fotos,
  horario, datos de contacto, redes e imágenes de referencia.
- **Los haces tú** (textos fijos, banner, productos de la tienda, videos): edita el archivo, prueba con
  `npm start` y haz `git push`; Render lo publica solo en un par de minutos.

## 5. Revisión mensual (10 minutos)

- [ ] Descargar un respaldo desde el panel.
- [ ] Revisar **Logs** por errores repetidos.
- [ ] Confirmar que el monitor no reportó caídas largas.
- [ ] Revisar la fecha de renovación del dominio.
