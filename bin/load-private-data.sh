#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PRIVATE_DIR="$ROOT/database/private"
MIGRATIONS_DIR="$ROOT/database/migrations"

if [ ! -d "$PRIVATE_DIR" ]; then
    echo "No existe $PRIVATE_DIR" >&2
    exit 1
fi

run_sql() {
    file=$1
    label=$(basename "$file")
    echo "[sql] $label"
    # Generated private dumps may still carry the pre-rebrand database name.
    sed 's/USE dnd_manager;/USE ttrpg_manager;/g' "$file" |
        docker compose -f "$ROOT/docker-compose.yml" exec -T mariadb sh -c \
            'exec mariadb --default-character-set=utf8mb4 -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"'
}

run_pair() {
    run_sql "$PRIVATE_DIR/$1"
    run_sql "$PRIVATE_DIR/$2"
}

echo '[docker] Preparando MariaDB, la aplicación y el volumen de media'
docker compose -f "$ROOT/docker-compose.yml" up -d --build mariadb media-init app websocket

# Each generated staging seed must be immediately followed by its transform.
run_pair seed_staging_adventuring_gear.private.sql transform_adventuring_gear_to_items.private.sql
run_pair seed_staging_armor_shields.private.sql transform_armor_shields_to_items.private.sql
run_pair seed_staging_backgrounds.private.sql transform_backgrounds_to_codex.private.sql
run_pair seed_staging_classes_subclasses.private.sql transform_classes_subclasses_to_codex.private.sql
run_pair seed_staging_currency_coins.private.sql transform_currency_coins.private.sql
run_pair seed_staging_explosives.private.sql transform_explosives_to_items.private.sql
run_pair seed_staging_feats.private.sql transform_feats_to_codex.private.sql
run_pair seed_staging_firearms.private.sql transform_firearms_to_items.private.sql
run_pair seed_staging_poisons.private.sql transform_poisons_to_items.private.sql
run_pair seed_staging_species.private.sql transform_species_to_codex.private.sql
run_pair seed_staging_tools.private.sql transform_tools_to_items.private.sql
run_pair seed_staging_trade_goods.private.sql transform_trade_goods_to_items.private.sql
run_pair seed_staging_trinkets.private.sql transform_trinkets_to_items.private.sql
run_pair seed_staging_weapons.private.sql transform_weapons_to_items.private.sql
run_pair seed_staging_wondrous_items.private.sql transform_wondrous_items_to_items.private.sql

# These depend on the class/species/background/feat catalogs loaded above.
run_sql "$PRIVATE_DIR/seed_character_option_actions.private.sql"
run_sql "$PRIVATE_DIR/seed_spells.private.sql"

# The two SRD batches share staging tables, so seed and transform each batch together.
run_pair seed_staging_srd_monsters_2014.private.sql transform_srd_monsters_2014_to_codex.private.sql
run_pair seed_staging_srd_monsters_2024.private.sql transform_srd_monsters_2024_to_codex.private.sql

# Reapply data-normalization migrations after importing generated records.
for migration in "$MIGRATIONS_DIR"/*.sql; do
    number=$(basename "$migration" | cut -d_ -f1)
    if [ "$number" -ge 23 ] 2>/dev/null; then
        run_sql "$migration"
    fi
done

# The old generated media SQL hard-codes creature IDs. Resolve links by SRD revision/index instead.
echo '[media] Enlazando el manifiesto con las criaturas importadas'
docker compose -f "$ROOT/docker-compose.yml" exec -T app php bin/import-private-media.php - \
    < "$PRIVATE_DIR/creature_token_media_manifest.private.json"

echo '[done] Datos privados y media cargados.'
