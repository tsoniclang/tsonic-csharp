import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram, Node_Expression } from "@tsonic/target-api/source";
import { createSourceStorageQuery } from "@tsonic/target-api/analysis";
import { captureTargetCapabilityContributions } from "../../../../tsonic/packages/host/dist/target/extensions.js";
import { nativeRetainedErrorFlowSource } from "../../../../tsonic/test/fixtures/native-retained-errors.mjs";
import { createTsonicPlugin } from "../../../../csharp-nodejs/dist/index.js";
import {
  assertCsharpCheckingSucceeded,
  assertCsharpCompilationSucceeded,
  checkCsharpSource,
  compileCsharpSource,
} from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpTargetProgram } from "../../../dist/analysis/program/index.js";
import { createCsharpErrorStorageDemandQuery } from "../../../dist/analysis/objects/error-storage-demands.js";
import { createCsharpTargetConfiguration } from "../../../dist/options/csharp-target-options.js";
import { collectCsharpCapabilityContributions } from "../../../dist/providers/native/contributions.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/relations/resolver.js";
import { csharpExceptionTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

test("retained-provider catch reads select exact readonly C# Error flow and observation facts", () => {
  const capability = createTsonicPlugin();
  const checked = checkCsharpSource({ surface: "js", capabilities: [capability], sourceText: nativeRetainedErrorFlowSource });
  assertCsharpCheckingSucceeded(checked);
  const source = createTargetSourceProgram(checked.source);
  const contributions = collectCsharpCapabilityContributions(captureTargetCapabilityContributions({
    project: checked.project,
    projectDirectory: checked.paths.projectRoot,
    target: checked.target,
    selectedCapabilities: [capability],
    selectedSurfaces: checked.targetPack.surfaces.filter(surface => surface.id === "js"),
  }));
  const analysis = analyzeCsharpTargetProgram({
    input: { source, sourcePackages: checked.sourcePackages, project: checked.project, target: checked.target,
      runtimeActivatedCapabilityIds: [], runtimeReferences: [], paths: checked.paths },
    configuration: createCsharpTargetConfiguration(checked.target, checked.paths.projectRoot, checked.paths.targetOutputRoot),
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: contributions.providerPolicies }),
    binaryExecutionDriver: contributions.binaryExecutionDriver,
  });
  assert.equal(analysis.kind, "resolved", "C# retained Error source has one closed target analysis");
  assert.equal(analysis.diagnostics.length, 0, "C# retained Error analysis has no diagnostics");
  const program = analysis.value;
  const storage = createSourceStorageQuery(source, source.navigation.sourceFiles);
  const demands = createCsharpErrorStorageDemandQuery(source, storage);
  const { ast } = source;
  const exception = csharpExceptionTargetType();
  const projections = [];
  const properties = [];
  const equalities = [];
  let catchDeclaration;
  let originalDeclaration;
  const visit = node => {
    if (ast.is.IsCatchClause(node)) catchDeclaration = ast.as.AsCatchClause(node).VariableDeclaration;
    if (ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "original") originalDeclaration = node;
    const projection = program.sourceEvidence.valueRefinement(node);
    if (ast.is.IsIdentifier(node) && ast.text(node) === "failure" &&
      projection?.flowReadTargetType !== undefined && targetTypeRefEquals(projection.flowReadTargetType, exception)) {
      projections.push(projection);
    }
    const property = program.operations.property(node)?.selection;
    if (property?.kind === "resolved" && ast.text(property.source.receiver.expression) === "failure") properties.push(property);
    const equality = program.operations.binary(node)?.target;
    if (equality?.kind === "resolved" && equality.targetOperation.kind === "reference-identity") equalities.push(equality);
    for (const child of ast.children(node)) visit(child);
  };
  for (const file of source.navigation.sourceFiles) visit(file);
  assert.equal(catchDeclaration !== undefined, true, "exact catch declaration exists");
  assert.equal(originalDeclaration !== undefined, true, "exact original Error declaration exists");
  assert.equal(demands.fieldWrites.length, 0, "readonly observations do not demand mutable Error storage");
  assert.equal(demands.nativeConstructors.length, 1, "one authored original Error constructor");
  assert.equal(demands.storageFor(originalDeclaration).kind, "immutable", "original Error has no field-write demand");
  assert.equal(demands.storageFor(catchDeclaration).kind, "immutable", "caught Error has no field-write demand");
  assert.equal(projections.length, 4, "identity and three Error observations retain exact native flow");
  for (const projection of projections) {
    assert.equal(projection.source.kind, "resolved", "caught Error flow has finalized source evidence");
    assert.equal(projection.source.reference.declaration === catchDeclaration, true, "caught Error flow uses the exact catch owner");
    assert.equal(projection.selectedTargetType !== undefined, true, "caught Error flow retains its native carrier");
    assert.equal(targetTypeRefEquals(projection.selectedTargetType, exception), true, "readonly Error selects native Exception");
  }
  assert.deepEqual(properties.map(property => property.targetMember.sourceName).sort(), ["message", "name", "stack"]);
  assert.deepEqual(properties.map(property => property.targetMember.id).sort(), [
    "System.Exception.Message", "Tsonic.CSharp.Runtime.ErrorObject.name", "Tsonic.CSharp.Runtime.ErrorObject.stack",
  ]);
  for (const property of properties) {
    assert.equal(property.origin, "source-profile", "Error observation uses the selected source profile");
    assert.equal(property.source.accessMode, "read", "Error observation is readonly");
    const receiver = program.sourceEvidence.nodeTargetType(property.source.receiver.expression);
    assert.equal(receiver !== undefined, true, "Error observation retains its selected receiver carrier");
    assert.equal(targetTypeRefEquals(receiver, exception), true,
      "Error observation reads the narrowed native Exception");
  }
  assert.equal(equalities.length, 1, "one native reference-identity comparison");
  assert.equal(equalities[0].targetOperation.negated, false, "original Error identity is not negated");
  assert.equal(source.navigation.referenceFor(equalities[0].left)?.declaration === catchDeclaration, true,
    "native equality reads the exact caught Error owner");
  assert.equal(source.navigation.referenceFor(equalities[0].right)?.declaration === originalDeclaration, true,
    "native equality reads the exact original Error owner");
  assert.equal(ast.text(Node_Expression(ast, demands.nativeConstructors[0])), "Error");
});

test("retained-provider readonly Error identity and member observations lower through exact C# flow", () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [createTsonicPlugin()], sourceText: nativeRetainedErrorFlowSource });
  assertCsharpCompilationSucceeded(compiled);
  assert.equal(compiled.artifacts.has("src/Index.cs"), true, "retained Error source emits its C# module");
});
