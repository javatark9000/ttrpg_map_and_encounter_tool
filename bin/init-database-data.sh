#!/usr/bin/env sh
set -eu

DATABASE_DIR=${DATABASE_DIR:-/database}
PRIVATE_DIR="$DATABASE_DIR/private"
IMPORT_NAME=${IMPORT_NAME:-private-codex-v1}

client() {
    mariadb --default-character-set=utf8mb4 \
        -h "${DB_HOST:-mariadb}" \
        -u "$MARIADB_USER" \
        -p"$MARIADB_PASSWORD" \
        "$@" "$MARIADB_DATABASE"
}

run_sql() {
    file=$1
    echo "[sql] $(basename "$file")"
    sed 's/USE dnd_manager;/USE ttrpg_manager;/g' "$file" | client
}

run_pair() {
    run_sql "$PRIVATE_DIR/$1"
    run_sql "$PRIVATE_DIR/$2"
}

if [ ! -d "$PRIVATE_DIR" ]; then
    echo "No existe $PRIVATE_DIR" >&2
    exit 1
fi

client -e 'CREATE TABLE IF NOT EXISTS data_imports (name VARCHAR(100) PRIMARY KEY, imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)'
if [ "$(client -Nse "SELECT COUNT(*) FROM data_imports WHERE name='$IMPORT_NAME'")" -gt 0 ]; then
    echo "[skip] $IMPORT_NAME ya está cargado"
    exit 0
fi

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

run_sql "$PRIVATE_DIR/seed_character_option_actions.private.sql"
run_sql "$PRIVATE_DIR/seed_spells.private.sql"

run_pair seed_staging_srd_monsters_2014.private.sql transform_srd_monsters_2014_to_codex.private.sql
run_pair seed_staging_srd_monsters_2024.private.sql transform_srd_monsters_2024_to_codex.private.sql

run_sql "$DATABASE_DIR/post_import_normalization.sql"
client -e "INSERT INTO data_imports(name) VALUES ('$IMPORT_NAME')"
echo "[done] $IMPORT_NAME cargado"
