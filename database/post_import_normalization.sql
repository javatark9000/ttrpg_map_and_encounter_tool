USE ttrpg_manager;

-- Normalization applied after importing the private Codex datasets.

-- Consolidated from 023_spanish_codex_lookup_labels.sql
UPDATE action_categories SET name = CASE code
 WHEN 'spell' THEN 'Hechizo'
 WHEN 'class_feature' THEN 'Rasgo de clase'
 WHEN 'racial_trait' THEN 'Rasgo de especie'
 WHEN 'monster_ability' THEN 'Habilidad de monstruo'
 WHEN 'item_ability' THEN 'Habilidad de objeto'
 WHEN 'general_ability' THEN 'Habilidad general'
 ELSE name END
WHERE code IN ('spell','class_feature','racial_trait','monster_ability','item_ability','general_ability');

UPDATE activation_types SET name = CASE code
 WHEN 'action' THEN 'Acción'
 WHEN 'bonus_action' THEN 'Acción adicional'
 WHEN 'reaction' THEN 'Reacción'
 WHEN 'free_action' THEN 'Acción libre'
 WHEN 'passive' THEN 'Pasiva'
 WHEN 'special' THEN 'Especial'
 WHEN 'short_rest' THEN 'Descanso corto'
 WHEN 'long_rest' THEN 'Descanso largo'
 ELSE name END
WHERE code IN ('action','bonus_action','reaction','free_action','passive','special','short_rest','long_rest');

UPDATE creature_sizes SET name = CASE code
 WHEN 'tiny' THEN 'Diminuto'
 WHEN 'small' THEN 'Pequeño'
 WHEN 'medium' THEN 'Mediano'
 WHEN 'large' THEN 'Grande'
 WHEN 'huge' THEN 'Enorme'
 WHEN 'gargantuan' THEN 'Gargantuesco'
 ELSE name END
WHERE code IN ('tiny','small','medium','large','huge','gargantuan');

UPDATE creature_types SET name = CASE code
 WHEN 'aberration' THEN 'Aberración'
 WHEN 'beast' THEN 'Bestia'
 WHEN 'celestial' THEN 'Celestial'
 WHEN 'construct' THEN 'Constructo'
 WHEN 'dragon' THEN 'Dragón'
 WHEN 'elemental' THEN 'Elemental'
 WHEN 'fey' THEN 'Feérico'
 WHEN 'fiend' THEN 'Infernal'
 WHEN 'giant' THEN 'Gigante'
 WHEN 'humanoid' THEN 'Humanoide'
 WHEN 'monstrosity' THEN 'Monstruosidad'
 WHEN 'ooze' THEN 'Cieno'
 WHEN 'plant' THEN 'Planta'
 WHEN 'swarm_of_tiny_beasts' THEN 'Enjambre de bestias diminutas'
 WHEN 'undead' THEN 'No muerto'
 ELSE name END
WHERE code IN ('aberration','beast','celestial','construct','dragon','elemental','fey','fiend','giant','humanoid','monstrosity','ooze','plant','swarm_of_tiny_beasts','undead');

-- Consolidated from 024_remove_dragonlance_codex_records.sql
START TRANSACTION;

CREATE TEMPORARY TABLE IF NOT EXISTS dragonlance_items AS
SELECT id FROM items
WHERE LOWER(CONCAT_WS(' ', name, short_description, description, properties_text, requirements_text, source_page_text)) LIKE '%dragonlance%';

CREATE TEMPORARY TABLE IF NOT EXISTS dragonlance_feats AS
SELECT id FROM feats
WHERE LOWER(CONCAT_WS(' ', name, short_description, description, prerequisites_text, benefits_text, source_page_text)) LIKE '%dragonlance%';

CREATE TEMPORARY TABLE IF NOT EXISTS dragonlance_subspecies AS
SELECT id FROM subspecies
WHERE LOWER(CONCAT_WS(' ', name, short_description, description, lineage_type_code, traits_text, source_page_text, source_url)) LIKE '%dragonlance%';

CREATE TEMPORARY TABLE IF NOT EXISTS dragonlance_backgrounds AS
SELECT id FROM backgrounds
WHERE LOWER(CONCAT_WS(' ', name, short_description, description, background_type_code, setting_name, feature_text, source_page_text, source_url)) LIKE '%dragonlance%';

CREATE TEMPORARY TABLE IF NOT EXISTS dragonlance_background_variants AS
SELECT id FROM background_variants
WHERE background_id IN (SELECT id FROM dragonlance_backgrounds)
   OR LOWER(CONCAT_WS(' ', name, short_description, description, background_type_code, setting_name, feature_text, source_page_text, source_url)) LIKE '%dragonlance%';

CREATE TEMPORARY TABLE IF NOT EXISTS dragonlance_classes AS
SELECT id FROM classes WHERE 1=0;

CREATE TEMPORARY TABLE IF NOT EXISTS dragonlance_subclasses AS
SELECT id FROM subclasses
WHERE class_id IN (SELECT id FROM dragonlance_classes)
   OR LOWER(CONCAT_WS(' ', name, short_description, description, subclass_type_text, requirements_text, source_page_text)) LIKE '%dragonlance%';

DELETE FROM codex_record_tags WHERE owner_type='item' AND owner_id IN (SELECT id FROM dragonlance_items);
DELETE FROM item_weapon_properties WHERE item_id IN (SELECT id FROM dragonlance_items);
DELETE FROM item_poison_types WHERE item_id IN (SELECT id FROM dragonlance_items);
UPDATE items SET source_item_id = NULL WHERE source_item_id IN (SELECT id FROM dragonlance_items);
DELETE FROM items WHERE id IN (SELECT id FROM dragonlance_items);

DELETE FROM codex_record_tags WHERE owner_type='feat' AND owner_id IN (SELECT id FROM dragonlance_feats);
UPDATE feats SET source_feat_id = NULL WHERE source_feat_id IN (SELECT id FROM dragonlance_feats);
DELETE FROM feats WHERE id IN (SELECT id FROM dragonlance_feats);

DELETE FROM codex_record_tags WHERE owner_type='subspecies' AND owner_id IN (SELECT id FROM dragonlance_subspecies);
UPDATE subspecies SET source_subspecies_id = NULL WHERE source_subspecies_id IN (SELECT id FROM dragonlance_subspecies);
DELETE FROM subspecies WHERE id IN (SELECT id FROM dragonlance_subspecies);

DELETE FROM codex_record_tags WHERE owner_type='background_variant' AND owner_id IN (SELECT id FROM dragonlance_background_variants);
UPDATE background_variants SET source_background_variant_id = NULL WHERE source_background_variant_id IN (SELECT id FROM dragonlance_background_variants);
DELETE FROM background_variants WHERE id IN (SELECT id FROM dragonlance_background_variants);

DELETE FROM codex_record_tags WHERE owner_type='background' AND owner_id IN (SELECT id FROM dragonlance_backgrounds);
UPDATE backgrounds SET source_background_id = NULL WHERE source_background_id IN (SELECT id FROM dragonlance_backgrounds);
DELETE FROM backgrounds WHERE id IN (SELECT id FROM dragonlance_backgrounds);

DELETE FROM codex_record_tags WHERE owner_type='subclass' AND owner_id IN (SELECT id FROM dragonlance_subclasses);
UPDATE subclasses SET source_subclass_id = NULL WHERE source_subclass_id IN (SELECT id FROM dragonlance_subclasses);
DELETE FROM subclasses WHERE id IN (SELECT id FROM dragonlance_subclasses);

UPDATE classes SET description = REPLACE(description, 'Dragonlance', 'otros mundos') WHERE description LIKE '%Dragonlance%';

COMMIT;

-- Consolidated from 025_spanish_item_lookup_and_magic_item_links.sql
UPDATE item_types SET name = CASE code
 WHEN 'adventuring_gear' THEN 'Equipo de aventura'
 WHEN 'ammunition' THEN 'Munición'
 WHEN 'armor' THEN 'Armadura'
 WHEN 'explosive' THEN 'Explosivo'
 WHEN 'poison' THEN 'Veneno'
 WHEN 'potion' THEN 'Poción'
 WHEN 'quest_item' THEN 'Objeto de misión'
 WHEN 'ring' THEN 'Anillo'
 WHEN 'rod' THEN 'Vara'
 WHEN 'scroll' THEN 'Pergamino'
 WHEN 'shield' THEN 'Escudo'
 WHEN 'staff' THEN 'Bastón'
 WHEN 'tool' THEN 'Herramienta'
 WHEN 'treasure' THEN 'Tesoro'
 WHEN 'wand' THEN 'Varita'
 WHEN 'weapon' THEN 'Arma'
 WHEN 'wondrous_item' THEN 'Objeto maravilloso'
 ELSE name END
WHERE code IN ('adventuring_gear','ammunition','armor','explosive','poison','potion','quest_item','ring','rod','scroll','shield','staff','tool','treasure','wand','weapon','wondrous_item');

UPDATE item_rarities SET name = CASE code
 WHEN 'common' THEN 'Común'
 WHEN 'uncommon' THEN 'Poco común'
 WHEN 'rare' THEN 'Raro'
 WHEN 'very_rare' THEN 'Muy raro'
 WHEN 'legendary' THEN 'Legendario'
 WHEN 'artifact' THEN 'Artefacto'
 WHEN 'unknown' THEN 'Desconocido'
 ELSE name END
WHERE code IN ('common','uncommon','rare','very_rare','legendary','artifact','unknown');

UPDATE items i
JOIN scraped_wondrous_items swi ON swi.item_name = i.name
JOIN systems sys ON sys.id = i.system_id AND sys.code = 'dnd_5e'
LEFT JOIN item_types typ ON typ.system_id = sys.id AND typ.code = CASE LOWER(swi.item_type_code)
 WHEN 'wondrous_item' THEN 'wondrous_item'
 WHEN 'artículo maravilloso' THEN 'wondrous_item'
 WHEN 'wondrous item' THEN 'wondrous_item'
 WHEN 'weapon' THEN 'weapon'
 WHEN 'arma' THEN 'weapon'
 WHEN 'armor' THEN 'armor'
 WHEN 'armadura' THEN 'armor'
 WHEN 'potion' THEN 'potion'
 WHEN 'poción' THEN 'potion'
 WHEN 'ring' THEN 'ring'
 WHEN 'anillo' THEN 'ring'
 WHEN 'staff' THEN 'staff'
 WHEN 'personal' THEN 'staff'
 WHEN 'bastón' THEN 'staff'
 WHEN 'wand' THEN 'wand'
 WHEN 'varita mágica' THEN 'wand'
 WHEN 'varita' THEN 'wand'
 WHEN 'rod' THEN 'rod'
 WHEN 'vara' THEN 'rod'
 WHEN 'scroll' THEN 'scroll'
 WHEN 'voluta' THEN 'scroll'
 WHEN 'pergamino' THEN 'scroll'
 ELSE 'wondrous_item' END
LEFT JOIN item_rarities rar ON rar.system_id = sys.id AND rar.code = CASE LOWER(swi.rarity_code)
 WHEN 'common' THEN 'common'
 WHEN 'común' THEN 'common'
 WHEN 'uncommon' THEN 'uncommon'
 WHEN 'poco común' THEN 'uncommon'
 WHEN 'rare' THEN 'rare'
 WHEN 'extraño' THEN 'rare'
 WHEN 'raro' THEN 'rare'
 WHEN 'very_rare' THEN 'very_rare'
 WHEN 'muy_raro' THEN 'very_rare'
 WHEN 'muy raro' THEN 'very_rare'
 WHEN 'legendary' THEN 'legendary'
 WHEN 'legendario' THEN 'legendary'
 WHEN 'artifact' THEN 'artifact'
 WHEN 'artefacto' THEN 'artifact'
 WHEN 'unknown' THEN 'unknown'
 WHEN 'desconocido' THEN 'unknown'
 ELSE 'unknown' END
SET i.item_type_id = typ.id,
    i.item_rarity_id = rar.id,
    i.short_description = CONCAT(COALESCE(rar.name, swi.rarity), ' ', COALESCE(typ.name, swi.item_type, 'Objeto mágico')),
    i.description = CONCAT('Categoría: ', swi.category_name, '\nRareza: ', COALESCE(rar.name, swi.rarity), '\nTipo: ', COALESCE(typ.name, swi.item_type, ''), '\nSintonización: ', CASE WHEN swi.requires_attunement THEN 'Requerida' ELSE 'No requerida' END, '\nFuente: ', COALESCE(swi.book_source, swi.source_code, '')),
    i.properties_text = CONCAT('Código de fuente: ', COALESCE(swi.source_code, ''))
WHERE i.is_magical = TRUE;

-- Consolidated from 027_dm_only_creature_codex.sql
START TRANSACTION;

UPDATE creatures c
JOIN visibility_levels vl ON vl.code = 'dm_only'
SET c.visibility_level_id = vl.id
WHERE c.is_active = TRUE;

UPDATE actions a
JOIN action_categories ac ON ac.id = a.action_category_id AND ac.code = 'monster_ability'
JOIN visibility_levels vl ON vl.code = 'dm_only'
SET a.visibility_level_id = vl.id
WHERE a.is_active = TRUE;

COMMIT;

-- Consolidated from 028_remove_srd_2014_creature_duplicates.sql
-- Remove duplicated SRD 2014 creatures when a same-name SRD 2024 creature exists.
-- Keep the 2024 creature/monster-ability data as the canonical Codex record.

CREATE TEMPORARY TABLE IF NOT EXISTS tmp_srd_creature_dups (
    old_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    new_id BIGINT UNSIGNED NOT NULL
) ENGINE=MEMORY;

TRUNCATE TABLE tmp_srd_creature_dups;

INSERT INTO tmp_srd_creature_dups(old_id, new_id)
SELECT c2014.id, c2024.id
FROM creatures c2014
JOIN sources s2014 ON s2014.id = c2014.source_material_id AND s2014.code = 'srd_2014'
JOIN creatures c2024 ON c2024.name = c2014.name AND c2024.is_active = 1
JOIN sources s2024 ON s2024.id = c2024.source_material_id AND s2024.code = 'srd_2024'
WHERE c2014.is_active = 1;

CREATE TEMPORARY TABLE IF NOT EXISTS tmp_srd_old_actions (
    action_id BIGINT UNSIGNED NOT NULL PRIMARY KEY
) ENGINE=MEMORY;

TRUNCATE TABLE tmp_srd_old_actions;

INSERT IGNORE INTO tmp_srd_old_actions(action_id)
SELECT aa.action_id
FROM action_assignments aa
JOIN tmp_srd_creature_dups d ON d.old_id = aa.owner_id
JOIN actions a ON a.id = aa.action_id
JOIN action_categories ac ON ac.id = a.action_category_id AND ac.code = 'monster_ability'
LEFT JOIN sources src ON src.id = a.source_material_id
WHERE aa.owner_type = 'creature'
  AND (a.rules_revision = '2014' OR src.code = 'srd_2014');

-- Preserve custom lineage by pointing custom copies at the kept 2024 source record.
UPDATE creatures c
JOIN tmp_srd_creature_dups d ON d.old_id = c.source_creature_id
SET c.source_creature_id = d.new_id;

DELETE cml
FROM codex_media_links cml
JOIN tmp_srd_creature_dups d ON d.old_id = cml.entity_id
WHERE cml.entity_type = 'creature';

DELETE cml
FROM codex_media_links cml
LEFT JOIN creatures c ON c.id = cml.entity_id
WHERE cml.entity_type = 'creature'
  AND c.id IS NULL;

DELETE aa
FROM action_assignments aa
JOIN tmp_srd_creature_dups d ON d.old_id = aa.owner_id
WHERE aa.owner_type = 'creature';

DELETE a
FROM actions a
JOIN tmp_srd_old_actions oa ON oa.action_id = a.id
WHERE NOT EXISTS (
    SELECT 1 FROM action_assignments aa WHERE aa.action_id = a.id
);

DELETE c
FROM creatures c
JOIN tmp_srd_creature_dups d ON d.old_id = c.id;

DROP TEMPORARY TABLE IF EXISTS tmp_srd_old_actions;
DROP TEMPORARY TABLE IF EXISTS tmp_srd_creature_dups;

-- Consolidated from 029_remove_srd_2014_action_duplicates.sql
-- Remove duplicated SRD 2014 actions when a same-name/same-category SRD 2024 action exists.
-- Keep 2024 records as canonical. Monster abilities are only considered duplicates when
-- they belong to same-name SRD 2014/2024 creature pairs; generic ability names like
-- "Ataque múltiple" on different monsters are intentionally preserved.

CREATE TEMPORARY TABLE IF NOT EXISTS tmp_srd_action_dups (
    old_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    new_id BIGINT UNSIGNED NOT NULL
) ENGINE=MEMORY;

TRUNCATE TABLE tmp_srd_action_dups;

-- Spells/general abilities: same action category + same name across SRD revisions.
INSERT IGNORE INTO tmp_srd_action_dups(old_id, new_id)
SELECT a2014.id, MIN(a2024.id) AS new_id
FROM actions a2014
JOIN sources s2014 ON s2014.id = a2014.source_material_id AND s2014.code = 'srd_2014'
JOIN action_categories ac ON ac.id = a2014.action_category_id AND ac.code <> 'monster_ability'
JOIN actions a2024
  ON a2024.action_category_id = a2014.action_category_id
 AND a2024.name = a2014.name
 AND a2024.is_active = 1
JOIN sources s2024 ON s2024.id = a2024.source_material_id AND s2024.code = 'srd_2024'
WHERE a2014.is_active = 1
GROUP BY a2014.id;

-- Monster abilities: only duplicate if their owning creatures are a same-name SRD pair.
INSERT IGNORE INTO tmp_srd_action_dups(old_id, new_id)
SELECT a2014.id, MIN(a2024.id) AS new_id
FROM actions a2014
JOIN sources s2014 ON s2014.id = a2014.source_material_id AND s2014.code = 'srd_2014'
JOIN action_categories ac ON ac.id = a2014.action_category_id AND ac.code = 'monster_ability'
JOIN action_assignments aa2014 ON aa2014.action_id = a2014.id AND aa2014.owner_type = 'creature'
JOIN creatures c2014 ON c2014.id = aa2014.owner_id
JOIN sources cs2014 ON cs2014.id = c2014.source_material_id AND cs2014.code = 'srd_2014'
JOIN creatures c2024 ON c2024.name = c2014.name AND c2024.is_active = 1
JOIN sources cs2024 ON cs2024.id = c2024.source_material_id AND cs2024.code = 'srd_2024'
JOIN action_assignments aa2024 ON aa2024.owner_type = 'creature' AND aa2024.owner_id = c2024.id
JOIN actions a2024 ON a2024.id = aa2024.action_id
    AND a2024.action_category_id = a2014.action_category_id
    AND a2024.name = a2014.name
    AND a2024.is_active = 1
JOIN sources s2024 ON s2024.id = a2024.source_material_id AND s2024.code = 'srd_2024'
WHERE a2014.is_active = 1
GROUP BY a2014.id;

-- Preserve custom lineage by pointing custom copies at the kept 2024 source action.
UPDATE actions a
JOIN tmp_srd_action_dups d ON d.old_id = a.source_action_id
SET a.source_action_id = d.new_id;

-- Copy assignments to the kept record if they do not already exist there.
INSERT IGNORE INTO action_assignments(action_id, owner_type, owner_id, notes)
SELECT d.new_id, aa.owner_type, aa.owner_id, aa.notes
FROM action_assignments aa
JOIN tmp_srd_action_dups d ON d.old_id = aa.action_id;

DELETE aa
FROM action_assignments aa
JOIN tmp_srd_action_dups d ON d.old_id = aa.action_id;

DELETE atg
FROM action_tags atg
JOIN tmp_srd_action_dups d ON d.old_id = atg.action_id;

DELETE aca
FROM action_class_availability aca
JOIN tmp_srd_action_dups d ON d.old_id = aca.action_id;

DELETE a
FROM actions a
JOIN tmp_srd_action_dups d ON d.old_id = a.id;

DROP TEMPORARY TABLE IF EXISTS tmp_srd_action_dups;

-- Consolidated from 030_merge_identical_monster_abilities.sql
-- Merge mechanically identical non-custom monster abilities into one shared action record.
-- The owning creatures remain linked through action_assignments.
-- Grouping intentionally includes source/rules revision to avoid misleading source labels.

CREATE TEMPORARY TABLE IF NOT EXISTS tmp_identical_monster_action_sig (
    action_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    sig CHAR(32) NOT NULL,
    KEY idx_tmp_identical_monster_action_sig_sig (sig)
) ENGINE=InnoDB;

TRUNCATE TABLE tmp_identical_monster_action_sig;

INSERT INTO tmp_identical_monster_action_sig(action_id, sig)
SELECT a.id,
       MD5(CONCAT_WS('|',
           a.system_id,
           a.action_category_id,
           COALESCE(a.activation_type_id, 0),
           COALESCE(a.source_material_id, 0),
           COALESCE(a.rules_revision, ''),
           COALESCE(a.name, ''),
           COALESCE(a.description, ''),
           COALESCE(a.damage_text, ''),
           COALESCE(a.attack_bonus, ''),
           COALESCE(a.difficulty_class_text, ''),
           COALESCE(a.usage_text, ''),
           COALESCE(a.legendary_cost, ''),
           COALESCE(a.range_text, ''),
           COALESCE(a.duration_text, ''),
           COALESCE(a.components_text, ''),
           COALESCE(a.resource_cost_text, '')
       )) AS sig
FROM actions a
JOIN action_categories ac ON ac.id = a.action_category_id AND ac.code = 'monster_ability'
WHERE a.is_active = 1
  AND a.is_custom = 0;

CREATE TEMPORARY TABLE IF NOT EXISTS tmp_identical_monster_action_keep (
    sig CHAR(32) NOT NULL PRIMARY KEY,
    keep_id BIGINT UNSIGNED NOT NULL
) ENGINE=InnoDB;

TRUNCATE TABLE tmp_identical_monster_action_keep;

INSERT INTO tmp_identical_monster_action_keep(sig, keep_id)
SELECT sig, MIN(action_id) AS keep_id
FROM tmp_identical_monster_action_sig
GROUP BY sig
HAVING COUNT(*) > 1;

CREATE TEMPORARY TABLE IF NOT EXISTS tmp_identical_monster_action_dups (
    old_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    keep_id BIGINT UNSIGNED NOT NULL,
    KEY idx_tmp_identical_monster_action_dups_keep (keep_id)
) ENGINE=InnoDB;

TRUNCATE TABLE tmp_identical_monster_action_dups;

INSERT INTO tmp_identical_monster_action_dups(old_id, keep_id)
SELECT s.action_id, k.keep_id
FROM tmp_identical_monster_action_sig s
JOIN tmp_identical_monster_action_keep k ON k.sig = s.sig
WHERE s.action_id <> k.keep_id;

-- Preserve custom lineage if any custom action was copied from a soon-to-be-merged duplicate.
UPDATE actions a
JOIN tmp_identical_monster_action_dups d ON d.old_id = a.source_action_id
SET a.source_action_id = d.keep_id;

-- Move creature assignments to the kept shared action.
INSERT IGNORE INTO action_assignments(action_id, owner_type, owner_id, notes)
SELECT d.keep_id, aa.owner_type, aa.owner_id, aa.notes
FROM action_assignments aa
JOIN tmp_identical_monster_action_dups d ON d.old_id = aa.action_id;

-- Preserve tags/availability just in case any duplicated action has them.
INSERT IGNORE INTO action_tags(action_id, tag_id)
SELECT d.keep_id, atg.tag_id
FROM action_tags atg
JOIN tmp_identical_monster_action_dups d ON d.old_id = atg.action_id;

INSERT IGNORE INTO action_class_availability(action_id, class_id, notes)
SELECT d.keep_id, aca.class_id, aca.notes
FROM action_class_availability aca
JOIN tmp_identical_monster_action_dups d ON d.old_id = aca.action_id;

DELETE aa
FROM action_assignments aa
JOIN tmp_identical_monster_action_dups d ON d.old_id = aa.action_id;

DELETE atg
FROM action_tags atg
JOIN tmp_identical_monster_action_dups d ON d.old_id = atg.action_id;

DELETE aca
FROM action_class_availability aca
JOIN tmp_identical_monster_action_dups d ON d.old_id = aca.action_id;

DELETE a
FROM actions a
JOIN tmp_identical_monster_action_dups d ON d.old_id = a.id;

DROP TEMPORARY TABLE IF EXISTS tmp_identical_monster_action_dups;
DROP TEMPORARY TABLE IF EXISTS tmp_identical_monster_action_keep;
DROP TEMPORARY TABLE IF EXISTS tmp_identical_monster_action_sig;

-- Consolidated from 031_copy_custom_codex_media_links.sql
-- Existing custom Codex records should inherit the media links of their base record.
-- This keeps custom creatures using the same portrait/token as the source creature by default.

INSERT IGNORE INTO codex_media_links(
    media_asset_id, entity_type, entity_id, media_purpose_id, visibility_level_id,
    title, caption, sort_order, is_primary
)
SELECT
    cml.media_asset_id, cml.entity_type, c.id, cml.media_purpose_id, cml.visibility_level_id,
    cml.title, cml.caption, cml.sort_order, cml.is_primary
FROM creatures c
JOIN codex_media_links cml
  ON cml.entity_type = 'creature'
 AND cml.entity_id = c.source_creature_id
WHERE c.is_custom = 1
  AND c.source_creature_id IS NOT NULL;

INSERT IGNORE INTO codex_media_links(
    media_asset_id, entity_type, entity_id, media_purpose_id, visibility_level_id,
    title, caption, sort_order, is_primary
)
SELECT
    cml.media_asset_id, cml.entity_type, i.id, cml.media_purpose_id, cml.visibility_level_id,
    cml.title, cml.caption, cml.sort_order, cml.is_primary
FROM items i
JOIN codex_media_links cml
  ON cml.entity_type = 'item'
 AND cml.entity_id = i.source_item_id
WHERE i.is_custom = 1
  AND i.source_item_id IS NOT NULL;

-- Consolidated from 032_spell_translation_name_corrections.sql
-- Manual Spanish spell-name corrections for awkward literal machine translations.
-- Wikidot remains the source, but translated display names are normalized here.

UPDATE actions a
JOIN action_categories ac ON ac.id = a.action_category_id AND ac.code = 'spell'
SET a.name = CASE a.name
    WHEN 'Abi-Dalzims Horrible marchitamiento' THEN 'Marchitamiento horripilante de Abi-Dalzim'
    WHEN 'Aganazzar''s Abrasador' THEN 'Abrasador de Aganazzar'
    WHEN 'Elementos absorbentes' THEN 'Absorber elementos'
    WHEN 'Alterar el yo' THEN 'Alterar aspecto propio'
    WHEN 'Ashardalon''s Paso' THEN 'Zancada de Ashardalon'
    WHEN 'Bigby''s Mano' THEN 'Mano de Bigby'
    WHEN 'Llamar a Lightning' THEN 'Llamar al relámpago'
    WHEN 'Rayo en cadena' THEN 'Cadena de relámpagos'
    WHEN 'Conecta con la naturaleza' THEN 'Comunión con la naturaleza'
    WHEN 'Spray de color' THEN 'Rociada de color'
    WHEN 'Cruzado''s Manto' THEN 'Manto del cruzado'
    WHEN 'Disfrazarse a uno mismo' THEN 'Disfrazarse'
    WHEN 'Invocaciones instantáneas de Drawmij''s' THEN 'Convocación instantánea de Drawmij'
    WHEN 'Evard''s Tentáculos negros' THEN 'Tentáculos negros de Evard'
    WHEN 'Mejorar la capacidad' THEN 'Mejorar característica'
    WHEN 'Fizban''s Escudo Platino' THEN 'Escudo de platino de Fizban'
    WHEN 'Fortuna''s Favor' THEN 'Favor de la fortuna'
    WHEN 'Galder''s Mensajero rápido' THEN 'Mensajero veloz de Galder'
    WHEN 'Mayor invisibilidad' THEN 'Invisibilidad mayor'
    WHEN 'Mayor restauración' THEN 'Restauración mayor'
    WHEN 'Hunter''s Mark' THEN 'Marca del cazador'
    WHEN 'Jim''s Misil Mágico' THEN 'Proyectil mágico de Jim'
    WHEN 'Leomund''s Cofre secreto' THEN 'Cofre secreto de Leomund'
    WHEN 'Rayo' THEN 'Relámpago'
    WHEN 'Melf''s Flecha ácida' THEN 'Flecha ácida de Melf'
    WHEN 'Mordenkainen''s Perro fiel' THEN 'Sabueso fiel de Mordenkainen'
    WHEN 'Mordenkainen''s Magnífica Mansión' THEN 'Mansión magnífica de Mordenkainen'
    WHEN 'Mordenkainen''s Santuario privado' THEN 'Santuario privado de Mordenkainen'
    WHEN 'Espada Mordenkainen''s' THEN 'Espada de Mordenkainen'
    WHEN 'Nathair''s Travesura' THEN 'Travesura de Nathair'
    WHEN 'Nathair''s Travesura (UA)' THEN 'Travesura de Nathair (UA)'
    WHEN 'Nystul''s Aura mágica' THEN 'Aura mágica de Nystul'
    WHEN 'Passwall' THEN 'Pasamuros'
    WHEN 'Otiluke''s Esfera congelante' THEN 'Esfera congelante de Otiluke'
    WHEN 'Otiluke''s Esfera Resiliente' THEN 'Esfera resistente de Otiluke'
    WHEN 'Otto''s Baile irresistible' THEN 'Danza irresistible de Otto'
    WHEN 'Espray venenoso' THEN 'Rociada venenosa'
    WHEN 'Spray prismático' THEN 'Rociada prismática'
    WHEN 'Rary''s Vínculo telepático' THEN 'Vínculo telepático de Rary'
    WHEN 'Spray de cartas' THEN 'Ráfaga de cartas'
    WHEN 'Spray de cartas (UA)' THEN 'Ráfaga de cartas (UA)'
    WHEN 'Perdonen a los moribundos' THEN 'Piedad con los moribundos'
    WHEN 'Tasha''s Cerveza cáustica' THEN 'Brebaje cáustico de Tasha'
    WHEN 'Tasha''s Risa espantosa' THEN 'Risa espantosa de Tasha'
    WHEN 'Tasha''s Látigo mental' THEN 'Látigo mental de Tasha'
    WHEN 'Tasha''s Disfraz de otro mundo' THEN 'Apariencia sobrenatural de Tasha'
    WHEN 'Disco flotante Tenser''s' THEN 'Disco flotante de Tenser'
    ELSE a.name
END
WHERE a.name IN (
    'Abi-Dalzims Horrible marchitamiento','Aganazzar''s Abrasador','Elementos absorbentes','Alterar el yo','Ashardalon''s Paso','Bigby''s Mano',
    'Llamar a Lightning','Rayo en cadena','Conecta con la naturaleza','Spray de color','Cruzado''s Manto','Disfrazarse a uno mismo','Invocaciones instantáneas de Drawmij''s',
    'Evard''s Tentáculos negros','Mejorar la capacidad','Fizban''s Escudo Platino','Fortuna''s Favor','Galder''s Mensajero rápido',
    'Mayor invisibilidad','Mayor restauración','Hunter''s Mark','Jim''s Misil Mágico','Leomund''s Cofre secreto','Rayo',
    'Melf''s Flecha ácida','Mordenkainen''s Perro fiel','Mordenkainen''s Magnífica Mansión','Mordenkainen''s Santuario privado',
    'Espada Mordenkainen''s','Nathair''s Travesura','Nathair''s Travesura (UA)','Nystul''s Aura mágica','Passwall',
    'Otiluke''s Esfera congelante','Otiluke''s Esfera Resiliente','Otto''s Baile irresistible','Espray venenoso','Spray prismático','Rary''s Vínculo telepático','Spray de cartas','Spray de cartas (UA)',
    'Perdonen a los moribundos','Tasha''s Cerveza cáustica','Tasha''s Risa espantosa','Tasha''s Látigo mental',
    'Tasha''s Disfraz de otro mundo','Disco flotante Tenser''s'
);

-- Consolidated from 035_merge_duplicate_species_by_name.sql
-- Fuse duplicate non-custom species records that only differ by source/import row.
-- Keeps the first active non-custom record per name, preferring a non-null source.

CREATE TEMPORARY TABLE tmp_species_keep AS
SELECT id old_id,
       FIRST_VALUE(id) OVER (PARTITION BY name ORDER BY (source_material_id IS NULL), id) keep_id
FROM species
WHERE is_active = 1 AND is_custom = 0;

DELETE FROM tmp_species_keep WHERE old_id = keep_id;

-- Preserve tags from removed duplicate rows on the kept species.
INSERT IGNORE INTO codex_record_tags(owner_type, owner_id, tag_id)
SELECT 'species', d.keep_id, crt.tag_id
FROM tmp_species_keep d
JOIN codex_record_tags crt ON crt.owner_type = 'species' AND crt.owner_id = d.old_id;

-- Repoint subspecies and custom lineage references.
UPDATE subspecies ss
JOIN tmp_species_keep d ON d.old_id = ss.species_id
SET ss.species_id = d.keep_id;

UPDATE species s
JOIN tmp_species_keep d ON d.old_id = s.source_species_id
SET s.source_species_id = d.keep_id;

-- Remove duplicate species tag rows and duplicate species records.
DELETE crt FROM codex_record_tags crt
JOIN tmp_species_keep d ON d.old_id = crt.owner_id
WHERE crt.owner_type = 'species';

DELETE s FROM species s
JOIN tmp_species_keep d ON d.old_id = s.id;

DROP TEMPORARY TABLE IF EXISTS tmp_species_keep;
