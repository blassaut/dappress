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
 * one before it returned, each after:screenshot handler the details.
 */
export function chainEvents(on: Cypress.PluginEvents): Cypress.PluginEvents {
  const chains = new Map<string, Handler[]>();
  const chained = (event: string, handler: Handler): void => {
    if (!CHAINED.has(event)) return (on as (event: string, handler: unknown) => void)(event, handler);
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
      for (const handler of handlers) Object.assign(launchOptions as object, await handler(browser, launchOptions));
      return launchOptions;
    };
  }
  if (event === 'after:screenshot') {
    return async (details) => {
      let changed = {};
      for (const handler of handlers) changed = { ...changed, ...((await handler({ ...(details as object), ...changed })) as object) };
      return changed;
    };
  }
  return async (...args) => {
    for (const handler of handlers) await handler(...args);
  };
}
