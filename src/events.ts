// Cypress keeps one handler per plugin event, the last one registered: two
// plugins that each register before:run, as Dappress and the Cucumber
// preprocessor do, leave only one of them running. Tasks aside, which it merges.
// chainEvents() wraps setupNodeEvents' `on` so that every handler runs.

// The events with a handler per plugin to run. A task Cypress merges itself;
// file:preprocessor and dev-server:start have one handler, which bundles the specs
const CHAINED = new Set(['before:run', 'after:run', 'before:spec', 'after:spec', 'before:browser:launch', 'after:browser:launch', 'after:screenshot']);

type Handler = (...args: unknown[]) => unknown;

/**
 * Give this `on` to every plugin, Dappress included, for each to keep its
 * handlers whatever the order they register in:
 *
 *   setupNodeEvents(cypressOn, config) {
 *     const on = chainEvents(cypressOn);
 *     await addCucumberPreprocessorPlugin(on, config);
 *     return configureDappress(on, config);
 *   }
 *
 * The handlers of an event run one after the other, in the order they were
 * registered. Each before:browser:launch handler gets the launch options the
 * one before it returned, each after:screenshot handler the details. A
 * handler that fails leaves the ones after it to run, as another plugin's
 * after:run writing its report, and the event then fails with the first failure.
 */
export function chainEvents(on: Cypress.PluginEvents): Cypress.PluginEvents {
  const chains = new Map<string, Handler[]>();
  const chained = (event: string, handler: Handler): void => {
    if (!CHAINED.has(event)) return (on as (event: string, handler: unknown) => void)(event, handler);
    // Cypress checks the handler it is given, which is ours: theirs would fail only as the event comes
    if (typeof handler !== 'function') throw new Error(`[dappress] The ${event} handler must be a function, not ${typeof handler}`);
    let handlers = chains.get(event);
    if (!handlers) {
      handlers = [];
      chains.set(event, handlers);
      (on as (event: string, handler: Handler) => void)(event, runAll(event, handlers));
    }
    handlers.push(handler);
  };
  return chained as Cypress.PluginEvents;
}

function runAll(event: string, handlers: Handler[]): Handler {
  if (event === 'before:browser:launch') {
    return async (browser, launchOptions) => {
      // As Cypress takes it: the options returned, or those the handler changed in place
      await eachOf(handlers, async (handler) => Object.assign(launchOptions as object, await handler(browser, launchOptions)));
      return launchOptions;
    };
  }
  if (event === 'after:screenshot') {
    return async (details) => {
      let changed = {};
      await eachOf(handlers, async (handler) => {
        changed = { ...changed, ...((await handler({ ...(details as object), ...changed })) as object) };
      });
      return changed;
    };
  }
  return (...args) => eachOf(handlers, (handler) => handler(...args));
}

// Runs every handler, in order, then throws the first failure, if any
async function eachOf(handlers: Handler[], run: (handler: Handler) => unknown): Promise<void> {
  const failures: unknown[] = [];
  for (const handler of handlers) {
    try {
      await run(handler);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw failures[0];
}
