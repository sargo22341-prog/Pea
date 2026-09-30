#!/bin/sh
set -eu

# Le conteneur démarre en root uniquement pour rendre au compte `node` les fichiers de données
# créés par les versions précédentes (qui tournaient en root), puis abandonne ses privilèges.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data
  find /app/data ! -user node -exec chown node:node {} +
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
