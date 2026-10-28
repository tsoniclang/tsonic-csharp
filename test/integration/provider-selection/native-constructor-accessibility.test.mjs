import assert from "node:assert/strict";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { createDotnetModuleSpecifierPolicy, csharpDotnetProviderContributionKind } from "../../../dist/public/provider-dotnet.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { buildConstructorFixture } from "../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";

const packageName = "@fixture/constructor-access";
const moduleSpecifier = `${packageName}/ProviderConstructorFixtures.js`;
const fixtureProject = fileURLToPath(new URL("../../fixtures/dotnet-provider/constructors/ConstructorProviderFixture.csproj", import.meta.url));

function fixtureCapability(referenceDirectory) {
  const moduleSpecifierPolicy = createDotnetModuleSpecifierPolicy(packageName);
  return {
    kind: "target-capability",
    id: packageName,
    targetId: "csharp",
    displayName: "Native constructor accessibility fixture",
    moduleOwnership: [{ specifierPrefix: moduleSpecifierPolicy.modulePrefix }],
    createTargetContributions() {
      return [{
        kind: csharpDotnetProviderContributionKind,
        providerIdentity: {
          id: "fixture.constructor-access.provider",
          version: "1.0.0",
          target: "csharp",
          displayName: "Native constructor accessibility fixture provider",
        },
        moduleSpecifierPolicy,
        referenceDirectoryUrl: pathToFileURL(`${referenceDirectory}/`).href,
        assemblySourcePackages: [{ assemblyName: "ConstructorProviderFixture", packageName }],
        targetFramework: "net10.0",
      }];
    },
  };
}

test("native constructor overloads preserve direct and derived accessibility", { timeout: 300_000 }, () => {
  const reference = buildConstructorFixture();
  const compiled = compileCsharpSource({ capabilities: [fixtureCapability(dirname(reference))], sourceText: `
    import { MixedAccessibilityTarget, ProtectedOnlyTarget } from "${moduleSpecifier}";
    import type { int32 } from "@tsonic/core/types.js";
    class StringDerived extends MixedAccessibilityTarget {
      constructor() { super("abc"); }
    }
    class BooleanDerived extends MixedAccessibilityTarget {
      constructor() { super(true); }
    }
    class ProtectedDerived extends ProtectedOnlyTarget {
      constructor() { super(5 as int32); }
    }
    export function run(): boolean {
      const direct = new MixedAccessibilityTarget(7 as int32);
      return direct.Value === 7 && new StringDerived().Value === 3 &&
        new BooleanDerived().Value === 1 && new ProtectedDerived().Value === 5;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "native-constructor-accessibility", false, false, [fixtureProject]);
});

for (const [name, sourceText] of [
  ["protected-only", `
    import { ProtectedOnlyTarget } from "${moduleSpecifier}";
    import type { int32 } from "@tsonic/core/types.js";
    export function run(): ProtectedOnlyTarget { return new ProtectedOnlyTarget(1 as int32); }
  `],
  ["protected mixed overload", `
    import { MixedAccessibilityTarget } from "${moduleSpecifier}";
    export function run(): MixedAccessibilityTarget { return new MixedAccessibilityTarget("private"); }
  `],
]) {
  test(`native ${name} constructor cannot be called directly`, () => {
    const reference = buildConstructorFixture();
    const compiled = compileCsharpSource({ capabilities: [fixtureCapability(dirname(reference))], sourceText });
    assert.match(compiled.sourceDiagnosticsText, /TS2674.*protected/su, "the checked protected constructor is not public");
    assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.category === "error"), true,
      "direct construction is rejected");
    assert.equal(compiled.artifacts.size, 0, "rejected construction publishes no artifacts");
  });
}

for (const [name, sourceText] of [
  ["protected from a derived method", `
    import { ProtectedOnlyTarget } from "${moduleSpecifier}";
    import type { int32 } from "@tsonic/core/types.js";
    class Derived extends ProtectedOnlyTarget {
      constructor() { super(1 as int32); }
      make(): ProtectedOnlyTarget { return new ProtectedOnlyTarget(2 as int32); }
    }
    export function run(): Derived { return new Derived(); }
  `],
  ["abstract with a public constructor", `
    import { AbstractPublicTarget } from "${moduleSpecifier}";
    import type { int32 } from "@tsonic/core/types.js";
    export function run(): AbstractPublicTarget { return new AbstractPublicTarget(1 as int32); }
  `],
]) {
  test(`native ${name} cannot be constructed directly`, () => {
    const reference = buildConstructorFixture();
    const compiled = compileCsharpSource({ capabilities: [fixtureCapability(dirname(reference))], sourceText });
    assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.category === "error"), true,
      "the selected physical constructor is refused");
    assert.equal(compiled.targetDiagnostics.some(diagnostic =>
      diagnostic.message.includes("The selected native constructor is not accessible for direct construction.")), true,
    "the existing target admission reports the exact access decision");
    assert.equal(compiled.artifacts.size, 0, "rejected construction publishes no artifacts");
  });
}
