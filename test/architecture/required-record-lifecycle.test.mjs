import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = join(repositoryRoot, "src");
const paths = Object.freeze({
  analyze: "src/analysis/program/analyze.ts",
  create: "src/analysis/program/records/create.ts",
  classFactories: "src/analysis/project-types/class-factories.ts",
  storage: "src/analysis/storage/analyze.ts",
  participation: "src/analysis/callables/participation.ts",
  operations: "src/analysis/operations/analyze.ts",
  nativeHandlers: "src/analysis/operations/native-handlers.ts",
  nativeDemand: "src/analysis/operations/native-demand.ts",
  bindingPatterns: "src/analysis/control-flow/binding-patterns.ts",
  conversions: "src/analysis/conversions/analyze.ts",
  conversionModel: "src/analysis/conversions/model.ts",
  conversionUses: "src/analysis/conversions/use-admission.ts",
  nativeValues: "src/analysis/objects/value-carriers.ts",
  artifactDemand: "src/analysis/objects/native-demand.ts",
});
const checked = createCompilerSessionFromFiles({
  currentDirectory: "/csharp",
  files: Object.fromEntries(Object.values(paths).map(path => [`/csharp/${path}`, readFileSync(join(repositoryRoot, path), "utf8")])),
  compilerOptions: { noLib: true, noResolve: true, target: "esnext" },
}).checkSource();
const { ast } = checked;
const file = path => checked.getSourceFile(`/csharp/${path}`);

function descendants(root) {
  const nodes = [];
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    nodes.push(node);
    const children = [];
    ast.forEachChild(node, child => { if (child !== undefined) children.push(child); });
    pending.push(...children.reverse());
  }
  return nodes;
}

function text(node) {
  const range = node === undefined ? undefined : ast.authoredRange(node);
  return range?.kind === "authored" ? ast.getSourceText(ast.getSourceFile(node)).slice(range.start, range.end) : undefined;
}
const position = node => ast.pos(node);
const named = (node, name) => text(ast.name(node)) === name;

function functionNamed(path, name) {
  const found = descendants(file(path)).filter(node => ast.is.IsFunctionDeclaration(node) && named(node, name));
  assert.equal(found.length === 1, true, `${path}: exactly one function ${name}`);
  return found[0];
}

function callsTo(root, callee) {
  return descendants(root).filter(node => ast.is.IsCallExpression(node) && text(ast.as.AsCallExpression(node).Expression) === callee);
}

function composedCall(callee, composer, label) {
  const calls = callsTo(file(paths.analyze), callee);
  assert.equal(calls.length === 1, true, `${label}: exactly one ${callee} call in analyze.ts`);
  assert.equal(descendants(composer).includes(calls[0]), true, `${label}: the ${callee} call is inside its composing function`);
  return calls[0];
}

function encloses(ancestor, node) {
  let current = node;
  while (current !== undefined && current !== ancestor) current = ast.parent(current);
  return current === ancestor;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.isFile() && path.endsWith(".ts") ? [path] : [];
  });
}

function identifiers(root, name) {
  return descendants(root).filter(node => ast.is.IsIdentifier(node) && text(node) === name);
}

function property(objectLiteral, name) {
  return ast.properties(objectLiteral).find(candidate => named(candidate, name));
}

function ownDeclaration(statement, name) {
  return !ast.is.IsVariableStatement(statement) ? undefined : descendants(statement).find(node =>
    ast.is.IsVariableDeclaration(node) && named(node, name) && ast.parent(ast.parent(node)) === statement);
}

function topLevelIndex(statements, predicate, label) {
  const index = statements.findIndex(predicate);
  assert.equal(index >= 0, true, `${label}: statement present`);
  return index;
}

const iteration = functionNamed(paths.analyze, "analyzeIteration");
const program = functionNamed(paths.analyze, "analyzeCsharpTargetProgram");
const evaluate = descendants(program).find(node => ast.is.IsMethodDeclaration(node) && named(node, "evaluate"));
const programStatements = ast.statements(ast.body(program));

test("the requirement list is declared once, as the first statement of analyzeIteration", () => {
  const first = ast.statements(ast.body(iteration))[0];
  const declarations = descendants(file(paths.analyze))
    .filter(node => ast.is.IsVariableDeclaration(node) && named(node, "requiredRecords"));
  assert.equal(declarations.length === 1, true, "first statement: one requiredRecords declaration in analyze.ts");
  const [declaration] = declarations;
  const initializer = ast.as.AsVariableDeclaration(declaration).Initializer;
  assert.equal(ast.is.IsVariableStatement(first) && descendants(first).includes(declaration), true,
    "first statement: the declaration is the first statement of analyzeIteration");
  assert.equal(ast.variableDeclarationKind(declaration) === "const" &&
    text(ast.as.AsVariableDeclaration(declaration).Type) === "CsharpRequiredRecord[]" &&
    ast.is.IsArrayLiteralExpression(initializer) && ast.elements(initializer).length === 0, true,
    "first statement: a fresh empty const CsharpRequiredRecord[] list");
});

test("analyzeIteration passes its list to storage and operations and returns it as iteration state", () => {
  const storage = composedCall("analyzeCsharpStorage", iteration, "storage");
  const storageArguments = ast.arguments(storage);
  assert.equal(text(storageArguments.at(-1)) === "requiredRecords" && ast.is.IsIdentifier(storageArguments.at(-1)), true,
    "storage: the list is the last argument of analyzeCsharpStorage");
  const operations = composedCall("analyzeCsharpTargetOperations", iteration, "operations");
  const operationsList = ast.arguments(operations).at(-1);
  assert.equal(ast.is.IsIdentifier(operationsList) && text(operationsList) === "requiredRecords", true,
    "operations: the same list is the last argument of analyzeCsharpTargetOperations");
  const returned = ast.statements(ast.body(iteration)).at(-1);
  const shorthand = descendants(returned).filter(node => ast.is.IsShorthandPropertyAssignment(node) && named(node, "requiredRecords"));
  assert.equal(ast.is.IsReturnStatement(returned) && shorthand.length === 1, true,
    "iteration state: the final return carries the list as requiredRecords");
  for (const callee of ["analyzeCsharpClassFactories", "analyzeCsharpNativeDemand", "admitCsharpBindingPatterns", "conversionAnalysis.close"]) {
    const call = composedCall(callee, iteration, "iteration state");
    assert.equal(text(ast.arguments(call).at(-1)) === "requiredRecords", true,
      `iteration state: ${callee} receives the same requirement list`);
  }
  const participation = composedCall("analyzeCsharpNativeParticipation", iteration, "iteration state");
  const input = ast.arguments(participation)[0];
  const inputList = input === undefined || !ast.is.IsObjectLiteralExpression(input) ? undefined : property(input, "requiredRecords");
  assert.equal(inputList !== undefined && ast.is.IsShorthandPropertyAssignment(inputList), true,
    "iteration state: participation receives the same requirement list without an alias");
  assert.equal(identifiers(iteration, "requiredRecords").length === 9, true,
    "iteration state: one declaration, seven concrete owning producers and one return carry the same list");
});

test("native handler finalization receives the operations producer's mandatory list before sealing", () => {
  const operations = functionNamed(paths.operations, "analyzeCsharpTargetOperations");
  const parameter = ast.parameters(operations).at(-1);
  assert.equal(named(parameter, "requirements") && ast.as.AsParameterDeclaration(parameter).QuestionToken === undefined &&
    ast.as.AsParameterDeclaration(parameter).Initializer === undefined &&
    text(ast.as.AsParameterDeclaration(parameter).Type) === "CsharpRequiredRecord[]", true,
    "operations: a mandatory requirements parameter");
  const finalizers = callsTo(operations, "analyzeCsharpNativeHandlers");
  const seals = callsTo(operations, "builder.seal");
  assert.equal(finalizers.length === 1 && seals.length === 1, true,
    "operations: exactly one native handler finalizer and one classification seal");
  const forwarded = ast.arguments(finalizers[0]).at(-1);
  assert.equal(ast.is.IsIdentifier(forwarded) && text(forwarded) === "requirements", true,
    "native handler finalization receives the operations producer's same list");
  assert.equal(position(finalizers[0]) < position(seals[0]), true,
    "native handler registration finishes before operations classifications seal");
});

test("the fixed-point attempt returns only its representation contract", () => {
  assert.equal(evaluate !== undefined, true, "fixed-point attempt: one evaluate callback");
  assert.equal(identifiers(evaluate, "requiredRecords").length === 0, true, "fixed-point attempt: the callback never reads the list");
  const contracts = descendants(evaluate).filter(node => ast.is.IsPropertyAssignment(node) && named(node, "contract"));
  assert.equal(contracts.length === 1, true, "fixed-point attempt: one revision contract");
  const literal = descendants(contracts[0]).find(node => ast.is.IsObjectLiteralExpression(node));
  assert.equal(literal !== undefined &&
    ast.properties(literal).map(candidate => text(ast.name(candidate))).join() === "typeProjections,callables,storage", true,
    "fixed-point attempt: the contract holds typeProjections, callables and storage only");
});

test("the late producers and the assembly receive the stable attempt's list", () => {
  const initializer = name => {
    const declarations = programStatements.map(statement => ownDeclaration(statement, name)).filter(node => node !== undefined);
    return declarations.length === 1 ? ast.as.AsVariableDeclaration(declarations[0]).Initializer : undefined;
  };
  const stable = initializer("stable");
  const evaluated = initializer("evaluated");
  const analysis = initializer("analysis");
  assert.equal(stable !== undefined && ast.is.IsNonNullExpression(stable) &&
    callsTo(stable, "closure.program.get").length === 1, true, "stable attempt: stable is the closed fixed-point contract");
  assert.equal(evaluated !== undefined && ast.is.IsCallExpression(evaluated) &&
    text(ast.as.AsCallExpression(evaluated).Expression) === "analyzeIteration" &&
    text(ast.arguments(evaluated).at(-1)) === "stable", true, "stable attempt: evaluated is analyzeIteration over stable");
  assert.equal(text(analysis) === "evaluated.value", true, "stable attempt: analysis is the evaluated result");
  const factories = composedCall("analyzeCsharpClassFactories", iteration, "stable attempt");
  assert.equal(text(ast.arguments(factories).at(-1)) === "requiredRecords", true,
    "stable attempt: class factories complete in the same representation attempt");
  const participation = composedCall("analyzeCsharpNativeParticipation", iteration, "stable attempt");
  const participationInput = ast.arguments(participation)[0];
  const participationList = participationInput === undefined || !ast.is.IsObjectLiteralExpression(participationInput)
    ? undefined : property(participationInput, "requiredRecords");
  assert.equal(participationList !== undefined && ast.is.IsShorthandPropertyAssignment(participationList), true,
    "stable attempt: participation receives the attempt's exact requirement list before physical closure");
  const assembly = composedCall("createCsharpProgramRecords", program, "stable attempt");
  assert.equal(ast.arguments(assembly).length === 2 && text(ast.arguments(assembly)[1]) === "analysis.requiredRecords", true,
    "stable attempt: createCsharpProgramRecords receives analysis.requiredRecords");
  const reads = descendants(program).filter(node => ast.is.IsPropertyAccessExpression(node) && text(node) === "analysis.requiredRecords");
  assert.equal(reads.length === 3 && identifiers(program, "requiredRecords").length === 3, true,
    "stable attempt: final native-value admission, artifact demand and assembly read the completed attempt's list");
  const nativeValues = composedCall("analyzeCsharpNativeValueCarriers", program, "stable attempt");
  assert.equal(text(ast.arguments(nativeValues).at(-1)) === "analysis.requiredRecords", true,
    "the actual native-value producer receives the same stable requirement list");
  const artifacts = composedCall("analyzeCsharpNativeArtifactDemand", program, "stable attempt");
  assert.equal(text(ast.arguments(artifacts).at(-1)) === "analysis.requiredRecords" && position(artifacts) < position(assembly), true,
    "the actual artifact-demand producer registers its exact requirements before the one assembly");
  const demand = composedCall("analyzeCsharpNativeDemand", iteration, "stable attempt");
  const bindings = composedCall("admitCsharpBindingPatterns", iteration, "stable attempt");
  const conversions = composedCall("conversionAnalysis.close", iteration, "stable attempt");
  for (const call of [demand, bindings, conversions]) assert.equal(text(ast.arguments(call).at(-1)) === "requiredRecords", true,
    "each actual native-use admission receives the same attempt-local requirement list");
  const publication = composedCall("conversionAnalysis.seal", iteration, "stable attempt");
  assert.equal(ast.arguments(publication).length === 0 && position(conversions) < position(publication), true,
    "conversion publication reads the already-closed records without a second requirement writer");
  const shapeSeal = composedCall("objectShapes.seal", iteration, "stable attempt");
  const storageSeal = composedCall("sealCsharpStorage", iteration, "stable attempt");
  assert.equal(position(publication) < position(shapeSeal) && position(shapeSeal) < position(storageSeal), true,
    "stable attempt: actual conversion closure precedes the one shape seal and complete physical field closure");
  assert.equal(callsTo(program, "objectShapes.seal").length === 0 && callsTo(program, "sealCsharpStorage").length === 0, true,
    "stable attempt: no untracked post-fixed-point shape or physical backing replacement");
});

test("callable contracts and forwarding consume the actual attempt's mandatory finite shape view", () => {
  const contracts = composedCall("analyzeCsharpCallableContracts", iteration, "callable input");
  const conversionArgument = ast.arguments(contracts).at(-1);
  assert.equal(ast.arguments(contracts).length, 8, "the existing callable owner takes its mandatory conversion input");
  assert.equal(conversionArgument !== undefined && ast.is.IsCallExpression(conversionArgument) &&
    text(ast.as.AsCallExpression(conversionArgument).Expression) === "Object.freeze", true,
    "the actual conversion input is frozen before it is handed to callable contracts");
  const conversion = ast.arguments(conversionArgument)[0];
  const shape = property(conversion, "objectShapes");
  assert.equal(shape !== undefined && ast.is.IsShorthandPropertyAssignment(shape), true,
    "early callable admission receives the same open actual shape owner, not policy.objectShapes");
  assert.equal(ast.properties(conversion).map(candidate => text(ast.name(candidate))).join(),
    "typeDefinitions,projectTypes,providers,target,objectShapes", "the actual view exposes only finite native conversion inputs");
  const declarations = programStatements.map(statement => ownDeclaration(statement, "callablePolicy")).filter(node => node !== undefined);
  assert.equal(declarations.length, 1, "stable callable and structural forwarding admission share one finite actual input");
  const initializer = ast.as.AsVariableDeclaration(declarations[0]).Initializer;
  const stableInput = ast.arguments(initializer)[0];
  const stableShape = property(stableInput, "objectShapes");
  assert.equal(stableShape !== undefined && ast.is.IsPropertyAssignment(stableShape) &&
    text(ast.as.AsPropertyAssignment(stableShape).Initializer) === "analysis.objectShapes", true,
    "final callable admission reads the same completed shape publication that physical backing used");
  assert.equal(ast.properties(stableInput).map(candidate => text(ast.name(candidate))).join(),
    "ast,navigation,typeDefinitions,projectTypes,providers,target,objectShapes", "the final view cannot expose the mutable source policy");
  const call = composedCall("analyzeCsharpProjectCallableAdapters", program, "stable callable input");
  assert.equal(text(ast.arguments(call)[0]), "callablePolicy", "the one actual conversion view remains mandatory");
  assert.equal(ast.arguments(call).length === 5 && ast.arguments(call).map(text).join() ===
    "callablePolicy,analysis.callables,analysis.objectShapes,analysis.declarations,analysis.typeProjections.genericProjection", true,
  "one canonical owner receives actual contracts, the complete shape publication, exact native defaults and the existing projection index");
  assert.equal(callsTo(file(paths.analyze), "finalizeCsharpStructuralInterfaceForwarding").length === 0 &&
    identifiers(file(paths.analyze), "finalizeCsharpStructuralInterfaceForwarding").length === 0, true,
  "the composing program has no competing finalizer call or stale import");
  const publication = programStatements.map(statement => ownDeclaration(statement, "program")).find(node => node !== undefined);
  const literal = ast.arguments(ast.as.AsVariableDeclaration(publication).Initializer)[0];
  const finalShape = property(literal, "objectShapes");
  assert.equal(finalShape !== undefined && ast.is.IsPropertyAssignment(finalShape) &&
    text(ast.as.AsPropertyAssignment(finalShape).Initializer) === "callableAdapters.objectShapes", true,
  "the published program consumes the canonical owner's already-final pure shape reader");
});

test("unclosed native participation rejects before its reader or any native demand is consumed", () => {
  const call = composedCall("analyzeCsharpNativeParticipation", iteration, "participation result");
  const input = ast.arguments(call)[0];
  const storage = property(input, "storage");
  assert.equal(storage !== undefined && ast.is.IsPropertyAssignment(storage) &&
    text(ast.as.AsPropertyAssignment(storage).Initializer) === "sourceStorage", true,
    "the participation owner receives the actual complete storage domain and its failure reason, not only a partial node array");
  const statements = ast.statements(ast.body(iteration));
  const index = topLevelIndex(statements, statement => ownDeclaration(statement, "participation") !== undefined, "participation result");
  const rejection = statements[index + 1];
  assert.equal(ast.is.IsIfStatement(rejection) && text(ast.as.AsIfStatement(rejection).Expression) === 'participation.kind === "rejected"' &&
    ast.is.IsReturnStatement(ast.as.AsIfStatement(rejection).ThenStatement) &&
    text(ast.as.AsReturnStatement(ast.as.AsIfStatement(rejection).ThenStatement).Expression) === "participation", true,
    "the exact expected rejection is returned immediately before any reader is exposed");
  const publication = ownDeclaration(statements[index + 2], "nativeParticipation");
  assert.equal(publication !== undefined && text(ast.as.AsVariableDeclaration(publication).Initializer) === "participation.value", true,
    "only a resolved native domain publishes the reader used by later admission and the record seal");
  for (const callee of ["analyzeCsharpClassInitialization", "analyzeCsharpBindingPatterns", "analyzeCsharpNativeDemand", "conversionAnalysis.close"]) {
    assert.equal(position(rejection) < position(composedCall(callee, iteration, "participation result")), true,
      `${callee}: no later native admission can run after an unresolved participation domain`);
  }
});

test("owning issues reject before the late registrations finish and before the one assembly", () => {
  const rejection = condition => statement => ast.is.IsIfStatement(statement) &&
    text(ast.as.AsIfStatement(statement).Expression) === condition &&
    descendants(ast.as.AsIfStatement(statement).ThenStatement).some(node => ast.is.IsReturnStatement(node));
  const calling = callee => statement => callsTo(statement, callee).length === 1;
  const steps = [
    ["analysis issues", rejection("analysisIssues.length > 0")],
    ["source-module constructions", rejection("sourceModuleConstructions.issues.length > 0")],
    ["attributes", rejection("attributes.diagnostics.length > 0")],
    ["module initialization", rejection("moduleInitialization.issues.length > 0")],
    ["class-factory issues", rejection("classFactories.issues.length > 0")],
    ["capture storage", rejection("captureStorage.issues.length > 0")],
    ["flow reads", rejection("flowReads.issues.length > 0")],
    ["actual source and pending refusals", rejection("refusals.length > 0")],
    ["native values", calling("analyzeCsharpNativeValueCarriers")],
    ["native-value issues", rejection("nativeValueCarriers.issues.length > 0")],
    ["binding-pattern issues", rejection("bindingPatterns.issues.length > 0")],
    ["pending native uses", rejection("pendingUses.length > 0")],
    ["ref-like placement", rejection("analysis.refLikeDiagnostics.length > 0")],
    ["assembly", calling("createCsharpProgramRecords")],
    ["program literal", statement => ownDeclaration(statement, "program") !== undefined],
  ];
  const indexes = steps.map(([label, predicate]) => topLevelIndex(programStatements, predicate, `rejection order: ${label}`));
  const collections = programStatements.flatMap(statement => ownDeclaration(statement, "refusals") ?? []);
  assert.equal(collections.length === 1 && callsTo(collections[0], "nativeDemand.unadmitted.flatMap").length === 1, true,
    "source and pending refusals are transported by one collection over the completed native demand");
  const sourceBranch = descendants(collections[0]).find(node => ast.is.IsIfStatement(node) &&
    text(ast.as.AsIfStatement(node).Expression) === 'use.kind === "source-refusal"');
  const returned = sourceBranch === undefined ? undefined : ast.as.AsIfStatement(sourceBranch).ThenStatement;
  assert.equal(returned !== undefined && ast.is.IsReturnStatement(returned) &&
    text(ast.as.AsReturnStatement(returned).Expression) === "[use.diagnostic]", true,
    "the same collection preserves each exact owning source refusal instead of returning before pending refusals");
  assert.equal(callsTo(collections[0], "analysis.operations.selectedConstruction.get").length === 1, true,
    "pending constructor refusals use their one existing selected construction, not a second selection");
  assert.equal(indexes.every((index, position_) => position_ === 0 || indexes[position_ - 1] < index), true,
    `rejection order: ${steps.map(([label]) => label).join(" < ")}`);
  const iterationSteps = [
    "analyzeCsharpTargetOperations", "analyzeCsharpStorage", "prepareCsharpStorage", "analyzeCsharpClassFactories",
    "prepareCsharpCallableCreations", "analyzeCsharpCaptureStorage", "callableCreationPreparation.seal", "analyzeCsharpNativeParticipation",
    "analyzeCsharpClassInitialization", "analyzeCsharpBindingPatterns", "analyzeCsharpNativeDemand",
    "admitCsharpBindingPatterns", "conversionAnalysis.close", "conversionAnalysis.seal", "analyzeCsharpRefLikePlacements",
    "objectShapes.seal", "sealCsharpStorage",
  ];
  const iterationCalls = iterationSteps.map(callee => composedCall(callee, iteration, "owning physical closure"));
  assert.equal(iterationCalls.every((call, index) => index === 0 || position(iterationCalls[index - 1]) < position(call)), true,
    `owning physical closure: ${iterationSteps.join(" < ")}`);
  const issueLists = descendants(program).filter(node => ast.is.IsVariableDeclaration(node) && named(node, "analysisIssues"));
  assert.equal(issueLists.length === 1 && ["...analysis.conversions.issues", "...callableAdapters.issues"]
    .every(value => text(ast.as.AsVariableDeclaration(issueLists[0]).Initializer).includes(value)), true,
  "owning conversion, callable and structural forwarding issues are included in the first rejection gate, before any final requirement assembly");
  assert.equal(position(composedCall("analyzeCsharpProjectCallableAdapters", program, "canonical rejection owner")) <
    position(programStatements[indexes[0]]), true,
  "all canonical interface method/property issues are complete before the earlier single rejection gate");
});

test("the published program literal carries no requirement state", () => {
  const literal = programStatements.find(statement => ownDeclaration(statement, "program") !== undefined);
  const names = ["requiredRecords", "requireCsharpRecord", "assertCsharpRequiredRecords", "CsharpRequiredRecord"];
  assert.equal(literal !== undefined && names.every(name => identifiers(literal, name).length === 0), true,
    "program literal: no requirement list, builder or assertion");
});

test("the assembly takes a mandatory list, asserts it, then returns", () => {
  const assembly = functionNamed(paths.create, "createCsharpProgramRecords");
  const parameters = ast.parameters(assembly);
  const required = parameters[1];
  assert.equal(parameters.length === 2 && named(required, "required") &&
    ast.as.AsParameterDeclaration(required).QuestionToken === undefined &&
    ast.as.AsParameterDeclaration(required).Initializer === undefined &&
    text(ast.as.AsParameterDeclaration(required).Type) === "readonly CsharpRequiredRecord[]", true,
    "assembly: a mandatory readonly CsharpRequiredRecord[] parameter");
  const statements = ast.statements(ast.body(assembly));
  const assertion = statements.at(-2);
  const returned = statements.at(-1);
  assert.equal(ast.is.IsExpressionStatement(assertion) && callsTo(assertion, "assertCsharpRequiredRecords").length === 1 &&
    ast.arguments(callsTo(assertion, "assertCsharpRequiredRecords")[0]).map(text).join() === "records,required", true,
    "assembly: assertCsharpRequiredRecords(records, required) directly precedes the return");
  assert.equal(ast.is.IsReturnStatement(returned) && text(ast.as.AsReturnStatement(returned).Expression) === "records" &&
    descendants(assembly).filter(node => ast.is.IsReturnStatement(node)).length === 1, true,
    "assembly: one return, of the asserted records");
});

for (const [label, path, producer, list, family, guard, publications] of [
  ["class factories", paths.classFactories, "analyzeCsharpClassFactories", "requiredRecords", "classFactory",
    "!definition.local", ["issues.push", "factories.push"]],
  ["storage", paths.storage, "analyzeCsharpStorage", "requiredRecords", "requiredStorageType",
    "contract !== undefined", ["contract.lambdaParameterType"]],
  ["participation", paths.participation, "analyzeCsharpNativeParticipation", "input.requiredRecords", "nativeParticipation",
    "selected === undefined", ["participation.set"]],
  ["native handlers", paths.nativeHandlers, "analyzeCsharpNativeHandlers", "requirements", "nativeHandler",
    "selected === undefined", ["builder.set"]],
  ["native values", paths.nativeValues, "analyzeCsharpNativeValueCarriers", "requiredRecords", "nativeValueDeclaration",
    "source === undefined", ["declarations.set"]],
]) {
  test(`${label}: one registration into the producer's own list precedes its publication under the same conditions`, () => {
    const owner = functionNamed(path, producer);
    const registrations = callsTo(owner, "requireCsharpRecord");
    assert.equal(registrations.length === 1, true, `${label} registration: exactly one requireCsharpRecord call`);
    const [registration] = registrations;
    const [target, requirement] = ast.arguments(registration);
    assert.equal(text(target) === list, true, `${label} registration: appends to ${list}`);
    const familyProperty = requirement !== undefined && ast.is.IsObjectLiteralExpression(requirement) ? property(requirement, "family") : undefined;
    assert.equal(text(ast.as.AsPropertyAssignment(familyProperty)?.Initializer) === `"${family}"`, true,
      `${label} registration: family ${family}`);
    const statement = ast.parent(registration);
    const enclosing = [];
    for (let node = ast.parent(registration); node !== undefined && node !== owner; node = ast.parent(node)) enclosing.push(node);
    const guarded = descendants(owner).filter(node => ast.is.IsIfStatement(node) && text(ast.as.AsIfStatement(node).Expression) === guard)
      .filter(node => enclosing.includes(node) || (ast.parent(node) === ast.parent(statement) && position(node) < position(statement)));
    assert.equal(ast.is.IsExpressionStatement(statement) && guarded.length === 1, true,
      `${label} registration: follows the selection guard ${guard}`);
    for (const publication of publications) {
      const sites = descendants(owner).filter(node => (ast.is.IsCallExpression(node) &&
        text(ast.as.AsCallExpression(node).Expression) === publication) ||
        (ast.is.IsBinaryExpression(node) && ast.operatorKindName(node) === "KindEqualsToken" &&
          text(ast.as.AsBinaryExpression(node).Left) === publication));
      assert.equal(sites.length === 1 && position(registration) < position(sites[0]), true,
        `${label} registration: precedes its one publication ${publication}`);
      assert.equal(encloses(ast.parent(statement), sites[0]), true,
        `${label} registration: no condition separates it from ${publication}`);
    }
  });
}

test("storage and class factories take the list as a mandatory parameter and participation as a mandatory input", () => {
  for (const [path, producer] of [[paths.storage, "analyzeCsharpStorage"], [paths.classFactories, "analyzeCsharpClassFactories"]]) {
    const last = ast.parameters(functionNamed(path, producer)).at(-1);
    assert.equal(named(last, "requiredRecords") && ast.as.AsParameterDeclaration(last).QuestionToken === undefined &&
      ast.as.AsParameterDeclaration(last).Initializer === undefined &&
      text(ast.as.AsParameterDeclaration(last).Type) === "CsharpRequiredRecord[]", true,
      `${producer} parameter: a mandatory CsharpRequiredRecord[] list`);
  }
  const member = descendants(file(paths.participation)).filter(node => ast.is.IsPropertySignatureDeclaration(node) &&
    named(node, "requiredRecords") && ast.is.IsInterfaceDeclaration(ast.parent(node)) &&
    named(ast.parent(node), "CsharpNativeParticipationAnalysisInput"));
  assert.equal(member.length === 1 && ast.questionToken(member[0]) === undefined && text(ast.typeNode(member[0])) === "CsharpRequiredRecord[]",
    true, "participation input: a mandatory CsharpRequiredRecord[] list");
  const last = ast.parameters(functionNamed(paths.nativeHandlers, "analyzeCsharpNativeHandlers")).at(-1);
  assert.equal(named(last, "requirements") && ast.as.AsParameterDeclaration(last).QuestionToken === undefined &&
    ast.as.AsParameterDeclaration(last).Initializer === undefined && text(ast.as.AsParameterDeclaration(last).Type) === "CsharpRequiredRecord[]", true,
    "native handler input: a mandatory CsharpRequiredRecord[] list");
});

test("requirement state stays inside analysis, in exactly fifteen files", () => {
  const users = sourceFiles(sourceRoot)
    .filter(path => /requiredRecords|CsharpRequiredRecord|requireCsharpRecord|assertCsharpRequiredRecords/u.test(readFileSync(path, "utf8")))
    .map(path => path.slice(repositoryRoot.length + 1)).sort();
  assert.equal(users.join() === [
    paths.participation,
    paths.operations,
    paths.nativeHandlers,
    paths.analyze,
    paths.create,
    "src/analysis/program/records/required-records.ts",
    paths.classFactories,
    paths.storage,
    paths.nativeDemand,
    paths.bindingPatterns,
    paths.conversions,
    paths.conversionModel,
    paths.conversionUses,
    paths.nativeValues,
    paths.artifactDemand,
  ].sort().join(), true, `requirement users: exactly the fifteen analysis files, found ${users.join(", ")}`);
});

test("each seal name and producer is mentioned only by its owner and the composition", () => {
  const requiredRecordsModule = "src/analysis/program/records/required-records.ts";
  const inventory = [
    ["requiredRecords", [paths.participation, paths.analyze, paths.classFactories, paths.storage,
      paths.nativeDemand, paths.bindingPatterns, paths.conversions, paths.conversionModel, paths.conversionUses, paths.nativeValues]],
    ["CsharpRequiredRecord", [paths.participation, paths.operations, paths.nativeHandlers, paths.analyze, paths.create, requiredRecordsModule,
      paths.classFactories, paths.storage, paths.nativeDemand, paths.bindingPatterns, paths.conversionModel, paths.conversionUses, paths.nativeValues, paths.artifactDemand]],
    ["requireCsharpRecord", [paths.participation, paths.nativeHandlers, requiredRecordsModule, paths.classFactories, paths.storage,
      paths.nativeDemand, paths.bindingPatterns, paths.conversionUses, paths.nativeValues, paths.artifactDemand]],
    ["assertCsharpRequiredRecords", [paths.create, requiredRecordsModule]],
    ["createCsharpProgramRecords", [paths.analyze, paths.create]],
    ["analyzeCsharpClassFactories", [paths.analyze, paths.classFactories]],
    ["analyzeCsharpNativeParticipation", [paths.participation, paths.analyze]],
    ["analyzeCsharpNativeHandlers", [paths.operations, paths.nativeHandlers]],
    ["analyzeCsharpNativeValueCarriers", [paths.analyze, paths.nativeValues]],
    ["analyzeCsharpStorage", [paths.analyze, paths.storage, "src/analysis/storage/index.ts"]],
  ];
  const files = sourceFiles(sourceRoot).map(path => [path.slice(repositoryRoot.length + 1), readFileSync(path, "utf8")]);
  for (const [name, expected] of inventory) {
    const pattern = new RegExp(`\\b${name}\\b`, "u");
    const found = files.filter(([, source]) => pattern.test(source)).map(([path]) => path).sort();
    assert.equal(found.join() === [...expected].sort().join(), true,
      `name inventory: ${name} is mentioned exactly by ${[...expected].sort().join(", ")}; found ${found.join(", ")}`);
  }
});
