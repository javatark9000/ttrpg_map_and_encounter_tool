USE dnd_manager;

CREATE TABLE IF NOT EXISTS action_class_availability (
 action_id BIGINT UNSIGNED NOT NULL,
 class_id BIGINT UNSIGNED NOT NULL,
 notes TEXT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(action_id, class_id),
 FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE CASCADE,
 FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO classes (system_id, visibility_level_id, source_material_id, name, short_description, description, is_custom, is_active)
SELECT sys.id, vis.id, src.id, x.name, x.short_description, x.description, FALSE, TRUE
FROM systems sys
JOIN visibility_levels vis ON vis.code = 'public'
LEFT JOIN sources src ON src.system_id = sys.id AND src.code = 'phb'
JOIN (
 SELECT 'Artificer' name, 'Magical inventor and maker.' short_description, 'D&D 5e class placeholder for spell/action availability.' description UNION ALL
 SELECT 'Barbarian', 'Primal warrior.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Bard', 'Magical performer and skill expert.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Cleric', 'Divine spellcaster.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Druid', 'Nature spellcaster and shapeshifter.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Fighter', 'Martial combat expert.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Monk', 'Martial artist using discipline and ki.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Paladin', 'Divine warrior.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Ranger', 'Wilderness warrior and spellcaster.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Rogue', 'Skillful expert and precise attacker.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Sorcerer', 'Innate arcane spellcaster.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Warlock', 'Pact-based arcane spellcaster.', 'D&D 5e class placeholder for spell/action availability.' UNION ALL
 SELECT 'Wizard', 'Scholarly arcane spellcaster.', 'D&D 5e class placeholder for spell/action availability.'
) x
WHERE sys.code = 'dnd_5e'
AND NOT EXISTS (
 SELECT 1 FROM classes c
 WHERE c.system_id = sys.id AND c.name = x.name
);
