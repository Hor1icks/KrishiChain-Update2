/**
 * DEMO BUILD — this file replaces the network layer.
 *
 * The real client (client/src/api/client.js) sends every request to the
 * Express API with fetch(). This one keeps the same two exports and the
 * same call signature, but answers from data recorded into
 * src/demo/fixtures/ instead. Nothing else in the app changes: all 27
 * pages still call api('/farmer/batches') exactly as before and cannot
 * tell the difference.
 *
 * That is possible because every page reaches the network through this one
 * function. It was the intended cut point, and it is why the decoupling is
 * one file rather than a rewrite.
 *
 * ---------------------------------------------------------------------
 * WHAT WORKS AND WHAT DOES NOT
 *
 * Reads (GET)  answered from the fixtures. Every page renders real data.
 * Writes       rejected with a readable message. This build is read-only
 *              by design: there is no database behind it to write to.
 *
 * Sign-in is the one exception — it has to work, so it is handled here
 * against the recorded user list.
 *
 * Every page already renders a thrown error in its own error banner
 * (see any page's `.catch((e) => setError(e.message))`), so a clicked
 * button explains itself instead of failing silently or crashing.
 *
 * ---------------------------------------------------------------------
 * The fixtures were captured from the live API by
 * KrishiChainV1/tools/record-fixtures.mjs, one pass per role. Recording
 * rather than hand-writing them matters: a single service aliases 60+
 * camelCase fields, and a fixture that gets one name wrong shows up as a
 * blank page rather than an error.
 */
import responses from '../demo/fixtures/responses.json';
import { USERS } from '../demo/fixtures/users.js';

const TOKEN_KEY = 'krishichain.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** Seeded accounts, all sharing one password. Shown on the sign-in page. */
export const DEMO_ACCOUNTS = [
  { role: 'FARMER', label: 'Farmer', email: 'abdul.karim@krishichain.bd', name: 'Abdul Karim' },
  { role: 'BUYER', label: 'Buyer', email: 'tanvir.hossain@krishichain.bd', name: 'Tanvir Hossain' },
  { role: 'STORAGE_MANAGER', label: 'Storage manager', email: 'ashraful.alam@krishichain.bd', name: 'Ashraful Alam' },
  { role: 'TRANSPORT_PERSONNEL', label: 'Transport', email: 'sohel.rana@krishichain.bd', name: 'Sohel Rana' },
  { role: 'ADMIN', label: 'Admin', email: 'farhana.yasmin@krishichain.bd', name: 'Farhana Yasmin' },
];

export const DEMO_PASSWORD = 'Demo@1234';

/** A token here only has to carry the role, so the fixture set can be picked. */
const TOKEN_PREFIX = 'demo.';
const roleFromToken = (token) =>
  token && token.startsWith(TOKEN_PREFIX) ? token.slice(TOKEN_PREFIX.length) : null;

/**
 * Enough delay for a loading state to be seen rather than flash. Real
 * requests to Oracle took roughly this long, so the pacing is honest.
 */
const LATENCY_MS = 180;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class DemoError extends Error {}

/**
 * Query strings are dropped before lookup, so a filtered list falls back
 * to the unfiltered one. Filters therefore do not narrow anything in this
 * build; the page still renders its full result set rather than blanking.
 */
function normalise(path) {
  const [bare] = path.split('?');
  return bare.replace(/\/+$/, '') || '/';
}

function lookup(role, path) {
  const store = responses[role];
  if (!store) return undefined;
  return store[path];
}

function login(body) {
  const email = String(body?.email ?? '').trim().toLowerCase();
  const account = DEMO_ACCOUNTS.find((a) => a.email === email);

  if (!account) {
    throw new DemoError(
      'Unknown account in this demo build. Use one of the five buttons above the form.'
    );
  }
  if (body?.password !== DEMO_PASSWORD) {
    throw new DemoError(`Wrong password. Every demo account uses ${DEMO_PASSWORD}`);
  }
  const user = USERS[account.role];
  if (!user) throw new DemoError(`No recorded profile for ${account.role}.`);
  return { user, token: `${TOKEN_PREFIX}${account.role}` };
}

/**
 * Same signature as the real api(): api(path, { method, body, auth }).
 */
export async function api(path, { method = 'GET', body } = {}) {
  await wait(LATENCY_MS);

  const target = normalise(path);

  if (target === '/auth/login') return login(body);

  const role = roleFromToken(tokenStore.get());
  if (!role) throw new DemoError('Your session has ended. Please sign in again.');

  if (method !== 'GET') {
    throw new DemoError(
      'This is the front-end demo build, so actions are switched off — there is no '
      + 'database behind it to save to. The full build writes this straight to Oracle.'
    );
  }

  if (target === '/auth/me') {
    const user = USERS[role];
    if (!user) throw new DemoError('No recorded profile for this role.');
    return user;
  }

  const found = lookup(role, target);
  if (found !== undefined) return found;

  // A page asking for something never recorded. Say so loudly rather than
  // returning null, which pages would render as a permanent "Loading…".
  throw new DemoError(
    `No demo data recorded for ${method} ${target} as ${role}. `
    + 'Re-run KrishiChainV1/tools/record-fixtures.mjs against the live API.'
  );
}
