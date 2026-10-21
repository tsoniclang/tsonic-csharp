import assert from "node:assert/strict";
import test from "node:test";
import { nativeRefLikeFixture, nativeRefLikeProject } from "../../../helpers/native-ref-like-fixture.mjs";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";
import { createDotnetReflectionTypeDataProvider } from "../../../helpers/dotnet-reflection-provider.mjs";
import { completeDotnetProviderContext,
  validateDotnetModuleModelContract } from "../../../../dist/public/provider-dotnet.js";
import { dotnetExportToTargetBinding } from "../../../../dist/providers/native/projection/binding-projection.js";
import { csharpDelegateTargetType, csharpTaskTargetType } from "../../../../dist/target-model/types/carriers/delegates.js";
import { csharpNullableValueTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { csharpEnumerableTargetType, csharpReadOnlyListTargetType,
  csharpListTargetType } from "../../../../dist/target-model/types/carriers/collections.js";
import { csharpAsyncEnumerableTargetType } from "../../../../dist/target-model/types/carriers/generators.js";
import { csharpSourcePrimitiveTargetType, csharpVoidTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";

function requireModule(provider, specifier, requestedExports) {
  const result = provider.getModule(specifier, completeDotnetProviderContext({ requestedExports }));
  assert.equal("exports" in result, true, "the real native provider materializes the requested owner");
  assert.equal(validateDotnetModuleModelContract(result), undefined, "the complete native metadata satisfies its current contract");
  return result;
}

function requireType(module, metadataName) {
  const type = module.exports.find(value => value.kind === "type" && value.metadataName === metadataName);
  assert.equal(type !== undefined, true, `one actual native definition for ${metadataName}`);
  return type;
}

test("BCL carrier factories retain selected reflected generic-slot metadata", { timeout: 240_000 }, () => {
  const integer = csharpSourcePrimitiveTargetType("int32");
  const delegates = Array.from({ length: 17 }, (unusedValue, parameterCount) => {
    const parameters = Array.from({ length: parameterCount }, () => integer);
    return [csharpDelegateTargetType("System.Action", parameters),
      csharpDelegateTargetType("System.Func", parameters, integer)];
  }).flat();
  const modules = [
    ["@tsonic/dotnet/System.js", [...delegates, csharpNullableValueTargetType(integer)]],
    ["@tsonic/dotnet/System.Threading.Tasks.js", [csharpTaskTargetType(csharpVoidTargetType()),
      csharpTaskTargetType(integer)]],
    ["@tsonic/dotnet/System.Collections.Generic.js", [csharpEnumerableTargetType(integer),
      csharpReadOnlyListTargetType(integer), csharpListTargetType(integer), csharpAsyncEnumerableTargetType(integer)]],
  ];
  assert.equal(modules.reduce((count, entry) => count + entry[1].length, 0), 41,
    "every BCL factory arity and collection carrier participates in the native oracle");
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  for (const [specifier, carriers] of modules) {
    const module = provider.getModule(specifier, completeDotnetProviderContext({
      requestedMetadataNames: carriers.map(carrier => carrier.id),
    }));
    assert.equal("exports" in module, true, `${specifier}: the selected SDK supplies the native declarations`);
    assert.equal(validateDotnetModuleModelContract(module), undefined, `${specifier}: actual native metadata is complete`);
    for (const carrier of carriers) {
      const declaration = requireType(module, carrier.id);
      const parameters = declaration.typeParameters ?? [];
      const allowances = carrier.csharpAllowsRefLikeTypeArguments;
      assert.equal(typeof declaration.constraintRequiresReferenceType, "boolean",
        `${carrier.id}: the selected native declaration supplies its bound guarantee`);
      assert.equal(carrier.csharpConstraintRequiresReferenceType === true, declaration.constraintRequiresReferenceType,
        `${carrier.id}: the actual factory retains the selected SDK bound guarantee`);
      assert.equal(Array.isArray(allowances), true, `${carrier.id}: the factory publishes required slot metadata`);
      assert.equal(allowances.length, parameters.length, `${carrier.id}: factory and reflected arity agree`);
      assert.equal(carrier.typeArguments?.length ?? 0, parameters.length, `${carrier.id}: every actual generic argument has a slot`);
      assert.equal(declaration.allowsRefLikeTypeArguments.length, parameters.length,
        `${carrier.id}: native declaration and reflected parameter arity agree`);
      for (const [index, parameter] of parameters.entries()) {
        assert.equal(typeof parameter.allowsRefLike, "boolean", `${carrier.id}[${index}]: reflection supplies the actual permission`);
        assert.equal(allowances[index], parameter.allowsRefLike,
          `${carrier.id}[${index}]: the real factory retains the selected reflected permission`);
        assert.equal(declaration.allowsRefLikeTypeArguments[index], parameter.allowsRefLike,
          `${carrier.id}[${index}]: the native declaration retains its parameter attribute`);
      }
    }
  }
});

test("native reflection preserves BCL and named ref-like traits and actual generic anti-constraints", { timeout: 240_000 }, () => {
  const { assembly } = nativeRefLikeFixture();
  const provider = createDotnetReflectionTypeDataProvider({ references: [assembly], disablePersistentCache: true });
  const system = requireModule(provider, "@tsonic/dotnet/System.js", ["Span"]);
  const tasks = requireModule(provider, "@tsonic/dotnet/System.Threading.Tasks.js", ["Task", "ValueTask"]);
  const native = requireModule(provider, "@tsonic/dotnet/RefLikeProof.js", ["Lease", "Envelope", "Box", "Methods"]);
  for (const [module, name, byRefLike, allowed] of [
    [system, "System.Span`1", true, false],
    [tasks, "System.Threading.Tasks.Task`1", false, false],
    [tasks, "System.Threading.Tasks.ValueTask`1", false, false],
    [native, "RefLikeProof.Envelope`1", true, true],
    [native, "RefLikeProof.Box`1", false, false],
  ]) {
    const declaration = requireType(module, name);
    assert.equal(declaration.isByRefLike, byRefLike, `${name} reads native Type.IsByRefLike`);
    assert.equal(declaration.allowsRefLikeTypeArguments.length, 1, `${name} has one actual native generic slot`);
    assert.equal(declaration.allowsRefLikeTypeArguments[0], allowed, `${name} reads the actual native allows-ref-struct flag`);
    const target = dotnetExportToTargetBinding(declaration).csharpType;
    assert.equal(target.csharpByRefLike === true, byRefLike, `${name} retains its native carrier trait`);
    assert.equal(target.csharpAllowsRefLikeTypeArguments[0], allowed, `${name} retains its native generic permission`);
  }
  const lease = requireType(native, "RefLikeProof.Lease");
  assert.equal(lease.isByRefLike, true, "a user-named native struct is not recognized through a Span spelling");
  const missing = { ...lease };
  delete missing.isByRefLike;
  assert.equal(validateDotnetModuleModelContract({ ...native, exports: [missing] }) !== undefined, true,
    "missing foreign native metadata is not a safe ordinary carrier");
  const omitted = { ...lease };
  delete omitted.allowsRefLikeTypeArguments;
  assert.equal(validateDotnetModuleModelContract({ ...native, exports: [omitted] }) !== undefined, true,
    "native generic permissions cannot be silently defaulted");
  const methods = requireType(native, "RefLikeProof.Methods");
  for (const [name, allowed] of [["Allowed", true], ["Ordinary", false]]) {
    const member = methods.members.find(value => value.targetName === name);
    assert.equal(member !== undefined, true, `${name}: the actual native generic method is acquired`);
    const parameter = member.signatures[0].typeParameters[0];
    assert.equal(parameter.allowsRefLike, allowed, `${name}: native method permission is not inferred from its name`);
    const invalid = { ...parameter };
    delete invalid.allowsRefLike;
    const invalidSignature = { ...member.signatures[0], typeParameters: [invalid] };
    const invalidMember = { ...member, signatures: [invalidSignature] };
    const invalidType = { ...methods, members: [invalidMember] };
    assert.equal(validateDotnetModuleModelContract({ ...native, exports: [invalidType] }) !== undefined, true,
      `${name}: absent native method-slot facts are rejected at the existing metadata boundary`);
    const malformed = { ...invalid, allowsRefLike: 1 };
    assert.equal(validateDotnetModuleModelContract({ ...native, exports: [{ ...invalidType,
      members: [{ ...invalidMember, signatures: [{ ...invalidSignature, typeParameters: [malformed] }] }],
    }] }) !== undefined, true, `${name}: malformed native method-slot facts are rejected`);
  }
});

for (const [name, sourceText, expected] of [
  ["Task result and async parameter", `
import type { int32 } from "@tsonic/core/types.js";
import type { Span } from "@tsonic/dotnet/System.js";
export async function keep(value: Span<int32>, pending: Promise<void>): Promise<Span<int32>> {
  await pending; return value;
}`, ["CSHARP_REFLIKE_ASYNC_PARAMETER", "CSHARP_REFLIKE_ASYNC_RESULT"]],
  ["a local live across suspension", `
import type { int32 } from "@tsonic/core/types.js";
import { Span } from "@tsonic/dotnet/System.js";
export async function keep(pending: Promise<void>): Promise<int32> {
  const values: int32[] = [7]; const view = new Span<int32>(values);
  await pending; return view.Length;
}`, ["CSHARP_REFLIKE_ACROSS_SUSPENSION"]],
]) {
  test(`C# rejects exactly the impossible native ref-like placement: ${name}`, () => {
    const compiled = compileCsharpSource({ sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "", "the source is checked, not syntactically refused");
    const codes = compiled.result.diagnostics.map(value => value.code).sort();
    assert.equal(JSON.stringify(codes), JSON.stringify([...expected].sort()), "the admission owns the exact native refusal");
    assert.equal(compiled.result.program === undefined && compiled.result.artifacts.length === 0, true,
      "an impossible native placement is refused before program publication");
  });
}

test("native Span use stays synchronous and pre-await-only locals stay admitted", { timeout: 240_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
import type { int32 } from "@tsonic/core/types.js";
import { Span } from "@tsonic/dotnet/System.js";
export function keep(value: Span<int32>): int32 { return value.Length; }
export async function run(pending: Promise<void>): Promise<boolean> {
  const values: int32[] = [7, 9]; let size: int32 = 0;
  { const view = new Span<int32>(values); size = keep(view); }
  await pending; return size === 2;
}` });
  executeCsharpConstruction(compiled, "native-ref-like-pre-await", true, false, [],
    "if (!await Tsonic.Generated.Index.run(System.Threading.Tasks.Task.CompletedTask)) throw new System.Exception(\"native ref-like pre-await\");");
});

test("a named native ref-like type and an allows-ref-struct generic stay natively valid", { timeout: 240_000 }, () => {
  const { capability } = nativeRefLikeFixture();
  const compiled = compileCsharpSource({ capabilities: [capability], sourceText: `
import { Lease, Envelope } from "@fixture/ref-like/RefLikeProof.js";
export function keep(value: Lease): boolean { return value.Value === 7; }
export function run(): boolean { return keep(new Lease(7)) && new Envelope<Lease>(9).Value === 9; }
` });
  executeCsharpConstruction(compiled, "named-ref-like-allowed-native-generic", false, false, [nativeRefLikeProject]);
});

test("a native generic without allows-ref-struct refuses the actual named ref-like argument", () => {
  const { capability } = nativeRefLikeFixture();
  const compiled = compileCsharpSource({ capabilities: [capability], sourceText: `
import { Lease, Box } from "@fixture/ref-like/RefLikeProof.js";
export function fail(): boolean { return new Box<Lease>().Value === 11; }
` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the actual native generic placement reaches its admission owner");
  assert.equal(compiled.result.diagnostics.length, 1, "one deciding owner rejects the actual generic construction");
  assert.equal(compiled.result.diagnostics[0].code, "CSHARP_REFLIKE_GENERIC_ARGUMENT", "the native anti-constraint is authoritative");
  assert.equal(compiled.result.program === undefined, true, "no invalid native generic is published");
});

for (const [name, sourceText, expected] of [
  ["named native async result and parameter", `
import type { Lease } from "@fixture/ref-like/RefLikeProof.js";
export async function keep(value: Lease, pending: Promise<void>): Promise<Lease> {
  await pending; return value;
}`, ["CSHARP_REFLIKE_ASYNC_PARAMETER", "CSHARP_REFLIKE_ASYNC_RESULT"]],
  ["named native callable capture", `
import type { int32 } from "@tsonic/core/types.js";
import type { Lease } from "@fixture/ref-like/RefLikeProof.js";
export function keep(value: Lease): () => int32 { return () => value.Value; }
`, ["CSHARP_REFLIKE_FRAME_CAPTURE"]],
  ["named native ordinary field", `
import type { Lease } from "@fixture/ref-like/RefLikeProof.js";
export class Holder { constructor(public readonly value: Lease) {} }
`, ["CSHARP_REFLIKE_FIELD"]],
  ["named native local function capture", `
import type { int32 } from "@tsonic/core/types.js";
import type { Lease } from "@fixture/ref-like/RefLikeProof.js";
export function keep(value: Lease): int32 {
  function read(): int32 { return value.Value; }
  return read();
}
`, ["CSHARP_REFLIKE_FRAME_CAPTURE"]],
  ["named native class environment capture", `
import type { int32 } from "@tsonic/core/types.js";
import type { Lease } from "@fixture/ref-like/RefLikeProof.js";
export function keep(value: Lease): int32 {
  class Captured { read(): int32 { return value.Value; } }
  return new Captured().read();
}
`, ["CSHARP_REFLIKE_FRAME_CAPTURE"]],
]) {
  test(`native ref-like admission does not depend on BCL spelling: ${name}`, () => {
    const { capability } = nativeRefLikeFixture();
    const compiled = compileCsharpSource({ capabilities: [capability], sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "", "the actual named native placement reaches target admission");
    const codes = compiled.result.diagnostics.map(value => value.code).sort();
    assert.equal(JSON.stringify(codes), JSON.stringify([...expected].sort()), "one native placement owner rejects exactly the impossible storage");
    assert.equal(compiled.result.program === undefined && compiled.result.artifacts.length === 0, true,
      "no ref-like value escapes into an impossible native representation");
  });
}

test("erased callable bodies do not impose native ref-like storage requirements", { timeout: 240_000 }, () => {
  const { capability } = nativeRefLikeFixture();
  const compiled = compileCsharpSource({ capabilities: [capability], sourceText: `
import type { int32 } from "@tsonic/core/types.js";
import { Lease } from "@fixture/ref-like/RefLikeProof.js";
export function run(): boolean {
  function unused(value: Lease): () => int32 { return () => value.Value; }
  (() => { const value = new Lease(7); return () => value.Value; });
  return true;
}
` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the erased bodies remain fully source-checked");
  assert.equal(compiled.result.diagnostics.length, 0, "actual native participation excludes their impossible storage");
  executeCsharpConstruction(compiled, "erased-native-ref-like-captures", false, false, [nativeRefLikeProject]);
});
