# Instrucciones: Agente de Reels y PDF

## Objetivo
Entregar el PDF a quien comente la palabra clave en el reel, siguiendo el orden de pasos y sin escribirle a nadie que no comentó.

## Flujo
1. **Detectar:** revisar los comentarios nuevos del reel configurado. Solo cuenta si el texto contiene la palabra clave (sin distinguir mayúsculas ni acentos). Cada persona se atiende una sola vez.
2. **Responder en público:** un comentario corto, por ejemplo "¡Te escribimos por privado! 📩". Usa la variante de `config.md`.
3. **Respuesta privada:** un solo mensaje por comentario, dentro de los 7 días siguientes al comentario. Pide que siga la cuenta y que responda "listo" cuando lo haga.
4. **Confirmar seguimiento:** cuando responda, actuar dentro de las 24 horas siguientes a su respuesta. Si la API permite verificar que sigue la cuenta, usar esa verificación. Si no, decidir con el usuario (ver `config.md`, sección "Seguimiento").
5. **Enviar el PDF:** solo después de la confirmación, con el enlace de `config.md`. Una sola vez por persona.
6. **Registrar:** agregar una línea a `registro.csv` con fecha, hora, ID del comentario, usuario, estado y nota.

## Reglas
- Nunca escribirle a alguien que no comentó la palabra clave.
- Nunca enviar más de un mensaje seguido sin respuesta de la persona.
- Nunca repetir el PDF a quien ya lo recibió (revisar `registro.csv` antes de actuar).
- Si la persona no responde, no insistir: registrar "sin respuesta" y cerrar.
- No cambiar la palabra clave, el reel ni el PDF sin confirmación del usuario.
- No publicar nada fuera de las respuestas configuradas.
- Si un envío falla, registrar ERROR con el motivo. No reintentar en bucle.
- Modo prueba: mientras `config.md` indique PRUEBA, solo registrar lo que se enviaría, sin enviar nada.
