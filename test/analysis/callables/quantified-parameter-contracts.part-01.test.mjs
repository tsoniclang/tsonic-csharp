import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { getCsharpMethodValue } from "../../../dist/target-model/types/method-values.js";
import { getCsharpLambdaSignature, getCsharpTaskResultTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { cases, contextualInputs, invalidOwnQuantifierSource, authoredOwnQuantifierSource } from "./quantified-parameter-contracts.fixtures.mjs";

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
for (const [name, sourceText] of Array.from(cases).slice(0, 3)) {
test(`quantified native body keeps its own binder on ${surface}: ${name}`, () => {
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
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
for (const [name, destination, expected, parenthesized] of Array.from([
  ["default native result", "AsyncCallback<int32>", "int32", false],
  ["parenthesized native result", "AsyncCallback<int32>", "int32", true],
  ["explicit wider native result", "AsyncCallback<int32, int64>", "int64", false],
  ["authored floating result", "AsyncCallback<int32, number>", "float64", false],
]).slice(0, 4)) {
test(`authored async contextual completion retains ${name} on ${surface}`, { timeout: 240_000 }, () => {
  const body = name === "explicit wider native result"
    ? 'async value => { if (value < 0) throw new Error("negative"); return BigInt(value) as int64; }'
    : 'async value => { if (value < 0) throw new Error("negative"); return value; }';
  const compiled = compileCsharpSource({ surface, sourceText: `
    import type { int32, int64 } from "@tsonic/core/types.js";
    interface AsyncCallback<Input, Output = Input> { (value: Input): Promise<Output>; }
    export const checked: ${destination} = ${parenthesized ? `((${body}))` : body};
    export async function run(): Promise<boolean> { return await checked(7) === ${name === "explicit wider native result" ? "(7n as int64)" : "7"}; }
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
}
}

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
for (const [name, sourceText] of Array.from(contextualInputs).slice(0, 2)) {
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
}
