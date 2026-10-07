// What a transaction's confirmation lets the test change before it is
// confirmed: the spending cap of an ERC-20 approval, and the network fee, in
// MetaMask's fee editor.

import type { Page } from 'puppeteer-core';
import { waitFor, waitForGone, waitUntil, fill, failure, textOf, type Selector } from './page-helpers';
import { selectors } from './metamask-selectors';
import { dismissModal, press, pressWhenEnabled } from './metamask-overlays';
import type { CustomGas, GasEstimate, TransactionOptions } from './types';

// The estimates of the fee editor, by the name MetaMask shows: its test id and its English label
const gasEstimates: Record<GasEstimate, [key: string, label: string]> = {
  low: ['low', 'Low'],
  market: ['medium', 'Market'],
  aggressive: ['high', 'Aggressive'],
  networkSuggested: ['gasPrice', 'Network suggested'],
};
// The fields of the fee editor's advanced form, by the name MetaMask labels them with
const gasFields: Record<keyof CustomGas, string> = { maxBaseFee: 'max-base-fee-input', priorityFee: 'priority-fee-input', gasLimit: 'gas-input' };

/**
 * Set what the test asked of a transaction before it is confirmed. The cap
 * goes first: saving it makes MetaMask estimate the gas limit again.
 */
export async function adjustTransaction(page: Page, options: TransactionOptions): Promise<void> {
  const { spendingCap, gas, ...unknown } = options;
  const [stray] = Object.keys(unknown);
  if (stray) throw new Error(`[dappress] confirmTransaction takes spendingCap and gas, not "${stray}"`);
  const cap = spendingCap === undefined ? undefined : amount(spendingCap, 'spendingCap');
  const fee = gas === undefined ? undefined : gasChoice(gas);
  await dismissModal(page);
  if (cap !== undefined) await setSpendingCap(page, cap);
  if (fee !== undefined) await setGas(page, fee);
}

// An amount as a user types it, "5" or "2.5", from a number or a string
function amount(value: unknown, name: string): string {
  const text = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`[dappress] ${name} is an amount such as 5 or '2.5', not ${JSON.stringify(value)}`);
  return text;
}

/** The fields of the advanced form to fill, as the amounts to type. */
type GasValues = Partial<Record<keyof CustomGas, string>>;

// The estimate to pick, or the fields of the advanced form to fill with what
function gasChoice(gas: GasEstimate | CustomGas): GasEstimate | GasValues {
  if (typeof gas === 'string') {
    if (!gasEstimates[gas]) throw new Error(`[dappress] gas is ${Object.keys(gasEstimates).join(', ')} or custom values, not "${gas}"`);
    return gas;
  }
  const fields = Object.keys(gas || {}) as (keyof CustomGas)[];
  const [stray] = fields.filter((field) => !gasFields[field]);
  if (stray || !fields.length) throw new Error(`[dappress] Custom gas takes ${Object.keys(gasFields).join(', ')}, not ${stray ? `"${stray}"` : 'nothing'}`);
  return Object.fromEntries(fields.map((field) => [field, amount(gas[field], `gas.${field}`)]));
}

/**
 * Set the amount an ERC-20 approval lets the spender use, in tokens, from the
 * pencil of its "Spending cap" row. The row shows once MetaMask has read the
 * token, and only an ERC-20 approval has one.
 */
async function setSpendingCap(page: Page, cap: string): Promise<void> {
  const s = selectors.transaction;
  await waitFor(page, s.editSpendingCap).catch(async () => {
    throw await failure(page, 'MetaMask shows no spending cap to edit: spendingCap is for an ERC-20 approval');
  });
  const shown = await textOf(page, s.spendingCap);
  await press(page, s.editSpendingCap);
  // The field starts with the cap the dapp asked for
  const asked = await valueOf(page, s.spendingCapInput);
  await type(page, s.spendingCapInput, cap, 'spending cap');
  await pressWhenEnabled(page, s.spendingCapSave);
  await waitForGone(page, s.spendingCapInput);
  // The modal closes before the confirmation has the new cap, and confirming
  // meanwhile approves the old one: the row is waited for to show another cap
  if (Number(asked) !== Number(cap))
    await waitUntil(page, 'the spending cap row to show the new cap', async () => (await textOf(page, s.spendingCap)) !== shown);
}

/**
 * Set the network fee in the fee editor, opened from the pencil of the
 * "Network fee" row: one of its estimates, or the values of its advanced form.
 */
async function setGas(page: Page, gas: GasEstimate | GasValues): Promise<void> {
  const s = selectors.transaction;
  await waitFor(page, s.editGas).catch(async () => {
    throw await failure(page, 'MetaMask shows no network fee to edit on this confirmation');
  });
  const shown = await textOf(page, s.feeSection);
  await press(page, s.editGas);
  await waitFor(page, s.gasEstimates);
  const feeChanged = typeof gas === 'string' ? await pickGasEstimate(page, gas) : await fillGasForm(page, gas);
  // The editor closes before the confirmation carries the new fee, and
  // confirming meanwhile sends MetaMask the old one, which it keeps: the
  // section is waited for to show it. A fee set as it already was changes
  // nothing, and a gas limit shows nowhere: MetaMask has it once the form is saved.
  if (feeChanged) await waitUntil(page, 'the network fee section to show the new fee', async () => (await textOf(page, s.feeSection)) !== shown);
  if (typeof gas !== 'string' && gas.gasLimit !== undefined) await waitForGasLimit(page, gas.gasLimit);
}

/**
 * A gas limit shows nowhere on the confirmation, and confirming before
 * MetaMask holds it sends the one it had. The fee editor's form opens with
 * the limit the transaction has: it is read there, and the form left with
 * "Cancel", until it shows the limit set.
 */
async function waitForGasLimit(page: Page, limit: string): Promise<void> {
  const s = selectors.transaction;
  await waitUntil(page, `MetaMask to hold a gas limit of ${limit}`, async () => {
    await press(page, s.editGas);
    await press(page, s.gasOption('advanced', 'Advanced'));
    const held = await valueOf(page, s.gasField(gasFields.gasLimit));
    await press(page, s.gasCancel);
    // "Cancel" goes back to the list of estimates, which Escape closes
    await waitFor(page, s.gasEstimates);
    await page.keyboard.press('Escape');
    await waitForGone(page, [s.gasForm, s.gasEstimates]);
    return Number(held) === Number(limit);
  });
}

// Picking an estimate closes the editor. MetaMask lists the estimates it has
// for the network: Low, Market and Aggressive where it has fee estimates,
// "Network suggested" where it only has a gas price, as on a local node.
// Yields whether the transaction had another estimate before.
async function pickGasEstimate(page: Page, name: GasEstimate): Promise<boolean> {
  const s = selectors.transaction;
  const option = s.gasOption(...gasEstimates[name]);
  const element = await waitFor(page, option).catch(async () => {
    throw await failure(page, `MetaMask offers no "${name}" fee for this transaction`);
  });
  // The estimate the transaction has is marked by a class on its row
  const selected = await element.evaluate((el) => el.className.includes('--selected'));
  await press(page, option);
  await waitForGone(page, s.gasEstimates);
  return !selected;
}

// Yields whether a fee is given another value than it had: the gas limit does not count, the section showing no trace of it
async function fillGasForm(page: Page, values: GasValues): Promise<boolean> {
  const s = selectors.transaction;
  // "Advanced", in the list of estimates, replaces the list with the form. A
  // transaction with a gas price gets another form, which has none of these fields.
  await press(page, s.gasOption('advanced', 'Advanced'));
  await waitFor(page, s.gasForm).catch(async () => {
    throw await failure(page, 'MetaMask did not open the advanced fee form of an EIP-1559 transaction');
  });
  const asked = (Object.keys(gasFields) as (keyof CustomGas)[]).filter((field) => values[field] !== undefined);
  let changed = false;
  for (const field of asked.filter((name) => name !== 'gasLimit')) {
    if (Number(await valueOf(page, s.gasField(gasFields[field]))) !== Number(values[field])) changed = true;
  }
  // The form checks each fee against the other as it stood, and keeps the old
  // value of a fee it refused: the max base fee is typed again once the
  // priority fee is in, for two fees that both move below or above the old ones.
  const fields = values.maxBaseFee !== undefined && values.priorityFee !== undefined ? [...asked, 'maxBaseFee' as const] : asked;
  for (const field of fields) await type(page, s.gasField(gasFields[field]), values[field]!, field);
  // "Save" stays disabled on a value the form refuses, and the error quotes what the form says of it
  await pressWhenEnabled(page, s.gasSave);
  await waitForGone(page, s.gasForm);
  return changed;
}

// Type into a field, and check it holds what was typed
async function type(page: Page, selector: Selector, text: string, what: string): Promise<void> {
  await fill(page, selector, text);
  const held = await valueOf(page, selector);
  if (Number(held) !== Number(text)) throw await failure(page, `MetaMask's field for the ${what} holds "${held}", not "${text}"`);
}

async function valueOf(page: Page, selector: Selector): Promise<string> {
  const field = await waitFor(page, selector);
  return field.evaluate((el) => (el as HTMLInputElement).value);
}
