USE dnd_manager;

INSERT INTO item_types (system_id, code, name, description)
SELECT s.id, 'explosive', 'Explosive', 'Explosive items such as bombs, gunpowder, dynamite, and grenades.'
FROM systems s
WHERE s.code = 'dnd_5e'
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);
