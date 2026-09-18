CREATE TABLE dish (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'known' CHECK (status IN ('known', 'idea', 'retired')),
  form TEXT,
  base_id INTEGER REFERENCES dish(id) ON DELETE SET NULL,
  is_base INTEGER NOT NULL DEFAULT 0,
  effort INTEGER NOT NULL DEFAULT 2 CHECK (effort BETWEEN 1 AND 3),
  meal_slots TEXT NOT NULL DEFAULT 'lunch,dinner',
  pinned INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  notes_updated_at TEXT,
  retired_at TEXT,
  origin TEXT NOT NULL DEFAULT 'typed' CHECK (origin IN ('typed', 'expansion', 'import', 'ai')),
  confirmed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX dish_status ON dish(status);

CREATE INDEX dish_base ON dish(base_id);

CREATE TABLE ingredient (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  kind TEXT NOT NULL DEFAULT 'fresh' CHECK (kind IN ('fresh', 'staple')),
  aliases TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE dish_ingredient (
  dish_id INTEGER NOT NULL REFERENCES dish(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredient(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'main' CHECK (role IN ('defining', 'main', 'optional')),
  origin TEXT NOT NULL DEFAULT 'typed',
  confirmed INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (dish_id, ingredient_id)
);

CREATE INDEX dish_ingredient_ingredient ON dish_ingredient(ingredient_id);

CREATE TABLE dish_version (
  id INTEGER PRIMARY KEY,
  dish_id INTEGER NOT NULL REFERENCES dish(id) ON DELETE CASCADE,
  n INTEGER NOT NULL,
  body TEXT,
  tweaks TEXT NOT NULL DEFAULT '[]',
  is_current INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE (dish_id, n)
);

CREATE TABLE cook_event (
  id INTEGER PRIMARY KEY,
  dish_id INTEGER NOT NULL REFERENCES dish(id) ON DELETE CASCADE,
  cooked_at TEXT NOT NULL,
  version_id INTEGER REFERENCES dish_version(id) ON DELETE SET NULL,
  meal_slot TEXT NOT NULL DEFAULT 'dinner'
);

CREATE INDEX cook_event_dish ON cook_event(dish_id, cooked_at);

CREATE TABLE pantry (
  ingredient_id INTEGER PRIMARY KEY REFERENCES ingredient(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'have' CHECK (state IN ('have', 'low', 'out')),
  updated_at TEXT NOT NULL
);

CREATE TABLE source (
  id INTEGER PRIMARY KEY,
  dish_id INTEGER NOT NULL REFERENCES dish(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('url', 'photo', 'verbal')),
  ref TEXT,
  raw TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE person (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  stage TEXT
);

CREATE TABLE dish_person (
  dish_id INTEGER NOT NULL REFERENCES dish(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  suitability TEXT,
  modification TEXT,
  PRIMARY KEY (dish_id, person_id)
);
