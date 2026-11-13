# Agente Ventas de WooCommerce
Cuenta las ventas de la tienda (hacedores.com, WooCommerce en WordPress) y avisa en el panel cada vez que entra una nueva.
- Lee los pedidos **pagados** (estado "en proceso" o "completado") por la API REST de WooCommerce. No trae datos de los clientes: solo producto, total y hora.
- Calcula las ventas de **hoy** y del **mes** (hora de Ciudad de México) y guarda las más recientes.
- El panel lo consulta cada minuto. Cuando aparece una venta nueva, la mascota del agente salta y la menciona en una burbuja ("¡Nueva venta! Curso … · $2,900").
- Código: `app-agentes/woocommerce.js` y la ruta `/api/ventas` en `app-agentes/server.js`.
- Variables en Vercel: `WOO_CONSUMER_KEY` y `WOO_CONSUMER_SECRET` (API REST, permiso de **solo lectura**). `WOO_URL` es opcional (por defecto https://hacedores.com).
- Las claves se crean en WordPress: WooCommerce → Ajustes → Avanzado → API REST → Añadir clave.
