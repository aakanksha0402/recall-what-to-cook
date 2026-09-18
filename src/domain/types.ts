export type DishStatus = 'known' | 'idea' | 'retired';
export type Origin = 'typed' | 'expansion' | 'import' | 'ai';
export type IngredientKind = 'fresh' | 'staple';
export type IngredientRole = 'defining' | 'main' | 'optional';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner';
export type PantryState = 'have' | 'low' | 'out';
export type Effort = 1 | 2 | 3;

export type Bucket = 'Favourite' | 'Rut' | 'Forgotten' | 'New' | 'Retired' | 'NeedsWork' | 'Base' | 'Variation' | 'Regular';

export interface Dish {
  id: number;
  name: string;
  status: DishStatus;
  form: string | null;
  baseId: number | null;
  isBase: boolean;
  effort: Effort;
  mealSlots: MealSlot[];
  pinned: boolean;
  notes: string;
  notesUpdatedAt: string | null;
  retiredAt: string | null;
  origin: Origin;
  confirmedAt: string | null;
  createdAt: string;
}

export interface Ingredient {
  id: number;
  name: string;
  kind: IngredientKind;
  aliases: string[];
}

export interface DishIngredient extends Ingredient {
  role: IngredientRole;
  inherited: boolean;
}

export interface DishVersion {
  id: number;
  dishId: number;
  n: number;
  body: string | null;
  tweaks: string[];
  isCurrent: boolean;
  createdAt: string;
}

export interface CookEvent {
  id: number;
  dishId: number;
  cookedAt: string;
  versionId: number | null;
  mealSlot: MealSlot;
}

export interface Tag {
  id: number;
  name: string;
  count: number;
}

export interface Settings {
  freshDays: number;
  suppressDays: number;
  forgottenDays: number;
  weekendRelax: boolean;
}

/** Everything the buckets + ranking engines need about one dish, loaded in one pass. */
export interface DishFacts {
  dish: Dish;
  cookDates: string[];
  childCookDates: string[];
  ingredients: DishIngredient[];
  tags: string[];
  currentVersion: DishVersion | null;
  versionCount: number;
  suppressedUntil: string | null;
}

export interface Suggestion {
  dish: Dish;
  bucket: Bucket;
  reason: string;
  meta: string;
  freshMatches: string[];
  score: number;
}
