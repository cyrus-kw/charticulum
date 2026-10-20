// Sign in without an email code: makes a session for an existing account
// in the database from .env, and prints its secret (the value the session
// cookie holds). Pass it to scripts/browse.ts as APP_SESSION to drive the
// app signed in:
//
//   npx tsx scripts/new-session.ts preview@example.invalid
//
// Anyone with the printed secret is signed in as that account, so it's
// only good for a day. Use a throwaway account, not a real person's.
import { hashSecret, newSecret } from "../src/server/auth";
import { requireDatabase } from "../src/server/db";

// Read DATABASE_URL from .env (Next.js does this for the app itself, but
// a plain script has to ask).
process.loadEnvFile();

const email = process.argv[2];
if (!email) throw new Error("Give the account's email, e.g. npx tsx scripts/new-session.ts preview@example.invalid");

const { accounts } = requireDatabase();
const user = await accounts.findUserByEmail(email);
if (!user) throw new Error(`No account with the email ${email}`);

// Like a real sign-in (see checkCode in src/server/auth.ts), the database only
// keeps the secret's hash; the secret itself is printed once, here.
const secret = newSecret();
const ONE_DAY = 24 * 60 * 60 * 1000;
await accounts.createSession({ id: hashSecret(secret), userId: user.id, expiresAt: new Date(Date.now() + ONE_DAY) });
console.log(secret);
// The database connection would otherwise keep the script running.
process.exit(0);
