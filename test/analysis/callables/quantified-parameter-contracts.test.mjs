import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { getCsharpMethodValue } from "../../../dist/target-model/types/method-values.js";
import { getCsharpLambdaSignature, getCsharpTaskResultTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

const cases = [
  ["authored field signature", `
    export class Owner {
      identity: <Context>(value: Context) => Context = <Authored>(value: Authored): Authored => value;
    }
    export function run(): string { return new Owner().identity("value"); }
  `],
  ["reassigned generic callable", `
    export class Owner { identity = <Original>(value: Original): Original => value; }
    export function run(): string {
      const owner = new Owner();
      const retained = owner.identity;
      owner.identity = <Replacement>(value: Replacement): Replacement => value;
      return retained("first") + owner.identity("second");
    }
  `],
  ["outer payload and independent invocation binder", `
    export function create<Outer>(outer: Outer) {
      return <Inner>(value: Inner): { outer: Outer; value: Inner } => ({ outer, value });
    }
    export function run(): boolean {
      const value = create(3)("value");
      return value.outer === 3 && value.value === "value";
    }
  `],
];

for (const surface of ["native", "js"]) {
  for (const [name, sourceText] of cases) test(`quantified native body keeps its own binder on ${surface}: ${name}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the complete source binder contract is admitted before publication");
    let checked = 0;
    const visit = node => {
      if ((program.source.ast.is.IsArrowFunction(node) || program.source.ast.is.IsFunctionExpression(node)) &&
          program.source.ast.typeParameters(node).length > 0) {
        const contract = program.records.callableDeclaration.get(node)?.contract;
        assert.equal(contract?.kind === "source", true, "the actual source generic declaration owns its contract");
        assert.equal(contract.nativeSignature.methodTypeParameterIdentities.length > 0, true,
          "the authored quantified native signature is not erased into its contextual alias");
        const closure = program.records.captureClosure.get(node);
        const physical = getCsharpMethodValue(closure?.method.type);
        assert.equal(physical !== undefined, true, "the generic frame consumes the already-admitted body invocation protocol");
        assert.equal(physical.typeParameters.length === contract.nativeSignature.methodTypeParameterIdentities.length &&
          physical.typeParameters.every((identity, index) => identity === contract.nativeSignature.methodTypeParameterIdentities[index]), true,
        "the frame retains the full authored and native-projection vector, not its contextual alias's quantifiers");
        assert.equal(targetTypeRefEquals(getCsharpLambdaSignature(closure.method.type)?.returnType, contract.returnType), true,
          "the frame and body declaration publish one actual native return ABI");
        const native = program.records.typeEmission.get(closure.method.type)?.lambda;
        assert.equal(native !== undefined && targetTypeRefEquals(native.returnType, contract.returnType) &&
          native.parameters.length === contract.nativeParameters.length && native.parameters.every((type, index) =>
            targetTypeRefEquals(type, contract.nativeParameters[index].targetParameter.type)), true,
        "a physically shared protocol retains this body's exact native invocation binders in sealed type emission");
        for (const parameter of contract.nativeParameters) {
          if (parameter.targetParameter.type.kind !== "type-parameter") continue;
          assert.equal(contract.nativeSignature.methodTypeParameterIdentities.includes(parameter.targetParameter.type.identity), true,
            "an authored invocation parameter uses the declaration's own exact quantifier");
          checked += 1;
        }
      }
      program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    program.source.navigation.sourceFiles.forEach(visit);
    assert.equal(checked > 0, true, "the witness observes actual quantified native parameter records");
  });
}

const contextualInputs = [
  ["async alias input", `
    import type { int32 } from "@tsonic/core/types.js";
    interface AsyncCallback<Input, Output = Input> { (value: Input): Promise<Output>; }
    export const checked: AsyncCallback<int32> = async value => {
      if (value < 0) throw new Error("negative");
      return value;
    };
    export async function run(): Promise<boolean> { return await checked(7) === 7; }
  `],
  ["explicit this is not an input slot", `
    import type { int32 } from "@tsonic/core/types.js";
    interface Callback<Input> { (this: void, value: Input): Input; }
    export const checked: Callback<int32> = function(value) { return value; };
    export function run(): boolean { return checked(7) === 7; }
  `],
  ["narrowed optional input", `
    import type { int32 } from "@tsonic/core/types.js";
    type Callback = (value: int32 | undefined) => int32;
    export const checked: Callback = value => value === undefined ? 3 : value;
    export function run(): boolean { return checked(undefined) === 3 && checked(7) === 7; }
  `],
  ["rest native input", `
    import type { int32 } from "@tsonic/core/types.js";
    type Callback = (...values: int32[]) => int32;
    export const checked: Callback = (...values) => values[0];
    export function run(): boolean { return checked(7, 8) === 7; }
  `],
];

const invalidOwnQuantifierSource = `
    import type { int32 } from "@tsonic/core/types.js";
    type Callback = <Context>(value: Context, count: int32) => Context;
    export const checked: Callback = <Authored>(value, count) => {
      const native: int32 = count;
      return value;
    };
    export function run(): boolean { return checked("kept", 7) === "kept"; }
  `;

for (const surface of ["native", "js"]) for (const [name, destination, expected, parenthesized] of [
  ["default native result", "AsyncCallback<int32>", "int32", false],
  ["parenthesized native result", "AsyncCallback<int32>", "int32", true],
  ["explicit wider native result", "AsyncCallback<int32, int64>", "int64", false],
  ["authored floating result", "AsyncCallback<int32, number>", "float64", false],
]) test(`authored async contextual completion retains ${name} on ${surface}`, { timeout: 240_000 }, () => {
  const body = 'async value => { if (value < 0) throw new Error("negative"); return value; }';
  const compiled = compileCsharpSource({ surface, sourceText: `
    import type { int32, int64 } from "@tsonic/core/types.js";
    interface AsyncCallback<Input, Output = Input> { (value: Input): Promise<Output>; }
    export const checked: ${destination} = ${parenthesized ? `((${body}))` : body};
    export async function run(): Promise<boolean> { return await checked(7) === 7; }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  const declarations = [];
  const visit = node => {
    if (program.source.ast.is.IsArrowFunction(node)) declarations.push(node);
    program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  program.source.navigation.sourceFiles.forEach(visit);
  assert.equal(declarations.length, 1, "one original contextual async callable is admitted");
  const contract = program.records.callableDeclaration.get(declarations[0])?.contract;
  assert.equal(contract?.kind, "source", "the native body uses its sealed source declaration contract");
  const result = getCsharpTaskResultTargetType(contract.returnType);
  assert.equal(result?.kind, "source-primitive", "contextual completion keeps a native scalar result");
  assert.equal(result.name, expected, "only the actual authored destination may select the native output width");
  executeCsharpConstruction(compiled, `authored-context-${name.replaceAll(" ", "-")}-${surface}`, true,
    false, [], 'if (!await Tsonic.Generated.Index.run()) throw new System.Exception("authored contextual result");');
});

const authoredOwnQuantifierSource = `
    import type { int32 } from "@tsonic/core/types.js";
    type Callback = <Context>(value: Context, count: int32) => Context;
    export const checked: Callback = <Authored>(value: Authored, count: int32): Authored => {
      const native: int32 = count;
      return value;
    };
    export function run(): boolean { return checked("kept", 7) === "kept"; }
  `;

for (const surface of ["native", "js"]) for (const [name, sourceText] of contextualInputs) {
  test(`unannotated parameter keeps its contextual native input on ${surface}: ${name}`, { timeout: 240_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const { ast } = program.source;
    const parameters = new Set();
    const references = [];
    const visit = node => {
      if (ast.is.IsArrowFunction(node) || ast.is.IsFunctionExpression(node)) {
        const contract = program.records.callableDeclaration.get(node)?.contract;
        assert.equal(contract?.kind === "source", true, "the checked body owns its native input vector");
        for (const parameter of contract.parameters) {
          if (ast.typeNode(parameter) !== undefined || ast.as.AsParameterDeclaration(parameter)?.Initializer !== undefined) continue;
          parameters.add(parameter);
          const incoming = program.records.lambdaParameterType.get(parameter);
          const storage = program.records.requiredStorageType.get(parameter);
          assert.equal(incoming !== undefined && storage !== undefined && targetTypeRefEquals(incoming, storage), true,
            "unannotated declaration storage retains the contextual native input, including absence and rest");
        }
      }
      if (ast.is.IsIdentifier(node)) references.push(node);
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    program.source.navigation.sourceFiles.forEach(visit);
    assert.equal(parameters.size > 0, true, "the witness observes an actual unannotated native parameter declaration");
    let reads = 0;
    for (const reference of references) {
      const declaration = program.source.navigation.referenceFor(reference)?.declaration;
      if (!parameters.has(declaration)) continue;
      const storage = program.records.valueRead.get(reference)?.storage;
      if (storage === undefined) continue;
      assert.equal(targetTypeRefEquals(storage, program.records.requiredStorageType.get(declaration)), true,
        "reference storage and declaration storage share one contextual native selection before flow narrowing");
      reads += 1;
    }
    assert.equal(reads > 0, true, "the witness retains actual value reads of those native parameters");
    executeCsharpConstruction(compiled, `contextual-native-input-${name.replaceAll(" ", "-")}-${surface}`, true,
      false, [], name === "async alias input"
        ? "if (!await Tsonic.Generated.Index.run()) throw new System.Exception(\"native contextual input\");"
        : "if (!Tsonic.Generated.Index.run()) throw new System.Exception(\"native contextual input\");");
  });
}

for (const surface of ["native", "js"]) {
  test(`an explicit generic arrow with unannotated inputs is rejected before ${surface} target admission`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: invalidOwnQuantifierSource });
    assert.equal(compiled.source.diagnostics.length === 2 && compiled.source.diagnostics.every(issue => issue?.code === 7006), true,
      "the unchanged invalid source has exactly its two strict-source TS7006 errors");
    assert.equal(compiled.targetDiagnostics.length === 2 && compiled.targetDiagnostics.every(issue =>
      issue.code === "TSTS_DIAGNOSTIC" && issue.evidence?.includes("tsts.code=TS7006")), true,
    "both source errors survive the actual checkSource boundary without a target replacement");
    for (const parameter of ["value", "count"]) assert.equal(compiled.targetDiagnostics.filter(issue =>
      issue.message.includes(`Parameter '${parameter}' implicitly has an 'any' type.`)).length, 1,
    `${parameter}: the original unannotated input is rejected exactly once`);
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
      "invalid strict source publishes no C# program, plan or artifacts");
  });

  test(`authored generic inputs retain their own binder and exact native integer on ${surface}`, { timeout: 240_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: authoredOwnQuantifierSource });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const declarations = [];
    const visit = node => {
      if (program.source.ast.is.IsArrowFunction(node) && program.source.ast.typeParameters(node).length > 0) declarations.push(node);
      program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    program.source.navigation.sourceFiles.forEach(visit);
    assert.equal(declarations.length, 1, "the valid source has one actual authored generic body");
    const contract = program.records.callableDeclaration.get(declarations[0])?.contract;
    assert.equal(contract?.kind === "source" && contract.nativeParameters.length === 2, true,
      "the authored body publishes its complete native input vector");
    const authored = contract.nativeParameters[0].targetParameter.type;
    assert.equal(authored.kind === "type-parameter" && contract.nativeSignature.methodTypeParameterIdentities.includes(authored.identity) &&
      targetTypeRefEquals(contract.returnType, authored), true, "the value and return use the body's own native invocation binder");
    assert.equal(targetTypeRefEquals(contract.nativeParameters[1].targetParameter.type, csharpSourcePrimitiveTargetType("int32")), true,
      "the independent count input retains exact native int32 rather than a source number carrier");
    executeCsharpConstruction(compiled, `authored-quantifier-native-input-${surface}`, true, false, [],
      "if (!Tsonic.Generated.Index.run()) throw new System.Exception(\"native authored generic input\");");
  });
}
