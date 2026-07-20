import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { LocalDatabaseGuard } from "../../../src/main/localdb/LocalDatabaseGuard.js";

test("LocalDatabaseGuard rejects import folders inside database root", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-guard-"));
  const dbRoot = path.join(tempRoot, "db");
  const nestedImport = path.join(dbRoot, "imports");

  await fs.mkdir(nestedImport, { recursive: true });

  const guard = new LocalDatabaseGuard();

  await assert.rejects(
    () => guard.assertImportSourceAllowed(dbRoot, nestedImport),
    /cannot be inside the local database directory/i
  );

  await fs.rm(tempRoot, { recursive: true, force: true });
});
