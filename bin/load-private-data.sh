#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

if [ ! -d "$ROOT/database/private" ]; then
    echo "No existe $ROOT/database/private" >&2
    exit 1
fi

if [ ! -d "$ROOT/storage/media/codex/tokens/webp" ]; then
    echo "No existen las imágenes WebP del Codex" >&2
    exit 1
fi

echo '[docker] Construyendo servicios y cargando datos e imágenes'
docker compose -f "$ROOT/docker-compose.yml" up -d --build
echo '[done] La importación continúa en los servicios codex-data-init y codex-media-init.'
