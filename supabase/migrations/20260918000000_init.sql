-- Akku schema on Postgres. Every table is per-user (user_id defaults to the caller)
-- and locked down with row-level security, so the static app talks to the
-- database directly with the publishable key.

create extension if not exists citext;

create table public.dish (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name citext not null,
  status text not null default 'known' check (status in ('known', 'idea', 'retired')),
  form text,
  base_id bigint references public.dish(id) on delete set null,
  is_base boolean not null default false,
  effort smallint not null default 2 check (effort between 1 and 3),
  meal_slots text not null default 'lunch,dinner',
  pinned boolean not null default false,
  notes text not null default '',
  notes_updated_at timestamptz,
  retired_at timestamptz,
  origin text not null default 'typed' check (origin in ('typed', 'expansion', 'import', 'ai')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index dish_base_idx on public.dish (base_id);

create table public.ingredient (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name citext not null,
  kind text not null default 'fresh' check (kind in ('fresh', 'staple')),
  aliases jsonb not null default '[]'::jsonb,
  unique (user_id, name)
);

create table public.dish_ingredient (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dish_id bigint not null references public.dish(id) on delete cascade,
  ingredient_id bigint not null references public.ingredient(id) on delete cascade,
  role text not null default 'main' check (role in ('defining', 'main', 'optional')),
  origin text not null default 'typed',
  confirmed boolean not null default true,
  primary key (dish_id, ingredient_id)
);
create index dish_ingredient_ingredient_idx on public.dish_ingredient (ingredient_id);

create table public.dish_version (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dish_id bigint not null references public.dish(id) on delete cascade,
  n integer not null,
  body text,
  tweaks jsonb not null default '[]'::jsonb,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  unique (dish_id, n)
);

create table public.cook_event (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dish_id bigint not null references public.dish(id) on delete cascade,
  cooked_at timestamptz not null default now(),
  version_id bigint references public.dish_version(id) on delete set null,
  meal_slot text not null default 'dinner'
);
create index cook_event_dish_idx on public.cook_event (dish_id, cooked_at);

create table public.pantry (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ingredient_id bigint not null references public.ingredient(id) on delete cascade,
  state text not null default 'have' check (state in ('have', 'low', 'out')),
  updated_at timestamptz not null default now(),
  primary key (ingredient_id)
);

create table public.source (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dish_id bigint not null references public.dish(id) on delete cascade,
  kind text not null check (kind in ('url', 'photo', 'verbal')),
  ref text,
  raw text,
  created_at timestamptz not null default now()
);

create table public.person (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  stage text
);

create table public.dish_person (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dish_id bigint not null references public.dish(id) on delete cascade,
  person_id bigint not null references public.person(id) on delete cascade,
  suitability text,
  modification text,
  primary key (dish_id, person_id)
);

create table public.tag (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name citext not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.dish_tag (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dish_id bigint not null references public.dish(id) on delete cascade,
  tag_id bigint not null references public.tag(id) on delete cascade,
  primary key (dish_id, tag_id)
);
create index dish_tag_tag_idx on public.dish_tag (tag_id);

-- One parked dish per person (spec §6: a second one would make it a meal plan).
create table public.next_up (
  user_id uuid not null default auth.uid() primary key references auth.users(id) on delete cascade,
  dish_id bigint not null references public.dish(id) on delete cascade,
  set_at timestamptz not null default now()
);

create table public.suppression (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dish_id bigint not null references public.dish(id) on delete cascade,
  until timestamptz not null,
  primary key (dish_id)
);

create table public.proposal_answer (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dish_key text not null,
  answer text not null check (answer in ('no')),
  answered_at timestamptz not null default now(),
  primary key (user_id, dish_key)
);

create table public.setting (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null,
  value text not null,
  primary key (user_id, key)
);

-- Row-level security: every table, the same four "own rows" policies.
do $$
declare
  t text;
begin
  foreach t in array array[
    'dish', 'ingredient', 'dish_ingredient', 'dish_version', 'cook_event', 'pantry', 'source',
    'person', 'dish_person', 'tag', 'dish_tag', 'next_up', 'suppression', 'proposal_answer', 'setting'
  ] loop
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "own insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;
