# Agente WhatsApp (campaña)
Responde con `mensaje.txt` a quien llega por el anuncio (Click-to-WhatsApp), **5 minutos después** de su primer mensaje.
- Solo contesta mensajes que traen `referral` (el primero de cada chat que viene del anuncio): no repite ni responde a chats normales.
- Webhook: `/api/whatsapp` (código en `app-agentes/whatsapp.js`). Anota cada mensaje en la pestaña "Mensajes" de la hoja.
- El envío diferido se guarda en la pestaña "Pendientes". Un reloj externo (cron-job.org) llama cada minuto a `/api/whatsapp-pendientes` con la cabecera `x-cron-key`.
- **Seguimiento:** si la persona no vuelve a escribir en 2 h, se le manda `mensaje-seguimiento.txt` (si escribe antes, el seguimiento se cancela). Debe ser menos de 24 h porque, pasadas 24 h desde su último mensaje, WhatsApp solo deja mandar plantillas aprobadas. `WHATSAPP_SEGUIMIENTO_HORAS` cambia las horas (por defecto 2) (0 = sin seguimiento). Solo funciona con el reloj externo configurado.
- Sin `WHATSAPP_CRON_SECRET` contesta al instante. `WHATSAPP_RETRASO_MIN` cambia los minutos (0 = al instante).
- Variables en Vercel: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_CRON_SECRET, PANEL_PASSWORD.
- Para cambiar los textos, edita `mensaje.txt` o `mensaje-seguimiento.txt` y sube el cambio.
