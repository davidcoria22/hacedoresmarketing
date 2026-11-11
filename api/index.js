// Punto de entrada en Vercel: todas las rutas /api/* las atiende el mismo servidor del panel.
const manejar = require('../app-agentes/server.js');
// Sin lector de cuerpo automático: el webhook de WhatsApp necesita el cuerpo original para verificar la firma de Meta.
manejar.config = { api: { bodyParser: false } };
module.exports = manejar;
