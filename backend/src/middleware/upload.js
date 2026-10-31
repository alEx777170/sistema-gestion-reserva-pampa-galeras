const multer = require('multer');
const path = require('path');
const fs = require('fs');

// La extensión sale del tipo MIME validado, no del nombre que manda el cliente:
// así no se puede subir un .html/.svg con Content-Type de imagen y servirlo desde /uploads.
const EXTENSIONES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };

// Configurar almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads');
    fs.mkdirSync(dir, { recursive: true }); // en un volumen/disco nuevo la carpeta puede no existir
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `animal_${Date.now()}_${Math.random().toString(36).substring(7)}${EXTENSIONES[file.mimetype]}`;
    cb(null, uniqueName);
  }
});

// Filtrar solo imágenes
const fileFilter = (req, file, cb) => {
  if (EXTENSIONES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten imágenes (JPEG, PNG, GIF, WEBP)'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB máximo
});

module.exports = upload;
