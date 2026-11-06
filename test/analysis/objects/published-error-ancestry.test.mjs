import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpNativeErrorAdmission } from "../../../dist/analysis/objects/error-storage-demands.js";
import { withCsharpSessionRequest, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { sourceTypeDescriptorStructure } from "@tsonic/target-api/source";

test("native Error literal ancestry consumes the exact published constructor instance on every surface", () => {
  for (const surface of ["native", "js"]) for (const derived of [false, true]) {
    const { compiled, value } = withCsharpSessionRequest({ surface, sourceText: `
      ${derived ? "class DerivedError extends Error {}" : ""}
      export const value: ${derived ? "DerivedError" : "Error"} = {
        name: "Error", message: "not an exception", stack: undefined, cause: undefined,
      };
    ` }, request => {
      const source = request.input.source;
      let declaredReads = 0;
      const admission = analyzeCsharpNativeErrorAdmission({ ...source, semantics: { ...source.semantics,
        forNode(node) {
          const queries = source.semantics.forNode(node);
          return { ...queries, declarations: { ...queries.declarations,
            declaredType(declaration) { declaredReads += 1; return queries.declarations.declaredType(declaration); } } };
        },
      } });
      return { declaredReads, codes: admission.issues.map(issue => issue.code),
        originalLiteral: admission.issues.length === 1 && source.ast.is.IsObjectLiteralExpression(admission.issues[0].sourceNode) };
    });
    assertCsharpCheckingSucceeded(compiled);
    assert.deepEqual(value, { declaredReads: derived ? 1 : 0,
      codes: ["CSHARP_ERROR_OBJECT_LITERAL_UNSUPPORTED"], originalLiteral: true },
    `${surface}/${derived}: only the separately retained class redeclaration proof reads its checked Type`);
    assert.deepEqual(compiled.targetDiagnostics.map(diagnostic => diagnostic.code), ["CSHARP_ERROR_OBJECT_LITERAL_UNSUPPORTED"],
      "the original native refusal remains at the actual object literal");
  }
});

test("missing, stale and contradictory published heritage instances cannot silently admit an Error literal", () => {
  const { compiled, value } = withCsharpSessionRequest({ sourceText: `
    class DerivedError extends Error {}
    class Foreign {}
    export const value: DerivedError = { name: "Error", message: "bad", stack: undefined, cause: undefined };
  ` }, request => {
    const source = request.input.source;
    const derived = source.navigation.nodes.find(node => source.ast.is.IsClassDeclaration(node) &&
      source.ast.text(source.ast.name(node)) === "DerivedError");
    const foreign = source.navigation.nodes.find(node => source.ast.is.IsClassDeclaration(node) &&
      source.ast.text(source.ast.name(node)) === "Foreign");
    const heritage = source.navigation.declaredHeritage(derived);
    assert.equal(heritage.kind === "resolved" && heritage.edges.length === 1, true, "the actual source has one base");
    const expression = source.ast.as.AsExpressionWithTypeArguments(heritage.edges[0].heritage).Expression;
    const publication = source.effectiveTypes.get(expression);
    assert.equal(publication !== undefined && publication.kind !== "refused", true, "the actual constructor expression is published");
    const body = sourceTypeDescriptorStructure(publication.type);
    assert.equal((body.kind === "shape" || body.kind === "callable") && body.constructs.length === 1, true,
      "the original constructor has one exact instance signature");
    const cases = [undefined, { ...publication, provenance: { ...publication.provenance, occurrence: foreign } },
      ...["recursion", "unexpressible"].map(cut => ({ ...publication,
        type: { ...publication.type, definition: undefined, cut } })),
      { ...publication, type: { ...body, constructs: [] } },
      { ...publication, type: { ...body, constructs: [...body.constructs,
        { ...body.constructs[0], result: { kind: "declared", declaration: foreign, typeArguments: [] } }] } }];
    return cases.map(selected => {
      const admission = analyzeCsharpNativeErrorAdmission({ ...source,
        effectiveTypes: { ...source.effectiveTypes, get: node => node === expression ? selected : source.effectiveTypes.get(node) } });
      return admission.issues.length === 1 && admission.issues[0].code === "CSHARP_ERROR_ANCESTRY_NOT_PROVEN" &&
        admission.issues[0].sourceNode === expression;
    });
  });
  assertCsharpCheckingSucceeded(compiled);
  assert.deepEqual(value, [true, true, true, true, true, true], "one precise boundary refusal keeps the exact selected base expression");
});

test("equal constructor overload results retain nominal Error identity without reopening a cut instance body", () => {
  const { compiled, value } = withCsharpSessionRequest({ sourceText: `
    class DerivedError extends Error {}
    export const value: DerivedError = { name: "Error", message: "bad", stack: undefined, cause: undefined };
  ` }, request => {
    const source = request.input.source;
    const derived = source.navigation.nodes.find(node => source.ast.is.IsClassDeclaration(node));
    const heritage = source.navigation.declaredHeritage(derived);
    const expression = source.ast.as.AsExpressionWithTypeArguments(heritage.edges[0].heritage).Expression;
    const publication = source.effectiveTypes.get(expression);
    const body = sourceTypeDescriptorStructure(publication.type);
    const signature = body.constructs[0];
    assert.equal(signature.result.kind === "declared", true, "the actual native constructor returns a nominal instance");
    return [signature.result, { ...signature.result, definition: undefined, cut: "recursion" }].map(result => {
      const selected = { ...publication, type: { ...body, constructs: [signature, { ...signature, result }] } };
      const admission = analyzeCsharpNativeErrorAdmission({ ...source,
        effectiveTypes: { ...source.effectiveTypes, get: node => node === expression ? selected : source.effectiveTypes.get(node) } });
      return admission.issues.length === 1 && admission.issues[0].code === "CSHARP_ERROR_OBJECT_LITERAL_UNSUPPORTED" &&
        source.ast.is.IsObjectLiteralExpression(admission.issues[0].sourceNode);
    });
  });
  assertCsharpCheckingSucceeded(compiled);
  assert.deepEqual(value, [true, true], "all overloads agree on the identical declared instance even at a nominal recursion cut");
});

test("ordinary class heritage and Error-shaped fields do not manufacture native exception ancestry", () => {
  for (const surface of ["native", "js"]) {
    const { compiled, value } = withCsharpSessionRequest({ surface, sourceText: `
      class Plain {
        readonly name: string = "not an exception";
        readonly message: string = "plain";
      }
      class DerivedPlain extends Plain {}
      export const value: DerivedPlain = { name: "not an exception", message: "plain" };
    ` }, request => analyzeCsharpNativeErrorAdmission(request.input.source).issues.map(issue => issue.code));
    assertCsharpCheckingSucceeded(compiled);
    assert.deepEqual(value, [], `${surface}: actual non-Error declaration identity stays distinct regardless of field spelling`);
  }
});

test("the separately retained class redeclaration proof keeps the identical native Error base inventory", () => {
  for (const surface of ["native", "js"]) {
    const { compiled, value } = withCsharpSessionRequest({ surface, sourceText: `
      class OwnMessage extends Error { readonly message: string = "changed"; }
      class Intermediate extends Error { detail: string = "detail"; }
      class OwnName extends Intermediate { readonly name: string = "OwnName"; }
    ` }, request => {
      const source = request.input.source;
      const direct = source.navigation.nodes.find(node => source.ast.is.IsClassDeclaration(node) &&
        source.ast.text(source.ast.name(node)) === "Intermediate");
      const edge = source.navigation.declaredHeritage(direct).edges[0];
      const queries = source.semantics.forNode(edge.heritage);
      const base = queries.types.nonNullableType(edge.selectedType) ?? edge.selectedType;
      const expected = queries.types.propertyInfos(base);
      const inventories = [];
      const admission = analyzeCsharpNativeErrorAdmission({ ...source, semantics: { ...source.semantics, forNode(node) {
        const actual = source.semantics.forNode(node);
        return { ...actual, types: { ...actual.types, propertyInfos(type) {
          const properties = actual.types.propertyInfos(type);
          inventories.push(type === base && properties.length === expected.length && properties.every((property, index) =>
            property.symbol === expected[index].symbol && property.type === expected[index].type));
          return properties;
        } } };
      } } });
      return { inventories, nativeOnly: expected.every(property => property.name !== "detail"),
        codes: admission.issues.map(issue => issue.code) };
    });
    assertCsharpCheckingSucceeded(compiled);
    assert.deepEqual(value, { inventories: [true, true, true], nativeOnly: true,
      codes: ["CSHARP_ERROR_MEMBER_REDECLARATION_UNSUPPORTED", "CSHARP_ERROR_MEMBER_REDECLARATION_UNSUPPORTED"] },
    `${surface}: the current class-member proof uses the actual non-nullable Error instance, never constructor statics or derived fields`);
  }
});
