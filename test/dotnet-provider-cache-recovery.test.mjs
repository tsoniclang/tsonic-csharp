import assert from "node:assert/strict";
import {
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  join,
} from "node:path";
import test from "node:test";
import {
  fileURLToPath,
} from "node:url";

import {
  createDotnetProviderTelemetry,
  createDotnetReflectionTypeDataProvider,
  validateDotnetModuleModelContract,
} from "../dist/providers/dotnet/index.js";
import { getCompleteDotnetModule } from "./dotnet-provider.helpers.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test(".NET reflection cache contract failures regenerate instead of becoming sticky diagnostics", () => {
  const cacheRoot = join(
    repoRoot,
    ".temp/provider-cache/dotnet-reflection-invalid-recovery",
    `${Date.now()}-${process.pid}`,
  );
  const request = {
    requestedExports: ["Convert"],
  };
  const firstProvider = createDotnetReflectionTypeDataProvider({ cacheRoot });
  const first = getCompleteDotnetModule(firstProvider,
    "@tsonic/dotnet/System.js",
    request,
  );
  assert.equal("exports" in first, true, JSON.stringify(first));

  const records = readdirSync(cacheRoot)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => ({
      fileName,
      record: JSON.parse(readFileSync(join(cacheRoot, fileName), "utf8")),
    }));
  const selected = records.find(({ record }) =>
    record.request.moduleSpecifier === "@tsonic/dotnet/System.js" &&
    JSON.stringify(record.request.requestedExports) === JSON.stringify(["Convert"])
  );
  assert.ok(selected);
  selected.record.model.namespaceName = "";
  assert.notEqual(
    validateDotnetModuleModelContract(selected.record.model),
    undefined,
  );
  writeFileSync(
    join(cacheRoot, selected.fileName),
    JSON.stringify(selected.record),
  );

  const telemetry = createDotnetProviderTelemetry();
  const recoveredProvider = createDotnetReflectionTypeDataProvider({
    cacheRoot,
    telemetry,
  });
  const recovered = getCompleteDotnetModule(recoveredProvider,
    "@tsonic/dotnet/System.js",
    request,
  );
  assert.equal("exports" in recovered, true, JSON.stringify(recovered));
  assert.equal(
    recovered.exports.some((declaration) =>
      declaration.sourceName === "Convert"
    ),
    true,
  );
  assert.equal(recoveredProvider.getTelemetrySnapshot().toolInvocations, 1);

  const repaired = JSON.parse(
    readFileSync(join(cacheRoot, selected.fileName), "utf8"),
  );
  assert.equal(repaired.model.namespaceName, "System");
  assert.equal(validateDotnetModuleModelContract(repaired.model), undefined);
});
