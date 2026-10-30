#!/bin/sh
# Arranque del contenedor:
#  - Si existe la variable secreta WALLET_B64 (Render), la decodifica y deja el
#    wallet de Oracle ADB en la carpeta esperada por TNS_ADMIN.
#  - Si el wallet ya está en la imagen (docker local), no hace nada.
#  - Finalmente arranca el backend.
set -e

WALLET_DIR="${TNS_ADMIN:-/app/backend/wallet}"

if [ -n "${WALLET_B64}" ] && [ ! -f "$WALLET_DIR/tnsnames.ora" ]; then
  echo "Preparando wallet de Oracle ADB desde WALLET_B64..."
  mkdir -p "$WALLET_DIR"
  echo "$WALLET_B64" | base64 -d > /tmp/wallet.zip
  unzip -q -o /tmp/wallet.zip -d "$WALLET_DIR"
  rm -f /tmp/wallet.zip
  # Algunos zips traen los archivos dentro de una carpeta interna
  if [ ! -f "$WALLET_DIR/tnsnames.ora" ]; then
    inner="$(find "$WALLET_DIR" -name tnsnames.ora 2>/dev/null | head -n1)"
    if [ -n "$inner" ]; then
      dir="$(dirname "$inner")"
      cp -r "$dir"/. "$WALLET_DIR"/
      rm -rf "$dir"
    fi
  fi
  echo "Wallet instalado en $WALLET_DIR ($(ls "$WALLET_DIR" | wc -l) archivos)."
fi

exec node src/index.js
