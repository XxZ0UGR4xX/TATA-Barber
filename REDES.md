# Instagram, TikTok, QR y reseñas

Cómo conectar las redes de la barbería con el sitio para que cada visita termine en una cita.
Todos los enlaces y textos de esta guía están listos para copiar en el panel → pestaña **Redes y QR**
(ya con el dominio real del sitio).

> **Qué sí y qué no se puede.** Ni Instagram ni TikTok permiten abrir un menú automático cuando alguien
> solo *visita* el perfil. Lo que sí permiten, y es lo que configuramos aquí:
> 1. **El enlace del perfil** lleva directo a agendar.
> 2. Cuando alguien toca **"Enviar mensaje"**, ve un **menú de preguntas** ("📅 Quiero agendar una cita",
>    "💬 Quiero hablar con un barbero"…) y recibe al instante la respuesta con el enlace para agendar.

Los nombres exactos de los menús pueden cambiar con las versiones de cada app.

## Los enlaces de cada red

| Red | Enlace | Para qué |
|---|---|---|
| Instagram | `https://TU-DOMINIO/ig` | Enlace del perfil y respuestas automáticas |
| TikTok | `https://TU-DOMINIO/tt` | Enlace del perfil |
| Facebook | `https://TU-DOMINIO/fb` | Botón y enlace de la página |
| Código QR | `https://TU-DOMINIO/qr` | Va dentro del QR del cartel |

Todos llevan directo al paso 1 de la reserva. El sitio cuenta una visita por persona y día en cada canal, y
cada cita guarda de qué red llegó: en el panel, **Redes y QR → De dónde llegan tus clientes** muestra visitas
y citas pagadas de los últimos 30 días.

## Instagram

1. La cuenta debe ser **profesional** (Empresa o Creador): *Configuración → Tipo de cuenta y herramientas*.
2. **Editar perfil → Enlaces → Agregar enlace externo** → `https://TU-DOMINIO/ig`, con el título "Agenda tu cita".
3. **Biografía:** copia el texto "Biografía" del panel (termina con "Agenda y paga tu cita aquí 👇").
4. **Preguntas frecuentes del chat** (las ve quien abre un chat nuevo con la barbería). En la app:
   *Configuración → Herramientas para empresas → Preguntas frecuentes* (o en Meta Business Suite →
   Bandeja de entrada → Automatizaciones). Agrega hasta 4, con su respuesta automática del panel:
   - 📅 Quiero agendar una cita
   - 💬 Quiero hablar con un barbero
   - 💲 Precios y servicios
   - 📍 ¿Dónde están?
5. **Respuesta instantánea** (a cualquier primer mensaje): Meta Business Suite → Bandeja de entrada →
   Automatizaciones → Respuesta instantánea → pega el texto "Instagram · Respuesta instantánea".
6. **Historias destacadas:** sube una historia con el **sticker de enlace** a `https://TU-DOMINIO/ig` y
   guárdala en un destacado llamado "Agenda".

El botón nativo **"Reservar"** de Instagram solo funciona con apps de reservas asociadas a Meta; el enlace
del perfil cumple la misma función sin pagar otra app.

## TikTok

1. Cambia a **cuenta de empresa**: *Perfil → ☰ → Configuración y privacidad → Cuenta → Cambiar a cuenta de empresa*.
2. **Editar perfil → Sitio web** → `https://TU-DOMINIO/tt`.
3. **Mensajes automáticos** (Herramientas para empresas → Mensajes directos): "Mensaje de bienvenida" y
   "Preguntas sugeridas" con los textos de TikTok del panel. TikTok los revisa antes de activarlos (puede
   tardar de 1 a 5 días hábiles) y en algunos tipos de cuenta todavía no aparecen.
4. En los mensajes de TikTok **los enlaces no se pueden tocar**: por eso los textos dicen "toca el enlace
   de nuestro perfil" en lugar de pegar la dirección.

## Facebook (opcional)

En la página de la barbería: **Agregar botón → Reservar / Contactar** con el enlace `https://TU-DOMINIO/fb`,
y el mismo enlace en la información de la página.

## Código QR y cartel

Panel → **Redes y QR → Código QR**:
- **Descargar PNG** (2048 px, para imprenta) o **SVG** (para diseño).
- **Cartel para imprimir**: hoja tamaño carta con el logo, "Escanea y agenda tu cita", el QR y los datos de
  contacto; se imprime o se guarda en PDF desde el navegador.

**Imprime el QR solo cuando el sitio tenga su dominio definitivo** (el panel avisa si la dirección todavía
es provisional). Si después cambia el dominio, los carteles impresos dejan de servir.

## Reseñas verificadas

- Dos horas después de cada cita pagada, el cliente recibe un correo para calificar su visita, una sola vez
  y con un enlace único (solo pueden opinar clientes reales).
- Las reseñas se publican solas en el sitio (sección "Lo que dicen nuestros clientes", con el promedio).
  En el panel → **Reseñas** se ocultan las ofensivas o con datos personales. Ocultar críticas solo por ser
  negativas engaña a los clientes.
- Al terminar, a todos los clientes (con cualquier calificación) se les ofrece opinar también en Google,
  con el enlace de **Reseñas → Enlace para opinar en Google**. Google prohíbe pedírselo solo a los contentos.
- Para el enlace de Google: en el Perfil de Empresa de Google, *Pedir reseñas* da un enlace directo al
  formulario; también sirve el enlace de la ficha (`https://share.google/…`).
- Requiere que el correo (SMTP) esté configurado.
