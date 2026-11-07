// Representation test fixture (nextgen C-2542, writer C3). A real TypeScript program goes through the Host
// (createHostSourceProgram + the JS API profile); tests read ONLY its SourceProgramFacts and the authored-syntax
// reader, and drive the one descriptor -> TargetTypeRef mapping (representation/, I6) with them.
// Target catalogs the program does not need fail when reached, so a test proves which inputs its mapping reads.
import assert from "node:assert/strict";
import { checkCsharpSource } from "../helpers/direct-csharp-session.mjs";
import { createHostSourceProgram } from "../../../tsonic/packages/target-api/dist/public/host.js";
import { createJsSourceApiFacts } from "../../../tsonic/packages/js-source-profile/dist/index.js";
import { tsonicCoreSourceAnalyses } from "@tsonic/source-core";
import {
  createCsharpRepresentationServices,
  csharpRepresentationContext,
  isCsharpRefusal,
  representCallableReturn,
  representSlot,
  representSourceSum,
  representSourceType,
  representValue,
} from "../../dist/representation/index.js";
import { createCsharpProviderRelationResolver } from "../../dist/providers/native/projection/relation-resolution.js";
import { createCsharpTypeDefinitionRegistry } from "../../dist/analysis/project-types/type-definitions.js";
import { csharpTargetNamedType } from "../../dist/target-model/types/factories.js";

/** Checks `sourceText` with the real C# surface packages and builds its Host program (facts + syntax). */
export function hostProgram(sourceText, options = {}) {
  const checked = checkCsharpSource({ ...options, sourceText });
  assert.equal(checked.sourceDiagnosticsText, "", `the fixture program checks cleanly:\n${checked.sourceDiagnosticsText}`);
  // The composition root's options (tsonic/packages/host/src/build.ts): the JS API profile and the source-core analyses
  // (run 1 C1: the production program always registers source-core; a fixture without it is not a program C# receives).
  const host = createHostSourceProgram(checked.source, { profile: createJsSourceApiFacts, analyses: [tsonicCoreSourceAnalyses],
    platform: { kind: "known", nativeIntegerBits: 64, basis: "test" } });
  const ast = host.ast;
  const files = host.sourceFiles.filter(file => !ast.isDeclarationFile(file));
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  files.forEach(visit);
  const named = (name, predicate = () => true) => {
    const found = nodes.filter(node => {
      const declarationName = isNamedDeclaration(ast, node) ? ast.name(node) : undefined;
      return declarationName !== undefined && ast.text(declarationName) === name && predicate(node);
    });
    assert.equal(found.length, 1, `exactly one declaration named '${name}'`);
    return found[0];
  };
  const byText = (text, predicate = () => true) => {
    const found = nodes.filter(node => ast.text(node) === text && predicate(node));
    assert.equal(found.length >= 1, true, `a node with text '${text}'`);
    return found[0];
  };
  const resolved = outcome => {
    assert.notEqual(outcome, undefined, "the Host publishes an outcome for every value node (I4)");
    if (outcome.kind === "refused") assert.fail(`unexpected Host refusal ${outcome.code}: ${outcome.message}`);
    return outcome.type;
  };
  return Object.freeze({
    checked, host, facts: host.facts, ast, files, nodes, named, byText,
    /** facts.values.type(node), required to be published (not refused). */
    type: node => resolved(host.facts.values.type(node)),
    /** facts.values.callableReturn(declaration), required to be published. */
    callableReturn: declaration => resolved(host.facts.values.callableReturn(declaration)),
    /** facts.values.slot(slot).type, required to be published. */
    slot: slot => resolved(host.facts.values.slot(slot)),
    /** facts.sums.sumOf(descriptor), required to be a closed sum. */
    sum: descriptor => {
      const sum = host.facts.sums.sumOf(descriptor);
      assert.notEqual(sum, undefined, "a union descriptor denotes a published closed sum");
      return sum;
    },
  });
}

function isNamedDeclaration(ast, node) {
  return ast.is.IsFunctionDeclaration(node) || ast.is.IsVariableDeclaration(node) || ast.is.IsClassDeclaration(node) ||
    ast.is.IsInterfaceDeclaration(node) || ast.is.IsTypeAliasDeclaration(node) || ast.is.IsEnumDeclaration(node) ||
    ast.is.IsParameterDeclaration(node) || ast.is.IsMethodDeclaration(node) || ast.is.IsPropertyDeclaration(node) ||
    ast.is.IsPropertySignatureDeclaration(node) || ast.is.IsMethodSignatureDeclaration(node) ||
    ast.is.IsTypeParameterDeclaration(node);
}

/**
 * Project types of the fixture program as generated .NET types `global::Fixture.<Name>` (classes, interfaces, enums
 * declared in the project files). Stands in for the C# project-type catalog (F5) whose naming is not under test here.
 */
export function fixtureProjectTypes(program) {
  const { ast, nodes } = program;
  const declarations = nodes.filter(node => ast.is.IsClassDeclaration(node) || ast.is.IsInterfaceDeclaration(node) ||
    ast.is.IsEnumDeclaration(node));
  const id = declaration => `global::Fixture.${ast.text(ast.name(declaration))}`;
  const definitions = new Map(declarations.map(declaration => [declaration, Object.freeze({
    id: id(declaration),
    declaration,
    sourceName: ast.text(ast.name(declaration)),
    kind: ast.is.IsClassDeclaration(declaration) ? "class" : ast.is.IsInterfaceDeclaration(declaration) ? "interface" : "enum",
    outerTypeParameters: Object.freeze([]),
    typeParameters: Object.freeze([...ast.typeParameters(declaration)]),
    outerTypeProjections: Object.freeze([]),
    typeProjections: Object.freeze([]),
  })]));
  const byId = new Map([...definitions.values()].map(definition => [definition.id, definition]));
  return Object.freeze({
    definitions: Object.freeze([...definitions.values()]),
    issues: Object.freeze([]),
    definitionForId: value => byId.get(value),
    definitionForDeclaration: declaration => definitions.get(declaration),
    definitionContainingDeclaration: declaration => definitions.get(declaration),
    definitionForTarget: type => type?.kind === "target-named" ? byId.get(type.id) : undefined,
    targetTypeForDeclaration: (declaration, typeArguments) => {
      const definition = definitions.get(declaration);
      return definition === undefined ? undefined : csharpTargetNamedType(definition.id,
        typeArguments.length === 0 ? undefined : typeArguments, undefined,
        { allowsRefLikeTypeArguments: typeArguments.map(() => false) });
    },
  });
}

/**
 * Representation services over the fixture program. `overrides` replaces any input (projectTypes, providers, shapes,
 * memoryBindings, objectMethodSources, captureInitialization, genericProjections, profile, platform).
 */
export function representationServices(program, overrides = {}) {
  const unreached = input => () => assert.fail(`This representation fixture does not supply ${input}.`);
  return createCsharpRepresentationServices({
    facts: program.facts,
    platform: Object.freeze({ nativeInteger: Object.freeze({ kind: "known", nativeIntegerBits: 64, basis: "test" }), targetFramework: "net10.0" }),
    profile: "native",
    syntax: program.ast,
    sourceFacts: program.host.sourceFacts,
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
    projectTypes: fixtureProjectTypes(program),
    memoryBindings: Object.freeze({ hasBoundField: () => false }),
    objectMethodSources: Object.freeze({ get: unreached("object-literal method sources") }),
    captureInitialization: unreached("capture initialization"),
    shapes: Object.freeze({ retainShape: shape => shape, resolveCallableValue: unreached("callable shape values") }),
    typeDefinitions: createCsharpTypeDefinitionRegistry(),
    genericProjections: () => [],
    ...overrides,
  });
}

/** One-call helpers over a services object: each returns the CsharpRepresentation / CsharpValueRepresentation. */
export function representations(services) {
  const at = (occurrence, position = "value") => csharpRepresentationContext(services, occurrence, position);
  return Object.freeze({
    at,
    type: (descriptor, occurrence, position) => representSourceType(descriptor, at(occurrence, position)),
    sum: (sum, occurrence, position) => representSourceSum(sum, at(occurrence, position)),
    value: node => representValue(node, at(node, "value")),
    slot: slot => representSlot(slot, at(slot, "storage")),
    callableReturn: declaration => representCallableReturn(declaration, at(declaration, "return")),
  });
}

/** The represented .NET type; fails the test on a CSHARP_ refusal or a forwarded Host refusal. */
export function represented(value) {
  assert.notEqual(value, undefined);
  if (isCsharpRefusal(value) || value.kind === "refused") assert.fail(`unexpected refusal ${value.code}: ${value.message}`);
  return value;
}
