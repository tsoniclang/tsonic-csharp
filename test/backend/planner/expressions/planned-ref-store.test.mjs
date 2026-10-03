import assert from "node:assert/strict";
import test from "node:test";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { csharpDotnetProviderContributionKind, createDotnetModuleSpecifierPolicy } from "../../../../dist/public/provider-dotnet.js";
import { buildUnsupportedMemberFixture } from "../../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";

test("typed native ref store retains the selected cell before the later value effects", { timeout: 300_000 }, () => {
  const assembly = buildUnsupportedMemberFixture();
  const packageName = "@fixture/advanced-native";
  const moduleSpecifierPolicy = createDotnetModuleSpecifierPolicy(packageName);
  const capabilities = [{
      kind: "target-capability", id: packageName, targetId: "csharp", displayName: "Native reference store proof",
      moduleOwnership: [{ specifierPrefix: moduleSpecifierPolicy.modulePrefix }],
      createTargetContributions: () => [{
        kind: csharpDotnetProviderContributionKind,
        providerIdentity: { id: "fixture.native-reference-store", version: "1.0.0", target: "csharp", displayName: "Native reference store proof" },
        moduleSpecifierPolicy, referenceDirectoryUrl: pathToFileURL(`${dirname(assembly)}/`).href,
        assemblySourcePackages: [{ assemblyName: "UnsupportedMembersProviderFixture", packageName }], targetFramework: "net10.0",
      }],
    }];
  const compiled = compileCsharpSource({
    capabilities,
    sourceText: `
      import { ByRefReturnSignatures } from "@fixture/advanced-native/ProviderUnsupportedMemberFixtures.js";
      import { storeptr } from "@tsonic/core/lang.js";
      import type { int32 } from "@tsonic/core/types.js";
      export function apply(owner: () => ByRefReturnSignatures, effect: () => void): void {
        storeptr(owner().ValueRef(), (effect(), 9 as int32));
      }
    `,
  });
  assertCsharpCompilationSucceeded(compiled);
  const emitted = [...compiled.artifacts.values()].join("\n");
  assert.match(emitted, /ref int .* = ref owner\(\)\.ValueRef\(\)/u);
  assert.doesNotMatch(emitted, /Task\.Run|ContinueWith|DynamicInvoke/u);
  const project = fileURLToPath(new URL("../../../fixtures/dotnet-provider/unsupported-members/UnsupportedMembersProviderFixture.csproj", import.meta.url));
  executeCsharpConstruction(compiled, "planned-native-ref-store", false, false, [project], `
    var original = new ProviderUnsupportedMemberFixtures.ByRefReturnSignatures();
    var replacement = new ProviderUnsupportedMemberFixtures.ByRefReturnSignatures();
    var current = original;
    var calls = "";
    Tsonic.Generated.Index.apply(() => { calls += "O"; return current; }, () => {
      calls += "E"; original.ValueRef() = 50; current = replacement;
    });
    if (calls != "OE" || original.ValueRef() != 9 || replacement.ValueRef() != 0)
      throw new System.Exception("native ref store replayed owner or lost physical cell identity");
  `);
  const readonly = compileCsharpSource({ capabilities, sourceText: `
    import { ByRefReturnSignatures } from "@fixture/advanced-native/ProviderUnsupportedMemberFixtures.js";
    import { storeptr } from "@tsonic/core/lang.js";
    export function rejected(owner: ByRefReturnSignatures): void { storeptr(owner.ReadonlyValueRef(), 9); }
  ` });
  const diagnostics = readonly.sourceDiagnosticsText + readonly.extensionDiagnostics.map(diagnostic => diagnostic.message).join("\n")
    + readonly.targetDiagnostics.map(diagnostic => diagnostic.message).join("\n");
  assert.match(diagnostics, /readonly|read-only/u);
});
