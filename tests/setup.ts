import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.test"), override: true, quiet: true });

if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "test-jwt-secret-min-32-characters-long-xxxxxx";
if (!process.env.NEXTAUTH_SECRET) process.env.NEXTAUTH_SECRET = "test-nextauth-secret-min-32-chars-xxxxxxxx";
if (!process.env.NEXTAUTH_URL) process.env.NEXTAUTH_URL = "http://localhost:3001";

if (process.env.DATABASE_URL && !/overra_test/i.test(process.env.DATABASE_URL)) {
  throw new Error(
    `Refusing to run tests against non-test database. DATABASE_URL must reference 'overra_test'. Got: ${process.env.DATABASE_URL.replace(/:[^@]+@/, ":***@")}`
  );
}
