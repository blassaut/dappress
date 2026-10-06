// What a transaction's confirmation lets the test change before it is
// confirmed: the spending cap of an ERC-20 approval, and the network fee, in
// MetaMask's fee editor.

import type { Page } from 'puppeteer-core';
import { waitFor, isVisible, isGone, click, clickWhenEnabled, fill, failure, textOf, waitForTextChange, type Selector } from './page-helpers';
import { selectors } from './metamask-selectors';
import { dismissModal } from './metamask-modal';
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
  if (!(await isVisible(page, s.editSpendingCap, 10000)))
    throw await failure(page, 'MetaMask shows no spending cap to edit: spendingCap is for an ERC-20 approval');
  const shown = await textOf(page, s.spendingCap);
  const asked = await openSpendingCap(page);
  await type(page, s.spendingCapInput, cap, 'spending cap');
  if (!(await pressToClose(page, s.spendingCapSave, s.spendingCapInput))) throw await failure(page, `MetaMask did not save the spending cap of ${cap}`);
  // The modal closes before the confirmation has the new cap, and confirming
  // meanwhile approves the old one. Two caps may read the same once MetaMask
  // has rounded them, so a row that stays as it was is not a failure.
  await waitForTextChange(page, s.spendingCap, shown, Number(asked) === Number(cap) ? 0 : 5000);
}

/** Open the spending cap's modal. Yields the cap the dapp asked for, which its field starts with. */
async function openSpendingCap(page: Page): Promise<string> {
  const s = selectors.transaction;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await isVisible(page, s.spendingCapInput, 500))) await click(page, s.editSpendingCap);
    if (await isVisible(page, s.spendingCapInput, 5000)) return valueOf(page, s.spendingCapInput);
  }
  throw await failure(page, 'MetaMask did not open the spending cap');
}

/**
 * Set the network fee in the fee editor, opened from the pencil of the
 * "Network fee" row: one of its estimates, or the values of its advanced form.
 */
async function setGas(page: Page, gas: GasEstimate | GasValues): Promise<void> {
  const s = selectors.transaction;
  if (!(await isVisible(page, s.editGas, 10000))) throw await failure(page, 'MetaMask shows no network fee to edit on this confirmation');
  const shown = await textOf(page, s.feeSection);
  await openFeeEditor(page);
  const changed = typeof gas === 'string' ? await pickGasEstimate(page, gas) : await fillGasForm(page, gas);
  // The editor closes before the confirmation carries the new fee, and
  // confirming meanwhile sends MetaMask the old one, which it keeps: the row
  // is waited for to change. A fee set as it already was changes nothing.
  if (changed) await waitForTextChange(page, s.feeSection, shown, 5000);
}

async function openFeeEditor(page: Page): Promise<void> {
  const s = selectors.transaction;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await isVisible(page, s.gasEstimates, 500))) await click(page, s.editGas);
    if (await isVisible(page, s.gasEstimates, 5000)) return;
  }
  throw await failure(page, 'MetaMask did not open its fee editor');
}

// Picking an estimate closes the editor. MetaMask lists the estimates it has
// for the network: Low, Market and Aggressive where it has fee estimates,
// "Network suggested" where it only has a gas price, as on a local node.
// Yields whether the transaction had another estimate before.
async function pickGasEstimate(page: Page, name: GasEstimate): Promise<boolean> {
  const s = selectors.transaction;
  const option = s.gasOption(...gasEstimates[name]);
  if (!(await isVisible(page, option, 5000))) throw await failure(page, `MetaMask offers no "${name}" fee for this transaction`);
  const selected = await hasEstimate(page, option);
  for (let attempt = 0; attempt < 3; attempt++) {
    await click(page, option);
    if (await isGone(page, s.gasEstimates, 10000)) return !selected;
  }
  throw await failure(page, `MetaMask did not take the "${name}" fee`);
}

// The estimate the transaction has is marked by a class on its row
async function hasEstimate(page: Page, option: Selector): Promise<boolean> {
  const element = await waitFor(page, option);
  return element.evaluate((el) => el.className.includes('--selected')).catch(() => false);
}

// Yields whether a field is given another value than it had
async function fillGasForm(page: Page, values: GasValues): Promise<boolean> {
  const s = selectors.transaction;
  await openGasForm(page);
  const asked = (Object.keys(gasFields) as (keyof CustomGas)[]).filter((field) => values[field] !== undefined);
  let changed = false;
  for (const field of asked) {
    if (Number(await valueOf(page, s.gasField(gasFields[field]))) !== Number(values[field])) changed = true;
  }
  // The form checks each fee against the other as it stood, and keeps the old
  // value of a fee it refused: the max base fee is typed again once the
  // priority fee is in, for two fees that both move below or above the old ones.
  const fields = values.maxBaseFee !== undefined && values.priorityFee !== undefined ? [...asked, 'maxBaseFee' as const] : asked;
  for (const field of fields) await type(page, s.gasField(gasFields[field]), values[field]!, field);
  // "Save" stays disabled on a value the form refuses, and the error quotes what the form says of it
  if (!(await pressToClose(page, s.gasSave, s.gasForm))) throw await failure(page, 'MetaMask did not save the network fee');
  return changed;
}

// "Advanced", in the list of estimates, replaces the list with the form. A
// transaction with a gas price gets another form, which has none of these fields.
async function openGasForm(page: Page): Promise<void> {
  const s = selectors.transaction;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await isVisible(page, s.gasForm, 500))) await click(page, s.gasOption('advanced', 'Advanced'));
    if (await isVisible(page, s.gasForm, 5000)) return;
  }
  throw await failure(page, 'MetaMask did not open the advanced fee form of an EIP-1559 transaction');
}

// Type into a field and read it back: keys pressed while MetaMask re-renders are lost
async function type(page: Page, selector: Selector, text: string, what: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await fill(page, selector, text);
    if (Number(await valueOf(page, selector)) === Number(text)) return;
  }
  throw await failure(page, `MetaMask's field for the ${what} did not take "${text}"`);
}

// Press the button that saves a modal until the modal closes: a lost click leaves it open
async function pressToClose(page: Page, button: Selector, content: Selector): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await clickWhenEnabled(page, button);
    if (await isGone(page, content, 10000)) return true;
  }
  return false;
}

async function valueOf(page: Page, selector: Selector): Promise<string> {
  const field = await waitFor(page, selector);
  return field.evaluate((el) => (el as HTMLInputElement).value);
}
