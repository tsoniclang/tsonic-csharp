import assert from "node:assert/strict";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  join,
  resolve,
} from "node:path";
import test from "node:test";
import {
  fileURLToPath,
} from "node:url";

import {
  createDotnetProviderTelemetry,
  validateDotnetModuleModelContract,
} from "../../../../dist/providers/dotnet/index.js";
import {
  createDotnetReflectionTypeDataProvider,
  dotnetReflectionProviderStorage,
} from "../../../helpers/dotnet-reflection-provider.mjs";
import { getCompleteDotnetModule } from "../../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

test(".NET reflection cache contract failures regenerate instead of becoming sticky diagnostics", () => {
  const cacheRoot = join(
    repoRoot,
    ".temp/provider-cache/dotnet-reflection-invalid-recovery",
    `${Date.now()}-${process.pid}`,
  );
  const request = {
    requestedExports: ["Convert"],
  };
  const firstProvider = createDotnetReflectionTypeDataProvider({
    storage: dotnetReflectionProviderStorage({ cacheRoot }),
  });
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
    storage: dotnetReflectionProviderStorage({ cacheRoot }),
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

test(".NET reflection continues from authoritative tooling when persistent cache storage is unavailable", () => {
  const fixtureRoot = join(
    repoRoot,
    ".temp/provider-cache/dotnet-reflection-unavailable",
    `${Date.now()}-${process.pid}`,
  );
  const cacheRoot = join(fixtureRoot, "not-a-directory");
  mkdirSync(fixtureRoot, { recursive: true });
  writeFileSync(cacheRoot, "occupied");
  const telemetry = createDotnetProviderTelemetry();
  const provider = createDotnetReflectionTypeDataProvider({
    storage: dotnetReflectionProviderStorage({ cacheRoot }),
    telemetry,
  });

  const module = getCompleteDotnetModule(
    provider,
    "@tsonic/dotnet/System.js",
    { requestedExports: ["Convert"] },
  );

  assert.equal("exports" in module, true, JSON.stringify(module));
  assert.equal(
    module.exports.filter((declaration) => declaration.sourceName === "Convert").length,
    1,
  );
  assert.equal(telemetry.snapshot().diskCacheFailures, 1);
  assert.equal(telemetry.snapshot().diskCacheDisables, 1);
  assert.equal(telemetry.snapshot().toolInvocations, 2);
});
