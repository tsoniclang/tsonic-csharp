import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpNativeErrorAdmission } from "../../../dist/analysis/objects/error-storage-demands.js";
import { csharpSourceNodes } from "../../../dist/analysis/program/source-nodes.js";
import { withCsharpSessionRequest, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";

// Native Error ancestry is read from published heritage edges (facts.objects.heritage); the Error member inventory
// from facts.objects.members / member (nextgen C-2542). The checker constructor-descriptor and propertyInfos paths
// and their CSHARP_ERROR_ANCESTRY_NOT_PROVEN refusal are deleted (Host owns heritage).

function namedClass(source, name) {
  return csharpSourceNodes(source.syntax, source.sourceFiles).find(node => source.syntax.is.IsClassDeclaration(node) &&
    source.syntax.text(source.syntax.name(node)) === name);
}

// A copy of the received Source facts program whose object facts are replaced member by member.
function withObjects(source, objects) {
  return { ...source, facts: { ...source.facts, objects: { ...source.facts.objects, ...objects } } };
}

test("native Error literal ancestry consumes the exact published heritage on every surface", () => {
  for (const surface of ["native", "js"]) for (const derived of [false, true]) {
    const { compiled, value } = withCsharpSessionRequest({ surface, sourceText: `
      ${derived ? "class DerivedError extends Error {}" : ""}
      export const value: ${derived ? "DerivedError" : "Error"} = {
        name: "Error", message: "not an exception", stack: undefined, cause: undefined,
      };
    ` }, request => {
      const source = request.input.source;
      // nextgen C-2542: the old declaredType read-count spy is removed; ancestry is a published heritage edge, not a
      // checked Type read.
      const admission = analyzeCsharpNativeErrorAdmission(source);
      return { codes: admission.issues.map(issue => issue.code),
        originalLiteral: admission.issues.length === 1 && source.syntax.is.IsObjectLiteralExpression(admission.issues[0].sourceNode) };
    });
    assertCsharpCheckingSucceeded(compiled);
    assert.deepEqual(value, { codes: ["CSHARP_ERROR_OBJECT_LITERAL_UNSUPPORTED"], originalLiteral: true },
      `${surface}/${derived}: the Error literal is refused at the actual object literal`);
    assert.deepEqual(compiled.targetDiagnostics.map(diagnostic => diagnostic.code), ["CSHARP_ERROR_OBJECT_LITERAL_UNSUPPORTED"],
      "the original native refusal remains at the actual object literal");
  }
});

test("Error ancestry follows the published heritage edge, and a refused edge is an invariant", () => {
  // Replaces the old missing/stale/contradictory constructor-publication cases (nextgen C-2542): the heritage edge is
  // the one published fact. Retargeting it to a non-Error class removes the ancestry; a Host heritage refusal reached
  // in C# is an invariant failure (Host refusals are forwarded before C# analysis).
  const { compiled, value } = withCsharpSessionRequest({ sourceText: `
    class DerivedError extends Error {}
    class Foreign {}
    export const value: DerivedError = { name: "Error", message: "bad", stack: undefined, cause: undefined };
  ` }, request => {
    const source = request.input.source;
    const derived = namedClass(source, "DerivedError");
    const foreign = namedClass(source, "Foreign");
    const heritage = source.facts.objects.heritage(derived);
    assert.equal(Array.isArray(heritage) && heritage.length === 1 && heritage[0].kind === "extends", true, "the actual source has one base");
    const published = analyzeCsharpNativeErrorAdmission(source).issues.map(issue => issue.code);
    const retargeted = analyzeCsharpNativeErrorAdmission(withObjects(source, {
      heritage: node => node === derived ? [{ ...heritage[0], target: foreign }] : source.facts.objects.heritage(node),
    })).issues.map(issue => issue.code);
    let invariant;
    try {
      analyzeCsharpNativeErrorAdmission(withObjects(source, {
        heritage: node => node === derived
          ? { kind: "refused", code: "TSONIC_TEST_HERITAGE", message: "test heritage refusal", site: derived }
          : source.facts.objects.heritage(node),
      }));
    } catch (error) {
      invariant = error;
    }
    return { published, retargeted, invariant: invariant?.diagnostic?.code === "TSONIC_INTERNAL_ANALYSIS_INVARIANT" &&
      invariant.diagnostic.sourceNode === derived };
  });
  assertCsharpCheckingSucceeded(compiled);
  assert.deepEqual(value, { published: ["CSHARP_ERROR_OBJECT_LITERAL_UNSUPPORTED"], retargeted: [], invariant: true },
    "the Error literal refusal follows the published edge; a refused edge fails the analysis invariant at its class");
});

// nextgen C-2542: the test "equal constructor overload results retain nominal Error identity without reopening a cut
// instance body" is removed. It exercised the deleted constructor-descriptor ancestry path (construct signatures of the
// base expression's published value type); ancestry is now the heritage edge's target declaration.

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

test("the separately retained class redeclaration proof reads the native Error member inventory", () => {
  for (const surface of ["native", "js"]) {
    const { compiled, value } = withCsharpSessionRequest({ surface, sourceText: `
      class OwnMessage extends Error { readonly message: string = "changed"; }
      class Intermediate extends Error { detail: string = "detail"; }
      class OwnName extends Intermediate { readonly name: string = "OwnName"; }
    ` }, request => {
      const source = request.input.source;
      const intermediate = namedClass(source, "Intermediate");
      const edge = source.facts.objects.heritage(intermediate)[0];
      // The Error declaration Intermediate extends; every class's redeclaration proof reads that declaration's members.
      const error = edge.target;
      const inventories = [];
      let nativeOnly = true;
      const admission = analyzeCsharpNativeErrorAdmission(withObjects(source, {
        members(type) {
          const members = source.facts.objects.members(type);
          if (type.kind === "declared" && type.declaration === error) {
            inventories.push(true);
            if (!("code" in members) && members.some(member => member.name === "detail")) nativeOnly = false;
          } else {
            inventories.push(false);
          }
          return members;
        },
      }));
      return { inventories, nativeOnly, codes: admission.issues.map(issue => issue.code) };
    });
    assertCsharpCheckingSucceeded(compiled);
    // nextgen C-2542: the old propertyInfos spy (checker symbol and Type identity per property) becomes a
    // facts.objects.members spy on the Error declaration's self type; the expected codes are unchanged.
    assert.deepEqual(value, { inventories: [true, true, true], nativeOnly: true,
      codes: ["CSHARP_ERROR_MEMBER_REDECLARATION_UNSUPPORTED", "CSHARP_ERROR_MEMBER_REDECLARATION_UNSUPPORTED"] },
    `${surface}: the class-member proof uses the native Error member inventory, never derived fields`);
  }
});
