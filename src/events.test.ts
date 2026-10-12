import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chainEvents } from './events';

type Handler = (...args: unknown[]) => unknown;

/** Cypress's `on`, as it behaves: the last handler of an event is the one kept, tasks aside. */
function cypressOn(): { on: Cypress.PluginEvents; registered: [string, unknown][]; kept: Map<string, Handler> } {
  const registered: [string, unknown][] = [];
  const kept = new Map<string, Handler>();
  const on = (event: string, handler: Handler) => {
    registered.push([event, handler]);
    kept.set(event, handler);
  };
  return { on: on as unknown as Cypress.PluginEvents, registered, kept };
}

test('every handler of an event runs, in the order registered, through one handler given to Cypress', async () => {
  const cypress = cypressOn();
  const on = chainEvents(cypress.on) as unknown as (event: string, handler: Handler) => void;
  const ran: string[] = [];
  on('before:run', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    ran.push('preprocessor');
  });
  on('before:run', () => ran.push('dappress'));
  on('after:spec', (spec) => ran.push(`after ${spec}`));
  assert.deepEqual(
    cypress.registered.map(([event]) => event),
    ['before:run', 'after:spec'],
  );
  await cypress.kept.get('before:run')!({});
  await cypress.kept.get('after:spec')!('a.feature');
  assert.deepEqual(ran, ['preprocessor', 'dappress', 'after a.feature']);
});

test('before:browser:launch: each handler gets the launch options of the one before, changed in place or returned', async () => {
  const cypress = cypressOn();
  const on = chainEvents(cypress.on) as unknown as (event: string, handler: Handler) => void;
  on('before:browser:launch', (_browser, options) => {
    (options as { args: string[] }).args.push('--first');
  });
  on('before:browser:launch', (_browser, options) => {
    const { args, extensions } = options as { args: string[]; extensions: string[] };
    return { args: [...args, '--second'], extensions: [...extensions, '/metamask'] };
  });
  const launchOptions = { args: ['--cypress'], extensions: [], preferences: { default: {} } };
  const result = await cypress.kept.get('before:browser:launch')!({ name: 'chrome' }, launchOptions);
  assert.deepEqual(result, { args: ['--cypress', '--first', '--second'], extensions: ['/metamask'], preferences: { default: {} } });
});

test('after:screenshot: each handler gets the details the one before changed, and Cypress all the changes', async () => {
  const cypress = cypressOn();
  const on = chainEvents(cypress.on) as unknown as (event: string, handler: Handler) => void;
  on('after:screenshot', () => ({ path: '/moved.png' }));
  on('after:screenshot', (details) => {
    assert.equal((details as { path: string }).path, '/moved.png');
  });
  assert.deepEqual(await cypress.kept.get('after:screenshot')!({ path: '/shot.png', size: 1 }), { path: '/moved.png' });
});

test('tasks and the preprocessor go to Cypress as given: it merges the tasks itself', () => {
  const cypress = cypressOn();
  const on = chainEvents(cypress.on) as unknown as (event: string, handler: unknown) => void;
  const tasks = [{ a: () => null }, { b: () => null }];
  const preprocessor = () => '';
  on('task', tasks[0]);
  on('task', tasks[1]);
  on('file:preprocessor', preprocessor);
  assert.deepEqual(cypress.registered, [
    ['task', tasks[0]],
    ['task', tasks[1]],
    ['file:preprocessor', preprocessor],
  ]);
});

test('a handler that fails leaves the others to run, and the run fails with the first failure', async () => {
  const cypress = cypressOn();
  const on = chainEvents(cypress.on) as unknown as (event: string, handler: Handler) => void;
  const ran: string[] = [];
  on('after:run', () => {
    throw new Error('first');
  });
  on('after:run', async () => {
    throw new Error('second');
  });
  on('after:run', () => ran.push('report'));
  await assert.rejects(async () => cypress.kept.get('after:run')!({}), /first/);
  assert.deepEqual(ran, ['report']);
});

test('a handler that is not a function fails as it is registered, naming the event', () => {
  const cypress = cypressOn();
  const on = chainEvents(cypress.on) as unknown as (event: string, handler: unknown) => void;
  on('before:spec', () => null);
  assert.throws(() => on('before:spec', 'not a function'), /before:spec.*function/);
});
