import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { sourceEnclosingCallable } from "@tsonic/target-api/source";
import { analyzeCsharpOptionalLocals } from "../../../dist/analysis/storage/optional-locals.js";
import { csharpOptionalStorageProjection } from "../../../dist/target-model/types/projections.js";
import { csharpRuntimeLocationTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";

const sourceText = `import type { int32 } from "@tsonic/core/types.js";
export function testPresence<Base extends object, Value extends Base>(fallback: Value, present: boolean): int32 {
  let selected: Value | undefined = undefined;
  if (present) selected = fallback;
  return selected === undefined ? 7 : 11;
}

export function copyValue<Base extends object, Value extends Base>(fallback: Value, present: boolean): Value {
  let original: Value | undefined = undefined;
  if (present) original = fallback;
  let copied: Value | undefined = original;
  original = undefined;
  return copied ?? fallback;
}
export function replaceValue<Base extends object, Value extends Base>(first: Value, second: Value): Value {
  let target: Value | undefined = first;
  target = undefined;
  target ??= second;
  return target!;
}
export function narrowValue<Base extends object, Value extends Base>(fallback: Value): Value {
  let narrowed: Value | undefined = undefined;
  narrowed = fallback;
  if (narrowed !== undefined) return narrowed;
  return fallback;
}
export function guardedValue<Base extends object, Value extends Base>(fallback: Value, present: boolean): Value {
  let absent: Value | undefined = undefined;
  if (present) absent = fallback;
  return absent!;
}
export function escapingValue<Base extends object, Value extends Base>(fallback: Value): Value | undefined {
  let escaped: Value | undefined = undefined;
  escaped = fallback;
  return escaped;
}
export function capturedValue<Base extends object, Value extends Base>(fallback: Value): () => Value | undefined {
  let captured: Value | undefined = undefined;
  captured = fallback;
  return () => captured;
}
function selectResult<Result, Argument>(argument: Argument, result: Result): Result { return result; }
export function publicArgument<Base extends object, Value extends Base>(fallback: Value): int32 {
  let privateResult: Value | undefined = undefined;
  privateResult = selectResult<Value, Value | undefined>(undefined, fallback);
  return privateResult === undefined ? 7 : 11;
}`;

test("selected native address and reference storage cannot be split by a narrowed payload or contextual type", () => {
  const declaration = Object.freeze({});
  const reference = Object.freeze({});
  const call = Object.freeze({});
  const payload = Object.freeze({ kind: "type-parameter", identity: "actual:payload", name: "Payload",
    csharpConstraints: Object.freeze({ kind: "resolved", constraints: Object.freeze([{ kind: "keyword", keyword: "notnull" }]) }) });
  const storage = csharpOptionalStorageProjection(payload);
  const location = Object.freeze({ kind: "direct-storage", expression: reference, valueType: payload,
    identity: Object.freeze({ kind: "local-storage", declaration }) });
  for (const kind of ["native-address", "nested-native-address", "byref-readwrite", "byref-readonly", "byref-writeonly-must-init", "borrow-shared", "borrow-mut", "move"]) {
    const nativeAddress = kind === "native-address" || kind === "nested-native-address";
    const selectedStorage = kind === "nested-native-address"
      ? Object.freeze({ kind: "value-property-storage", expression: reference, valueType: payload,
          memberIdentity: "native:member", receiverStorage: location }) : location;
    const plan = analyzeCsharpOptionalLocals({ ast: { is: {
      IsVariableDeclaration: node => node === declaration,
      IsParenthesizedExpression: () => false,
    } }, navigation: { referenceFor: node => node === reference ? { declaration } : undefined } }, {
      compileTimeMetadata: { get: () => false },
      sourceArgument: { get: node => node !== call || nativeAddress ? undefined
        : { kind: "resolved", argument: { storageExpression: reference, passingMode: kind } } },
      nodeTargetType: { get: () => payload }, contextualType: { get: () => ({ targetType: payload }) },
      storageTargetType: { get: () => storage },
    }, [call, declaration], {
      resolve() { assert.fail(`${kind}: an addressed declaration must be excluded before private names are allocated`); },
      temporaryName() { assert.fail(`${kind}: no split storage may be allocated`); },
    }, { typedLocation: { get: node => node !== call || !nativeAddress ? undefined
      : { kind: "location-address", call, pointeeType: payload, locationType: csharpRuntimeLocationTargetType(payload), storage: selectedStorage } } });
    assert.equal(plan.entries.length, 0, `${kind}: the existing exact location owner excludes every split operation`);
    assert.equal(plan.get(declaration) === undefined, true, `${kind}: the ordinary local storage remains authoritative`);
    assert.equal(plan.removesProjection(declaration, storage.identity), false, `${kind}: genuine storage projections are retained`);
  }
});

function localDeclarations(compiled) {
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, "the complete body-local plan is admitted before publication");
  const { ast } = program.source;
  const declarations = new Map();
  const visit = node => {
    if (ast.is.IsVariableDeclaration(node) && ast.name(node) !== undefined)
      declarations.set(ast.text(ast.name(node)), node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  csharpProgramSourceFiles(program).forEach(visit);
  return { program, declarations };
}

for (const surface of ["native", "js"]) {
  test(`body-local optional placement owns presence payload and uses before generic ABI harvesting (${surface})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "", "the authored bounded source remains checked");
    assert.equal(compiled.result.diagnostics.length, 0, compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | "));
    const { program, declarations } = localDeclarations(compiled);
    for (const name of ["selected", "original", "copied", "target", "narrowed", "absent"]) {
      const declaration = declarations.get(name);
      assert.equal(declaration !== undefined, true, `${name}: the original local declaration is retained`);
      const completion = program.records.localBinding.get(declaration);
      assert.equal(completion?.optionalLocal?.kind, "declaration", `${name}: one local placement owns the native pair`);
      assert.equal(Object.isFrozen(completion.optionalLocal.placement), true, `${name}: the physical placement is sealed data`);
      const owner = sourceEnclosingCallable(declaration, program.source.ast);
      assert.equal(owner !== undefined, true, `${name}: a private optional local has its actual callable owner`);
      assert.equal(program.records.genericProjection.get(owner).length, 0,
        `${name}: a private local does not enlarge its method's native generic ABI`);
    }
    for (const name of ["escaped", "captured"]) {
      const completion = program.records.localBinding.get(declarations.get(name));
      assert.equal(completion?.optionalLocal === undefined, true, `${name}: an escaping optional retains its existing full native contract`);
    }
    const privateResult = declarations.get("privateResult");
    assert.equal(privateResult !== undefined, true, "the private result of the generic call has its original local");
    assert.equal(program.records.localBinding.get(privateResult)?.optionalLocal?.kind, "declaration",
      "the result can use a local pair independently of its public native generic arguments");
    const publicOwner = sourceEnclosingCallable(privateResult, program.source.ast);
    assert.equal(publicOwner !== undefined, true, "the generic call retains its actual source owner");
    assert.equal(program.records.genericProjection.get(publicOwner).length, 2,
      "the explicit public optional type argument retains both storage and operations witnesses at the same assignment RHS");
    const outputs = [...compiled.artifacts.values()].join("\n");
    assert.equal(outputs.includes("Optional is absent."), true, "a dynamic payload extraction retains the original failure behavior");
  });

  test(`body-local optional native pairs distinguish zero preserve copies and clear payloads (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assert.equal(compiled.result.diagnostics.length, 0, compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | "));
    const observer = `
if (Tsonic.Generated.Index.testPresence<object, int>(0, false) != 7 ||
    Tsonic.Generated.Index.testPresence<object, int>(0, true) != 11 ||
    Tsonic.Generated.Index.copyValue<object, int>(0, false) != 0 ||
    Tsonic.Generated.Index.copyValue<object, int>(0, true) != 0 ||
    Tsonic.Generated.Index.replaceValue<object, int>(0, 19) != 19 ||
    Tsonic.Generated.Index.narrowValue<object, int>(0) != 0)
    throw new System.Exception("native absence versus present zero and exact payload operations");
var original = new object();
if (!System.Object.ReferenceEquals(Tsonic.Generated.Index.copyValue<object, object>(original, true), original))
    throw new System.Exception("native optional copies preserve the original reference");
try { _ = Tsonic.Generated.Index.guardedValue<object, int>(0, false); throw new System.Exception("missing optional guard"); }
catch (System.InvalidOperationException failure) when (failure.Message == "Optional is absent.") { }
System.Console.Write("local optional native pair");`;
    assert.equal(executeCsharpConstruction(compiled, `local-optional-native-pair-${surface}`, false, false, [], observer),
      "local optional native pair", "the same native carriers retain presence, clearing, copies, guards and reference identity");
  });
}
