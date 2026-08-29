import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  createDotnetModuleSpecifierPolicy,
  createDotnetReflectionTypeDataProvider,
  csharpDotnetProviderContributionKind,
} from "../../../dist/public/provider-dotnet.js";
import {
  assertCsharpCompilationSucceeded,
  compileCsharpSource,
} from "../../helpers/direct-csharp-session.mjs";
import {
  buildUnsupportedMemberFixture,
  getCompleteDotnetModule,
} from "../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const packageName = "@fixture/advanced-native";
const moduleSpecifier = `${packageName}/ProviderUnsupportedMemberFixtures.js`;

test("advanced .NET API contracts close through provider selection and C# syntax", () => {
  const assembly = buildUnsupportedMemberFixture();
  const provider = createDotnetReflectionTypeDataProvider({
    references: [assembly],
    disablePersistentCache: true,
  });
  const module = getCompleteDotnetModule(
    provider,
    "@tsonic/dotnet/ProviderUnsupportedMemberFixtures.js",
    {},
  );
  assert.equal("exports" in module, true);
  const staticInterface = requireType(module, "IStaticInterfaceMember");
  const genericHolder = requireType(module, "GenericHolder");
  const createAdapter = requireFunction(module, staticInterface.targetId, "Create");
  const countAdapter = requireFunction(module, staticInterface.targetId, "StaticCount");
  const echoAdapter = requireFunction(module, genericHolder.targetId, "Echo");
  const valueAdapter = requireFunction(module, genericHolder.targetId, "StaticValue");

  const compiled = compileCsharpSource({
    capabilities: [fixtureCapability(dirname(assembly))],
    sourceText: `
      import {
        ByRefReturnSignatures,
        EventSignatures,
        FunctionPointerSignatures,
        GenericNumber,
        MultiIndexer,
        PointerDelegate,
        PointerSignatures,
        RankedArraySignatures,
        RefReturnDelegate,
        StaticInterfaceImplementation,
        ${createAdapter.sourceName},
        ${countAdapter.sourceName},
        ${echoAdapter.sourceName},
        ${valueAdapter.sourceName},
      } from "${moduleSpecifier}";
      import {
        loadPointer,
        storePointer,
        unsafeContext,
      } from "@tsonic/core/lang.js";
      import type { int32 } from "@tsonic/core/types.js";
      import type { ptr } from "@tsonic/csharp/lang.js";

      export function ranked(value: RankedArraySignatures): number {
        const matrix = value.MatrixReturn();
        matrix.set(0, 1, 42);
        value.AcceptMatrix(matrix);
        return matrix.get(0, 1);
      }

      export function indexer(value: MultiIndexer): number {
        return value.get(2, 3);
      }

      export function references(value: ByRefReturnSignatures): number {
        const slot = value.ValueRef();
        storePointer(slot, 9);
        return loadPointer(value.ReadonlyValueRef());
      }

      export function functionPointers(value: FunctionPointerSignatures): void {
        value.Echo(value.CallbackProperty);
      }

      export function nativePointers(value: PointerSignatures): number {
        unsafeContext();
        const pointer = value.PointerReturn();
        return value.ReadPointer(pointer);
      }

      export function pointerDelegate(
        callback: PointerDelegate,
        pointer: ptr<int32>,
      ): number {
        unsafeContext();
        return callback(pointer);
      }

      export function refReturnDelegate(callback: RefReturnDelegate): number {
        const slot = callback();
        storePointer(slot, 11);
        return loadPointer(slot);
      }

      export function events(value: EventSignatures, callback: (value: number) => void): void {
        value.addChanged(callback);
        value.removeChanged(callback);
      }

      export function operators(left: GenericNumber<int32>, right: GenericNumber<int32>): GenericNumber<int32> {
        return left.operatorAdd(right);
      }

      export function staticMembers(value: int32): int32 {
        const created = ${createAdapter.sourceName}<StaticInterfaceImplementation>();
        const count = ${countAdapter.sourceName}<StaticInterfaceImplementation>();
        const echoed = ${echoAdapter.sourceName}<int32>(value);
        const stored = ${valueAdapter.sourceName}<int32>();
        return created + count + echoed + stored;
      }
    `,
  });

  assertCsharpCompilationSucceeded(compiled);
  const output = compiled.artifacts.get("src/Index.cs") ?? "";
  assert.match(output, /matrix\[0, 1\] = 42/);
  assert.match(output, /return matrix\[0, 1\]/);
  assert.match(output, /return value\[2, 3\]/);
  assert.match(output, /ref int slot = ref value\.ValueRef\(\)/);
  assert.match(output, /slot = 9/);
  assert.match(output, /value\.Changed \+= \(int __tsonic_arg0\) => callback\(__tsonic_arg0\)/);
  assert.match(output, /value\.Changed -= \(int __tsonic_arg0\) => callback\(__tsonic_arg0\)/);
  assert.match(output, /events\([^)]*Action<double> callback\)/);
  assert.match(output, /return left \+ right/);
  assert.match(output, /StaticInterfaceImplementation\.Create\(\)/);
  assert.match(output, /StaticInterfaceImplementation\.StaticCount/);
  assert.match(output, /GenericHolder<int>\.Echo\(value\)/);
  assert.match(output, /GenericHolder<int>\.StaticValue/);
  assert.match(output, /value\.Echo\(value\.CallbackProperty\)/);
  assert.match(output, /int\* pointer = value\.PointerReturn\(\)/);
  assert.match(output, /return value\.ReadPointer\(pointer\)/);
  assert.match(output, /return callback\(pointer\)/);
  assert.match(output, /ref int slot = ref callback\(\)/);
  assert.match(output, /slot = 11/);
  assert.match(output, /return slot/);
});

function fixtureCapability(referenceDirectory) {
  const moduleSpecifierPolicy = createDotnetModuleSpecifierPolicy(packageName);
  return {
    kind: "target-capability",
    id: packageName,
    targetId: "csharp",
    displayName: "Advanced native fixture",
    moduleOwnership: [{ specifierPrefix: moduleSpecifierPolicy.modulePrefix }],
    createTargetContributions() {
      return [{
        kind: csharpDotnetProviderContributionKind,
        providerIdentity: {
          id: "fixture.advanced-native.provider",
          version: "1.0.0",
          target: "csharp",
          displayName: "Advanced native fixture provider",
        },
        moduleSpecifierPolicy,
        referenceDirectoryUrl: pathToFileURL(`${referenceDirectory}/`).href,
        assemblySourcePackages: [{
          assemblyName: "UnsupportedMembersProviderFixture",
          packageName,
        }],
        targetFramework: "net10.0",
      }];
    },
  };
}

function requireType(module, sourceName) {
  const matches = [...module.exports, ...(module.targetOnlyTypes ?? [])]
    .filter((declaration) =>
      declaration.kind === "type" && declaration.sourceName === sourceName);
  assert.equal(matches.length, 1, `Missing exact type '${sourceName}'.`);
  return matches[0];
}

function requireFunction(module, targetBindingId, targetName) {
  const matches = module.exports.filter((declaration) =>
    declaration.kind === "function" &&
    declaration.targetBindingId === targetBindingId &&
    declaration.targetName === targetName);
  assert.equal(matches.length, 1, `Missing exact function '${targetName}'.`);
  return matches[0];
}
