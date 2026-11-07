import assert from "node:assert/strict";
import test from "node:test";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
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
      const file = source.sourceFiles.find(candidate => source.syntax.getFileName(candidate) === "/project/index.ts");
      assert.equal(file !== undefined, true, "the actual checked project file exists");
      const derived = source.syntax.statements(file).find(node => node !== undefined &&
        source.syntax.is.IsClassDeclaration(node) && source.syntax.text(source.syntax.name(node)) === "Derived");
      assert.equal(derived !== undefined, true, "the actual checked derived class exists");
      // Published heritage (facts.objects.heritage) and the base expression's published reference target
      // (facts.navigation.identity.target) replace the checker heritage and callable-value queries (nextgen C-2542).
      const heritage = source.facts.objects.heritage(derived);
      assert.equal(Array.isArray(heritage), true, "the checked native base is published");
      const edge = heritage.find(candidate => candidate.kind === "extends");
      assert.equal(edge !== undefined, true, "the selected base has its original checked heritage edge");
      const expression = source.syntax.as.AsExpressionWithTypeArguments(edge.heritage)?.Expression;
      const binding = expression === undefined ? undefined : source.facts.navigation.identity.target(expression)?.declaration;
      assert.equal(binding !== undefined && source.syntax.is.IsClassDeclaration(binding), true,
        `the base resolves to its provider-owned class declaration, not ${binding === undefined ? "an unresolved binding" : source.syntax.kindName(binding)}`);
      const bindingFact = source.sourceFacts.getFact(binding, providerVirtualDeclarationFactKey);
      assert.equal(bindingFact?.exportId !== undefined && bindingFact?.exportName !== undefined, true,
        "the original native binding carries exact provider export identity");
      const nativeType = request.providers.resolveType(bindingFact);
      assert.equal(nativeType.kind === "resolved" && nativeType.relations.length === 1 &&
        nativeType.relations[0].kind === "type" && nativeType.relations[0].targetBinding.kind === "class" &&
        nativeType.relations[0].targetBinding.csharpType !== undefined, true,
      "the exact native source export owns one physical class binding");
      const effects = createCsharpSourceProfileStorageEffects(source, request.providers);
      const constructors = effects.nativeConstructorsFor(binding);
      // nextgen C-2542: the published construct signatures (facts.objects.construction) replace the checker
      // constructSignatures walk; the order is the published (declaration) order.
      const construction = source.facts.objects.construction(binding);
      const selected = "code" in construction ? [] : construction.signatures.map(signature => signature.declaration);
      assert.equal(constructors !== undefined && constructors.length > 0 &&
        constructors.length === selected.length && constructors.every((node, index) => node === selected[index]), true,
      "every exact selected native constructor survives in published order");
      assert.equal(Object.isFrozen(constructors), true, "the selected native constructor set is immutable");
      const accessibilities = [];
      for (const constructor of constructors) {
        const fact = source.sourceFacts.getFact(constructor, providerVirtualDeclarationFactKey);
        const resolved = request.providers.resolveSignature(fact);
        assert.equal(fact?.signatureId !== undefined && fact?.exportId === bindingFact.exportId &&
          resolved.kind === "resolved" && resolved.relations.length === 1 &&
          resolved.relations[0].kind === "signature" && resolved.relations[0].targetMember.kind === "constructor" &&
          resolved.relations[0].receiver.kind === "none" &&
          resolved.relations[0].targetBinding.id === nativeType.relations[0].targetBinding.id, true,
        "each native signature retains the exact owning physical constructor relation");
        accessibilities.push(resolved.relations[0].targetMember.csharpConstructorAccessibility);
      }
      assert.equal(accessibilities.filter(accessibility => accessibility === "public").length, 3,
        "the three public native Exception constructors remain available");
      assert.equal(accessibilities.filter(accessibility => accessibility === "protected").length, 1,
        "the inheritable protected native Exception constructor is also retained");
      assert.equal(accessibilities.length, 4, "no other Exception constructor is exposed");

      const foreignClass = source.syntax.statements(file).find(node => node !== undefined &&
        source.syntax.is.IsClassDeclaration(node) && source.syntax.text(source.syntax.name(node)) === "ForeignDerived");
      assert.equal(foreignClass !== undefined, true, "the same-signature foreign base is present");
      const foreignHeritage = source.facts.objects.heritage(foreignClass);
      assert.equal(Array.isArray(foreignHeritage), true, "the foreign base still has published heritage");
      const foreignEdge = foreignHeritage.find(candidate => candidate.kind === "extends");
      assert.equal(foreignEdge !== undefined, true, "the foreign checked heritage edge is present");
      const foreignExpression = source.syntax.as.AsExpressionWithTypeArguments(foreignEdge.heritage)?.Expression;
      const foreign = foreignExpression === undefined ? undefined : source.facts.navigation.identity.target(foreignExpression)?.declaration;
      assert.equal(foreign !== undefined && source.syntax.is.IsVariableDeclaration(foreign), true,
        "the foreign base is an actual checked binding, not a fabricated source node");
      const unownedProvider = {
        resolveSignature() { assert.fail("an unowned value cannot trigger target signature resolution"); },
        resolveType() { assert.fail("an unowned value cannot trigger target type resolution"); },
      };
      assert.equal(createCsharpSourceProfileStorageEffects(source, unownedProvider)
        .nativeConstructorsFor(derived) === undefined, true,
      "a project class cannot acquire a native provider terminal");
      assert.equal(createCsharpSourceProfileStorageEffects(source, unownedProvider)
        .nativeConstructorsFor(foreign) === undefined, true,
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
        .nativeConstructorsFor(binding) === undefined, true,
      "an otherwise identical foreign export cannot borrow the native terminal");
      const foreignSignature = alteredSource(constructors[0], fact => ({ ...fact, signatureId: `${fact.signatureId}:foreign` }));
      const exactProvider = {
        resolveType: fact => request.providers.resolveType(fact),
        resolveSignature: fact => fact.signatureId?.endsWith(":foreign")
          ? { kind: "missing", reason: "the foreign signature is not registered" }
          : request.providers.resolveSignature(fact),
      };
      assert.equal(createCsharpSourceProfileStorageEffects(foreignSignature, exactProvider)
        .nativeConstructorsFor(binding) === undefined, true,
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
        .nativeConstructorsFor(binding) === undefined, true,
      "a constructor and source type mapped to different native owners cannot share a terminal");
      const missingProvider = {
        resolveType: fact => request.providers.resolveType(fact),
        resolveSignature: () => ({ kind: "missing", reason: "no exact native signature" }),
      };
      assert.equal(createCsharpSourceProfileStorageEffects(source, missingProvider)
        .nativeConstructorsFor(binding) === undefined, true,
      "unresolved provider signatures never acquire a physical native terminal");
      const ambiguousProvider = { resolveType: fact => request.providers.resolveType(fact), resolveSignature(fact) {
        const result = request.providers.resolveSignature(fact);
        return result.kind !== "resolved" ? result : { ...result, relations: [...result.relations, ...result.relations] };
      } };
      assert.equal(createCsharpSourceProfileStorageEffects(source, ambiguousProvider)
        .nativeConstructorsFor(binding) === undefined, true,
      "ambiguous native relations cannot choose a first constructor");
      const factoryProvider = { resolveType: fact => request.providers.resolveType(fact), resolveSignature(fact) {
        const result = request.providers.resolveSignature(fact);
        return result.kind !== "resolved" ? result : { ...result, relations: result.relations.map(relation => ({
          ...relation, targetMember: { ...relation.targetMember,
            csharpInvocation: { kind: "static-factory-construction", factoryType: nativeType.relations[0].targetBinding.csharpType } },
        })) };
      } };
      assert.equal(createCsharpSourceProfileStorageEffects(source, factoryProvider)
        .nativeConstructorsFor(binding) === undefined, true,
      "a factory is not an inheritable physical constructor");
      const direct = source.syntax.statements(file).find(node => node !== undefined &&
        source.syntax.is.IsFunctionDeclaration(node) && source.syntax.text(source.syntax.name(node)) === "direct");
      assert.equal(direct !== undefined, true, "the checked direct native construction exists");
      let invocation;
      const visit = node => {
        if (source.syntax.is.IsNewExpression(node)) invocation = node;
        source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); });
      };
      visit(direct);
      assert.equal(invocation !== undefined, true, "the checked native construction retains its call node");
      const call = source.facts.selections.call(invocation);
      assert.equal(call?.kind, "construction", "the actual native construction has its published selection");
      assert.equal(call.arguments.length, 2, "the original native reference argument remains present");
      assert.equal(effects.call(invocation, call) === undefined, true,
        "a native inheritance terminal does not claim purity, argument preservation or a fresh-value effect");
      return constructors.length;
    });
    assert.equal(observed.compiled.sourceDiagnosticsText, "", "the exact native source is accepted by the checker");
    assert.equal(observed.value > 0, true, "the native provider constructor control ran");
  });

  test(`${surface} native Attribute publishes its protected inheritable constructor`, () => {
    const observed = withCsharpSessionRequest({ surface, sourceText: `
      import { Attribute } from "@tsonic/dotnet/System.js";
      export class NativeAttribute extends Attribute { constructor() { super(); } }
    ` }, request => {
      const source = request.input.source;
      const file = source.sourceFiles.find(candidate => source.syntax.getFileName(candidate) === "/project/index.ts");
      assert.equal(file !== undefined, true, "the checked project file exists");
      const derived = source.syntax.statements(file).find(node => node !== undefined &&
        source.syntax.is.IsClassDeclaration(node) && source.syntax.text(source.syntax.name(node)) === "NativeAttribute");
      assert.equal(derived !== undefined, true, "the native Attribute subclass is checked");
      const heritage = source.facts.objects.heritage(derived);
      assert.equal(Array.isArray(heritage), true, "the native Attribute base is published");
      const edge = heritage.find(candidate => candidate.kind === "extends");
      assert.equal(edge !== undefined, true, "the checked extends edge exists");
      const expression = source.syntax.as.AsExpressionWithTypeArguments(edge.heritage)?.Expression;
      const binding = expression === undefined ? undefined : source.facts.navigation.identity.target(expression)?.declaration;
      assert.equal(binding !== undefined && source.syntax.is.IsClassDeclaration(binding), true,
        "the base resolves to its provider-owned class");
      const constructors = createCsharpSourceProfileStorageEffects(source, request.providers)
        .nativeConstructorsFor(binding);
      assert.equal(constructors?.length, 1, "the protected native constructor is retained exactly once");
      const fact = source.sourceFacts.getFact(constructors[0], providerVirtualDeclarationFactKey);
      const resolved = request.providers.resolveSignature(fact);
      assert.equal(resolved.kind === "resolved" && resolved.relations.length === 1 &&
        resolved.relations[0].kind === "signature" &&
        resolved.relations[0].targetMember.csharpConstructorAccessibility === "protected", true,
      "the selected constructor retains its actual protected physical access");
    });
    assert.equal(observed.compiled.sourceDiagnosticsText, "", "the derived super call is checked");
  });
}
