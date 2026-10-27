import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { getCsharpMethodValue } from "../../../dist/target-model/types/method-values.js";
import { getCsharpLambdaSignature, getCsharpTaskResultTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { cases, contextualInputs, invalidOwnQuantifierSource, authoredOwnQuantifierSource } from "./quantified-parameter-contracts.fixtures.mjs";

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
for (const [name, sourceText] of Array.from(contextualInputs).slice(2, 4)) {
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

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
for (const [name, sourceText] of Array.from(contextualInputs).slice(0, 4)) {
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

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
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
