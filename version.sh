#!/bin/sh
# Pone una versión nueva (fecha y hora) en index.html y version.json para que los navegadores
# descarguen los archivos actualizados en vez de usar la copia en caché.
# Se ejecuta solo en cada commit (hook pre-commit); para instalar el hook:  sh version.sh --install
cd "$(dirname "$0")" || exit 1
if [ "$1" = "--install" ]; then
  printf '#!/bin/sh\nsh "$(git rev-parse --show-toplevel)/version.sh" && git add index.html version.json\n' > .git/hooks/pre-commit
  chmod +x .git/hooks/pre-commit
  echo "Hook pre-commit instalado"
  exit 0
fi
v=$(date +%Y%m%d%H%M%S)
sed -i.bak -E "s/data-v=\"[0-9]+\"/data-v=\"$v\"/; s/\\.(js|css)\\?v=[0-9]+\"/.\\1?v=$v\"/g" index.html && rm -f index.html.bak
printf '{ "v": "%s" }\n' "$v" > version.json
