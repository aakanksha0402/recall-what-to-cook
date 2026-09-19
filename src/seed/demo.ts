import type { Repo } from '../repo/repo';

/** Dev-only (`?demo=1`): a plausible repertoire with history, so every screen has something to show. */
export async function seedDemo(repo: Repo): Promise<void> {
  if ((await repo.dishCount()) > 0) return;
  const now = Date.now();
  const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();

  const names = [
    'Vazhakkai varuval #quick #south',
    'Mushroom masala #north #quick',
    'Methi thepla #lunchbox',
    'Kadai paneer #north',
    'Bisi bele bath #weekend #south #freezes',
    'Ennai kathirikai #weekend #south',
    'Onion tomato gravy #base #freezes',
    'Palak paneer #north',
    'Paneer bhurji #quick #lunchbox',
    'Curd rice #quick #south',
    'Kadhi #north',
    'Chole #weekend #north #freezes',
    'Beans paruppu usili #south',
    'Rajma chawal #weekend',
  ];
  const ids = await repo.createFromLines(names);
  const byName = new Map<string, number>();
  for (let i = 0; i < names.length; i++) byName.set(names[i]!.replace(/\s*#.*$/, ''), ids[i]!);
  const id = (n: string) => byName.get(n)!;

  const cooks: Record<string, number[]> = {
    'Vazhakkai varuval': [64, 120, 190],
    'Mushroom masala': [1, 16, 40, 75, 110, 150],
    'Methi thepla': [71, 95, 120, 150, 180, 210, 240, 270],
    'Bisi bele bath': [7, 40, 72, 100, 135, 170, 200, 240, 280, 320, 360, 400, 440, 480, 520, 560, 600, 640, 700],
    'Ennai kathirikai': [94, 134, 175, 220, 260],
    'Onion tomato gravy': [20, 45, 70, 100, 130, 160, 190, 220, 250, 280, 310, 340],
    'Palak paneer': [88, 130, 170, 210, 250, 300, 350],
    'Paneer bhurji': [27, 60, 90, 120],
    'Curd rice': [2, 9, 14, 22, 40, 61, 80, 100, 121, 140],
    Kadhi: [22, 60, 95, 130, 170],
    Chole: [10, 35, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 390],
    'Beans paruppu usili': [33, 66, 99],
  };
  for (const [name, days] of Object.entries(cooks)) for (const d of days) await repo.logCookAt(id(name), ago(d));

  const tweaks: Record<string, string[]> = {
    'Vazhakkai varuval': ['Slice thin, salt water first so it does not brown', 'Sambar powder, not chilli powder', 'Shallow fry, do not crowd the pan'],
    'Mushroom masala': ['Gravy first, then mushroom in at the end', 'Half the chilli, more kasuri methi', 'paneer instead of mushroom works, add it later'],
    'Bisi bele bath': ['Dal softer than you think', 'Tamarind before the vegetables', 'Ghee at the end, generously'],
    'Onion tomato gravy': ['Onion until it truly browns, 15 minutes', 'Tomato until the oil separates', 'Freezes in portions'],
    Kadhi: ['Sour curd, the older the better', 'Fried paneer cubes if no pakora'],
    'Methi thepla': ['Curd in the dough, no water', 'Rest 20 minutes or it tears'],
  };
  for (const [name, lines] of Object.entries(tweaks)) {
    for (const line of lines) await repo.addTweak(id(name), line);
    // Backdate so only "Mushroom masala" reads as tweaked-since-last-cook.
    if (name !== 'Mushroom masala') await repo.backdateVersions(id(name), ago(400));
  }

  await repo.updateNotes(id('Onion tomato gravy'), 'Half a spoon of sugar if the tomatoes are sour.');
  await repo.updateNotes(id('Ennai kathirikai'), 'Small brinjals only. The big ones go to mush.');
  await repo.updateNotes(id('Methi thepla'), "Mum's version. Good cold in a tiffin.");

  await repo.setPinned(id('Bisi bele bath'), true);
  await repo.retire(id('Curd rice'));
  await repo.setNextUp(id('Rajma chawal'));

  await repo.markBase(id('Onion tomato gravy'), true);
  for (const n of ['Mushroom masala', 'Kadai paneer', 'Paneer bhurji']) await repo.setBase(id(n), id('Onion tomato gravy'));
  await repo.setIngredients(id('Onion tomato gravy'), ['onion', 'tomato', 'ginger', 'garlic']);
  await repo.setIngredients(id('Mushroom masala'), ['mushroom', 'capsicum', 'kasuri methi']);
  await repo.setIngredients(id('Kadai paneer'), ['paneer', 'capsicum']);
  await repo.setIngredients(id('Palak paneer'), ['spinach', 'paneer', 'cream']);

  for (const n of ['tomato', 'mushroom', 'fenugreek leaf']) {
    const ing = await repo.ensureIngredient(n);
    await repo.togglePantry(ing.id);
  }
}
