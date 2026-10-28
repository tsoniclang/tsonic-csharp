import assert from "node:assert/strict";
import test from "node:test";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import { createSourceCallableValueQuery } from "@tsonic/target-api/source";
import { createCsharpSourceProfileStorageEffects } from "../../../dist/analysis/operations/source-profiles/source-storage-effects.js";
import { withCsharpSessionRequest } from "../../helpers/direct-csharp-session.mjs";

for (const surface of ["native", "js"]) {
  test(`${surface} native base storage accepts only the exact physical provider constructor`, () => {
    const observed = withCsharpSessionRequest({ surface, sourceText: `
      import { Exception } from "@tsonic/dotnet/System.js";
      declare const ForeignException: typeof Exception;
      export class Derived extends Exception {}
      export class ForeignDerived extends ForeignException {}
      export function direct(input: Exception): Exception { return new Exception("native", input); }
      export function derived(): Exception { return new Derived("derived"); }
    ` }, request => {
      const source = request.input.source;
      const file = source.sourceFiles.find(candidate => source.ast.getFileName(candidate) === "/project/index.ts");
      assert.equal(file !== undefined, true, "the actual checked project file exists");
      const derived = source.ast.statements(file).find(node => node !== undefined &&
        source.ast.is.IsClassDeclaration(node) && source.ast.text(source.ast.name(node)) === "Derived");
      assert.equal(derived !== undefined, true, "the actual checked derived class exists");
      const heritage = source.navigation.declaredHeritage(derived);
      assert.equal(heritage.kind, "resolved", "the checked native base is selected");
      const edge = heritage.edges.find(candidate => candidate.kind === "extends");
      assert.equal(edge !== undefined, true, "the selected base has its original checked heritage edge");
      const expression = source.ast.as.AsExpressionWithTypeArguments(edge.heritage)?.Expression;
      const binding = expression === undefined ? undefined :
        createSourceCallableValueQuery(source)(expression)?.selectedDeclaration;
      assert.equal(binding !== undefined && source.ast.is.IsClassDeclaration(binding), true,
        `the base resolves to its provider-owned class declaration, not ${binding === undefined ? "an unresolved binding" : source.ast.kindName(binding)}`);
      const semantics = source.semantics.forNode(expression);
      const bindingFact = source.sourceFacts.getFact(binding, providerVirtualDeclarationFactKey);
      assert.equal(bindingFact?.exportId !== undefined && bindingFact?.exportName !== undefined, true,
        "the original native binding carries exact provider export identity");
      const nativeType = request.providers.resolveType(bindingFact);
      assert.equal(nativeType.kind === "resolved" && nativeType.relations.length === 1 &&
        nativeType.relations[0].kind === "type" && nativeType.relations[0].targetBinding.kind === "class" &&
        nativeType.relations[0].targetBinding.csharpType !== undefined, true,
      "the exact native source export owns one physical class binding");
      const effects = createCsharpSourceProfileStorageEffects(source, request.providers);
      const constructors = effects.nativeConstructorsFor(binding, semantics);
      const type = semantics.declarations.declaredValueType(binding);
      const selected = type === undefined ? [] : semantics.types.constructSignatures(type)
        .map(signature => semantics.declarations.signatureDeclaration(signature));
      assert.equal(constructors !== undefined && constructors.length > 0 &&
        constructors.length === selected.length && constructors.every((node, index) => node === selected[index]), true,
      "every exact selected native constructor survives in checker order");
      assert.equal(Object.isFrozen(constructors), true, "the selected native constructor set is immutable");
      for (const constructor of constructors) {
        const fact = source.sourceFacts.getFact(constructor, providerVirtualDeclarationFactKey);
        const resolved = request.providers.resolveSignature(fact);
        assert.equal(fact?.signatureId !== undefined && fact?.exportId === bindingFact.exportId &&
          resolved.kind === "resolved" && resolved.relations.length === 1 &&
          resolved.relations[0].kind === "signature" && resolved.relations[0].targetMember.kind === "constructor" &&
          resolved.relations[0].receiver.kind === "none" &&
          resolved.relations[0].targetBinding.id === nativeType.relations[0].targetBinding.id, true,
        "each native signature retains the exact owning physical constructor relation");
      }

      const foreignClass = source.ast.statements(file).find(node => node !== undefined &&
        source.ast.is.IsClassDeclaration(node) && source.ast.text(source.ast.name(node)) === "ForeignDerived");
      assert.equal(foreignClass !== undefined, true, "the same-signature foreign base is present");
      const foreignHeritage = source.navigation.declaredHeritage(foreignClass);
      assert.equal(foreignHeritage.kind, "resolved", "the foreign base still has checked heritage");
      const foreignEdge = foreignHeritage.edges.find(candidate => candidate.kind === "extends");
      assert.equal(foreignEdge !== undefined, true, "the foreign checked heritage edge is present");
      const foreignExpression = source.ast.as.AsExpressionWithTypeArguments(foreignEdge.heritage)?.Expression;
      const foreign = foreignExpression === undefined ? undefined :
        createSourceCallableValueQuery(source)(foreignExpression)?.selectedDeclaration;
      assert.equal(foreign !== undefined && source.ast.is.IsVariableDeclaration(foreign), true,
        "the foreign base is an actual checked binding, not a fabricated source node");
      const unownedProvider = {
        resolveSignature() { assert.fail("an unowned value cannot trigger target signature resolution"); },
        resolveType() { assert.fail("an unowned value cannot trigger target type resolution"); },
      };
      assert.equal(createCsharpSourceProfileStorageEffects(source, unownedProvider)
        .nativeConstructorsFor(derived, semantics) === undefined, true,
      "a project class cannot acquire a native provider terminal");
      assert.equal(createCsharpSourceProfileStorageEffects(source, unownedProvider)
        .nativeConstructorsFor(foreign, source.semantics.forNode(foreign)) === undefined, true,
        "a foreign value with the exact native signature remains unproven");

      const alteredSource = (subject, transform) => Object.freeze({
        ...source,
        sourceFacts: Object.freeze({
          getFact(node, key) {
            const original = source.sourceFacts.getFact(node, key);
            return node === subject && key === providerVirtualDeclarationFactKey && original !== undefined
              ? transform(original) : original;
          },
          getFacts: node => source.sourceFacts.getFacts(node),
          getVirtualDeclarationDocument: name => source.sourceFacts.getVirtualDeclarationDocument(name),
        }),
      });
      const foreignBinding = alteredSource(binding, fact => ({ ...fact, exportId: `${fact.exportId}:foreign` }));
      assert.equal(createCsharpSourceProfileStorageEffects(foreignBinding, unownedProvider)
        .nativeConstructorsFor(binding, semantics) === undefined, true,
      "an otherwise identical foreign export cannot borrow the native terminal");
      const foreignSignature = alteredSource(constructors[0], fact => ({ ...fact, signatureId: `${fact.signatureId}:foreign` }));
      const exactProvider = {
        resolveType: fact => request.providers.resolveType(fact),
        resolveSignature: fact => fact.signatureId?.endsWith(":foreign")
          ? { kind: "missing", reason: "the foreign signature is not registered" }
          : request.providers.resolveSignature(fact),
      };
      assert.equal(createCsharpSourceProfileStorageEffects(foreignSignature, exactProvider)
        .nativeConstructorsFor(binding, semantics) === undefined, true,
      "one foreign signature cannot be hidden among the selected native overloads");
      const mismatchedOwner = {
        resolveSignature: fact => request.providers.resolveSignature(fact),
        resolveType(fact) {
          const result = request.providers.resolveType(fact);
          return result.kind !== "resolved" ? result : { ...result, relations: result.relations.map(relation => ({
            ...relation, targetBinding: { ...relation.targetBinding, id: `${relation.targetBinding.id}:foreign` },
          })) };
        },
      };
      assert.equal(createCsharpSourceProfileStorageEffects(source, mismatchedOwner)
        .nativeConstructorsFor(binding, semantics) === undefined, true,
      "a constructor and source type mapped to different native owners cannot share a terminal");
      const missingProvider = {
        resolveType: fact => request.providers.resolveType(fact),
        resolveSignature: () => ({ kind: "missing", reason: "no exact native signature" }),
      };
      assert.equal(createCsharpSourceProfileStorageEffects(source, missingProvider)
        .nativeConstructorsFor(binding, semantics) === undefined, true,
      "unresolved provider signatures never acquire a physical native terminal");
      const ambiguousProvider = { resolveType: fact => request.providers.resolveType(fact), resolveSignature(fact) {
        const result = request.providers.resolveSignature(fact);
        return result.kind !== "resolved" ? result : { ...result, relations: [...result.relations, ...result.relations] };
      } };
      assert.equal(createCsharpSourceProfileStorageEffects(source, ambiguousProvider)
        .nativeConstructorsFor(binding, semantics) === undefined, true,
      "ambiguous native relations cannot choose a first constructor");
      const factoryProvider = { resolveType: fact => request.providers.resolveType(fact), resolveSignature(fact) {
        const result = request.providers.resolveSignature(fact);
        return result.kind !== "resolved" ? result : { ...result, relations: result.relations.map(relation => ({
          ...relation, targetMember: { ...relation.targetMember,
            csharpInvocation: { kind: "static-factory-construction", factoryType: nativeType.relations[0].targetBinding.csharpType } },
        })) };
      } };
      assert.equal(createCsharpSourceProfileStorageEffects(source, factoryProvider)
        .nativeConstructorsFor(binding, semantics) === undefined, true,
      "a factory is not an inheritable physical constructor");
      const direct = source.ast.statements(file).find(node => node !== undefined &&
        source.ast.is.IsFunctionDeclaration(node) && source.ast.text(source.ast.name(node)) === "direct");
      assert.equal(direct !== undefined, true, "the checked direct native construction exists");
      let invocation;
      const visit = node => {
        if (source.ast.is.IsNewExpression(node)) invocation = node;
        source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
      };
      visit(direct);
      assert.equal(invocation !== undefined, true, "the checked native construction retains its call node");
      const call = source.semantics.forNode(invocation).operations.call(invocation);
      assert.equal(call?.sourceSelectedSignatureKind, "resolved", "the actual native construction is checked");
      assert.equal(call.sourceArguments.length, 2, "the original native reference argument remains present");
      assert.equal(effects.call(invocation, call) === undefined, true,
        "a native inheritance terminal does not claim purity, argument preservation or a fresh-value effect");
      return constructors.length;
    });
    assert.equal(observed.compiled.sourceDiagnosticsText, "", "the exact native source is accepted by the checker");
    assert.equal(observed.value > 0, true, "the native provider constructor control ran");
  });
}
