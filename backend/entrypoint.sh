#!/bin/sh
# Arranque del contenedor (modo thick contra Oracle ADB):
#  1. Si existe la variable secreta WALLET_B64 (Render), se decodifica el
#     wallet de la ADB en la carpeta TNS_ADMIN.
#  2. Se reescribe sqlnet.ora con la RUTA ABSOLUTA del wallet DENTRO del
#     contenedor (el archivo trae una ruta de Windows que no aplica aquí;
#     en modo thick el cliente lo lee y con una ruta ajena falliría ORA-28759).
#  3. Se fija ORACLE_IC_HOME si falta o no existe (Instant Client de la imagen).
#  4. Arranca el backend.
set -e

# Carpeta del wallet: absoluta siempre (TNS_ADMIN relativo dependería del cwd)
WALLET_DIR="${TNS_ADMIN:-/app/backend/wallet}"
case "$WALLET_DIR" in
  /*) ;;
  *) WALLET_DIR="$(pwd)/$WALLET_DIR" ;;
esac
export TNS_ADMIN="$WALLET_DIR"

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

# sqlnet.ora del wallet: DIRECTORY = ruta absoluta dentro del contenedor
cat > "$WALLET_DIR/sqlnet.ora" <<EOF
WALLET_LOCATION = (SOURCE = (METHOD = file) (METHOD_DATA = (DIRECTORY="$WALLET_DIR")))
SSL_SERVER_DN_MATCH=yes
EOF
echo "TNS_ADMIN=$TNS_ADMIN"

# Instant Client (modo thick); la imagen lo instala en /opt/oracle/instantclient
if [ -z "$ORACLE_IC_HOME" ] || [ ! -d "$ORACLE_IC_HOME" ]; then
  if [ -d /opt/oracle/instantclient ]; then
    export ORACLE_IC_HOME=/opt/oracle/instantclient
  fi
fi
echo "ORACLE_IC_HOME=${ORACLE_IC_HOME:-<no definido: se usara modo thin>}"

exec node src/index.js
