CREATE TABLE next_up (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  dish_id INTEGER NOT NULL REFERENCES dish(id) ON DELETE CASCADE,
  set_at TEXT NOT NULL
);

CREATE TABLE suppression (
  dish_id INTEGER PRIMARY KEY REFERENCES dish(id) ON DELETE CASCADE,
  until TEXT NOT NULL
);

CREATE TABLE proposal_answer (
  dish_key TEXT PRIMARY KEY,
  answer TEXT NOT NULL CHECK (answer IN ('no')),
  answered_at TEXT NOT NULL
);

CREATE TABLE setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO setting (key, value) VALUES ('fresh_days', '5');

INSERT INTO setting (key, value) VALUES ('suppress_days', '5');

INSERT INTO setting (key, value) VALUES ('forgotten_days', '60');

INSERT INTO setting (key, value) VALUES ('weekend_relax', '1');

INSERT INTO setting (key, value) VALUES ('proposals_answered', '0');
