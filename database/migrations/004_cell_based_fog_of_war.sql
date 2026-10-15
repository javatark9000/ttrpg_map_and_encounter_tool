-- Fresh installations already have the final table from schema.sql. Creating
-- an empty legacy table makes this migration safe there as well as on upgrades.
CREATE TABLE IF NOT EXISTS scenario_map_focus (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 scenario_id BIGINT UNSIGNED NOT NULL,
 x INT UNSIGNED NOT NULL,
 y INT UNSIGNED NOT NULL,
 width_cells INT UNSIGNED NOT NULL,
 height_cells INT UNSIGNED NOT NULL,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
 INDEX(scenario_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS scenario_fog_cells (
 scenario_id BIGINT UNSIGNED NOT NULL,
 x TINYINT UNSIGNED NOT NULL,
 y TINYINT UNSIGNED NOT NULL,
 PRIMARY KEY(scenario_id,x,y),
 FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- The old model stored visible rectangles. For scenarios using it, store every
-- cell outside the union of those rectangles as fogged so visibility is preserved.
INSERT IGNORE INTO scenario_fog_cells(scenario_id,x,y)
WITH RECURSIVE cell_index(n) AS (
 SELECT 0
 UNION ALL
 SELECT n + 1 FROM cell_index WHERE n < 59
)
SELECT s.id,cell_x.n,cell_y.n
FROM scenarios s
JOIN cell_index cell_x ON cell_x.n < s.width
JOIN cell_index cell_y ON cell_y.n < s.height
WHERE EXISTS (
 SELECT 1 FROM scenario_map_focus focus WHERE focus.scenario_id=s.id
)
AND NOT EXISTS (
 SELECT 1
 FROM scenario_map_focus focus
 WHERE focus.scenario_id=s.id
   AND cell_x.n >= focus.x
   AND cell_x.n < focus.x + focus.width_cells
   AND cell_y.n >= focus.y
   AND cell_y.n < focus.y + focus.height_cells
);

DROP TABLE scenario_map_focus;
