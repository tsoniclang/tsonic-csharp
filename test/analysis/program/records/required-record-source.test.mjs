import assert from "node:assert/strict";
import test from "node:test";
import { createSourceStorageQuery } from "@tsonic/target-api/analysis";
import { analyzeCsharpNativeParticipation } from "../../../../dist/analysis/callables/participation.js";
import { assertCsharpRequiredRecords } from "../../../../dist/analysis/program/records/required-records.js";
import { createCsharpProjectTypeCatalog } from "../../../../dist/analysis/project-types/catalog.js";
import { analyzeCsharpClassFactories } from "../../../../dist/analysis/project-types/class-factories.js";
import { analyzeCsharpStorage } from "../../../../dist/analysis/storage/analyze.js";
import { createCsharpSourceProfileStorageEffects } from "../../../../dist/policy/operations/source-profiles/source-storage-effects.js";
import { targetTypeRefEquals } from "../../../../dist/target-model/types/equality.js";
import { compileCsharpRequiredRecordSource, csharpRequiredRecordFailure } from "../../../helpers/required-records.mjs";
import { createExpectedNativeUseOwner } from "../../../helpers/expected-native-uses.mjs";
import { getCsharpLambdaSignature } from "../../../../dist/target-model/types/carriers/delegates.js";

const sourceText = `
  import type { int32 } from "@tsonic/core/types.js";
  export function apply(mapper: (left: int32, right: int32) => int32, input: int32): int32 {
    return mapper(input, input);
  }
  export function run(seed: int32): int32 {
    class First {
      value: int32;
      constructor(value: int32) { this.value = value; }
    }
    class Second {
      value: int32;
      constructor(value: int32) { this.value = value; }
    }
    const first = new First(seed);
    const second = new Second(seed);
    return apply((left, right) => left + right + first.value + second.value, seed);
  }
`;

function sameRows(rows, subjects, family, construct, producer) {
  return rows.length === subjects.length && rows.every((row, index) => row.subject === subjects[index] &&
    row.family === family && row.construct === construct && row.producer === producer);
}

function sameType(left, right) {
  return left === undefined ? right === undefined : right !== undefined && targetTypeRefEquals(left, right);
}

function classFactoryInputs(source, program) {
  const records = program.records;
  const catalog = createCsharpProjectTypeCatalog({
    ast: source.ast, navigation: source.navigation, sourceFacts: source.sourceFacts, semanticsFor: source.semantics.forNode,
  }, { genericProjection: records.genericProjection, outerGenericProjection: records.outerGenericProjection });
  const names = Object.freeze({ temporaryName: preferred => preferred, resolve: program.names.resolve });
  return { catalog, names, local: catalog.definitions.filter(definition => definition.local).map(definition => definition.declaration) };
}

for (const surface of ["native", "js"]) {
  const { compiled, source, program, nodes } = compileCsharpRequiredRecordSource(sourceText, surface);
  const { ast } = source;
  const records = program.records;

  test(`${surface}: the class-factory owner registers every local class definition before its factory`, () => {
    const { catalog, names, local } = classFactoryInputs(source, program);
    assert.equal(local.length === 2 && local.every(node => ast.is.IsClassDeclaration(node)), true, "two local class definitions");
    const rows = [];
    const index = analyzeCsharpClassFactories(source, catalog, records, records, names, rows);
    assert.equal(index.issues.length === 0, true, "both local classes close");
    assert.equal(sameRows(rows, local, "classFactory", "local class definition", "analyzeCsharpClassFactories"), true,
      "one row per local definition, in catalog order");
    assert.equal(index.factories.length === program.classFactories.length &&
      index.factories.every((factory, position) => factory.declaration === program.classFactories[position].declaration), true,
      "the owner selects the published factories again");
    assertCsharpRequiredRecords(records, rows);
  });

  test(`${surface}: a local class registers before its owning issue, independent of a successful write`, () => {
    const { catalog, names, local } = classFactoryInputs(source, program);
    const rows = [];
    const evidence = Object.freeze({ ...records, classConstructorType: Object.freeze({ get: () => undefined }) });
    const index = analyzeCsharpClassFactories(source, catalog, evidence, records, names, rows);
    assert.equal(index.factories.length === 0 && index.issues.length === 2 &&
      index.issues.every((issue, position) => issue.code === "CSHARP_CLASS_FACTORY_NOT_CLOSED" && issue.node === local[position]), true,
      "each unclosed local class carries its ordinary owning issue");
    assert.equal(sameRows(rows, local, "classFactory", "local class definition", "analyzeCsharpClassFactories"), true,
      "registration does not depend on the factory write");
    assert.throws(() => assertCsharpRequiredRecords(Object.freeze({ ...records, classFactory: index.classFactory }), rows),
      error => csharpRequiredRecordFailure(error, "classFactory", local[0], "local class definition", "analyzeCsharpClassFactories"),
      "without the owning rejection the missing factory fails the seal at its definition");
  });

  test(`${surface}: the participation owner registers each native participation decision`, () => {
    const storage = createSourceStorageQuery(source, program.sourceFiles, undefined, createCsharpSourceProfileStorageEffects(source));
    assert.equal(storage.failureReason() === undefined, true, "bounded owned source domain");
    const rows = [];
    const participation = analyzeCsharpNativeParticipation({
      ast, nodes: storage.nodes, navigation: source.navigation,
      captureClosure: records.captureClosure, lambdaCreation: records.lambdaCreation,
      objectShapes: program.objectShapes, compileTimeMetadata: records.compileTimeMetadata, requiredRecords: rows,
    }).participation;
    assert.equal(storage.nodes.every(node => participation.get(node) === records.nativeParticipation.get(node)), true,
      "the owner selects the published participation again");
    const selected = storage.nodes.filter(node => participation.get(node) !== undefined);
    assert.equal(sameRows(rows, selected, "nativeParticipation", "native participation decision", "analyzeCsharpNativeParticipation"), true,
      "one row per participation decision, in source order");
    assert.equal(["KindFunctionDeclaration", "KindConstructor", "KindArrowFunction", "KindFunctionType"].every(kind =>
      rows.some(row => ast.kindName(row.subject) === kind)), true, "body, lambda and erased signature decisions all register");
    assert.equal(rows.every(row => !ast.is.IsClassDeclaration(row.subject) && !ast.is.IsParameterDeclaration(row.subject)), true,
      "undecided nodes register nothing");
    assertCsharpRequiredRecords(records, rows);
  });

  test(`${surface}: the storage owner registers required storage only for adapted lambda parameters`, () => {
    const rows = [];
    const policy = Object.freeze({
      ast, sourceFiles: program.sourceFiles, sourceFacts: source.sourceFacts, navigation: source.navigation,
      typeDefinitions: program.typeDefinitions, semanticsFor: source.semantics.forNode,
    });
    const expected = createExpectedNativeUseOwner(compiled).analysis;
    const declarations = new Map(nodes.filter(node => ast.is.IsArrowFunction(node)).map(declaration => {
      const signature = getCsharpLambdaSignature(records.callableTarget.get(declaration));
      assert.equal(signature !== undefined, true, "each adapted lambda has its exact published signature");
      const parameters = Object.freeze(ast.parameters(declaration).map((parameter, index) => {
        const type = records.lambdaParameterType.get(parameter);
        assert.equal(type !== undefined && targetTypeRefEquals(type, signature.parameters[index]), true,
          "the callable contract carries the published parameter correspondence");
        return Object.freeze({ sourceParameter: parameter,
          targetParameter: Object.freeze({ type, passingMode: signature.parameterPassingModes[index] }) });
      }));
      return [declaration, Object.freeze({ sourceDeclaration: declaration,
        methodTypeParameterIdentities: Object.freeze([]), methodAllowsRefLikeTypeArguments: Object.freeze([]), parameters, returnType: signature.returnType })];
    }));
    const callables = Object.freeze({ contracts: Object.freeze([...declarations.values()]),
      declarationContracts: Object.freeze([...declarations.values()]), closedInputType: () => undefined,
      get: identity => identity.kind === "declaration" ? declarations.get(identity.declaration) : undefined });
    const operations = Object.freeze({ ...records, typedLocation: Object.freeze({ get: node => {
      const selected = records.nativeHandler.get(node);
      return selected?.kind === "typed-location" ? selected.selection : undefined;
    } }) });
    const storage = analyzeCsharpStorage(policy, records, operations, program.objectShapes, expected, records, records,
      callables, records, rows);
    assert.equal(storage.issues.length === 0, true, "the owner closes this source without issues");
    assert.equal(nodes.every(node => sameType(storage.lambdaParameterType.get(node), records.lambdaParameterType.get(node)) &&
      sameType(storage.requiredStorageType.get(node), records.requiredStorageType.get(node))), true,
      "the owner selects the published adaptations and required storage again");
    const adapted = nodes.filter(node => storage.lambdaParameterType.get(node) !== undefined);
    assert.equal(adapted.length === 2 && adapted.every(node => ast.is.IsParameterDeclaration(node) && ast.is.IsArrowFunction(ast.parent(node))),
      true, "the two lambda parameters are adapted");
    assert.equal(sameRows(rows, adapted, "requiredStorageType", "adapted lambda parameter", "analyzeCsharpStorage"), true,
      "one row per adapted lambda parameter");
    const ordinary = nodes.filter(node => ast.is.IsParameterDeclaration(node) &&
      (ast.is.IsFunctionDeclaration(ast.parent(node)) || ast.is.IsConstructorDeclaration(ast.parent(node))));
    assert.equal(ordinary.length === 5 && ordinary.every(node => !rows.some(row => row.subject === node)), true,
      "ordinary parameters register no lambda adaptation");
    assertCsharpRequiredRecords(records, rows);
  });
}
