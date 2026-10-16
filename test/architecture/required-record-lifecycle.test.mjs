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
  assert.equal(identifiers(iteration, "requiredRecords").length === 4, true,
    "iteration state: the list is only declared, passed to storage and operations, and returned");
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
  const factories = composedCall("analyzeCsharpClassFactories", program, "stable attempt");
  assert.equal(text(ast.arguments(factories).at(-1)) === "analysis.requiredRecords", true,
    "stable attempt: analyzeCsharpClassFactories receives analysis.requiredRecords");
  const participation = composedCall("analyzeCsharpNativeParticipation", program, "stable attempt");
  const participationInput = ast.arguments(participation)[0];
  const participationList = participationInput === undefined || !ast.is.IsObjectLiteralExpression(participationInput)
    ? undefined : property(participationInput, "requiredRecords");
  assert.equal(participationList !== undefined && ast.is.IsPropertyAssignment(participationList) &&
    text(ast.as.AsPropertyAssignment(participationList).Initializer) === "analysis.requiredRecords", true,
    "stable attempt: analyzeCsharpNativeParticipation receives analysis.requiredRecords");
  const assembly = composedCall("createCsharpProgramRecords", program, "stable attempt");
  assert.equal(ast.arguments(assembly).length === 2 && text(ast.arguments(assembly)[1]) === "analysis.requiredRecords", true,
    "stable attempt: createCsharpProgramRecords receives analysis.requiredRecords");
  const reads = descendants(program).filter(node => ast.is.IsPropertyAccessExpression(node) && text(node) === "analysis.requiredRecords");
  assert.equal(reads.length === 6 && identifiers(program, "requiredRecords").length === 7, true,
    "stable attempt: the list is read by five late producers and the assembly");
  const demand = composedCall("analyzeCsharpNativeDemand", program, "stable attempt");
  const bindings = composedCall("admitCsharpBindingPatterns", program, "stable attempt");
  const conversions = composedCall("analysis.conversionAnalysis.seal", program, "stable attempt");
  for (const call of [demand, bindings, conversions]) assert.equal(text(ast.arguments(call).at(-1)) === "analysis.requiredRecords", true,
    "each late native-use admission receives the same stable requirement list");
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
    ["class factories", calling("analyzeCsharpClassFactories")],
    ["class-factory issues", rejection("classFactories.issues.length > 0")],
    ["capture storage", rejection("captureStorage.issues.length > 0")],
    ["flow reads", rejection("flowReads.issues.length > 0")],
    ["participation", calling("analyzeCsharpNativeParticipation")],
    ["native demand", calling("analyzeCsharpNativeDemand")],
    ["conversion uses", calling("analysis.conversionAnalysis.seal")],
    ["assembly", calling("createCsharpProgramRecords")],
    ["program literal", statement => ownDeclaration(statement, "program") !== undefined],
  ];
  const indexes = steps.map(([label, predicate]) => topLevelIndex(programStatements, predicate, `rejection order: ${label}`));
  assert.equal(indexes.every((index, position_) => position_ === 0 || indexes[position_ - 1] < index), true,
    `rejection order: ${steps.map(([label]) => label).join(" < ")}`);
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

test("requirement state stays inside analysis, in exactly thirteen files", () => {
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
  ].sort().join(), true, `requirement users: exactly the thirteen analysis files, found ${users.join(", ")}`);
});

test("each seal name and producer is mentioned only by its owner and the composition", () => {
  const requiredRecordsModule = "src/analysis/program/records/required-records.ts";
  const inventory = [
    ["requiredRecords", [paths.participation, paths.analyze, paths.classFactories, paths.storage,
      paths.nativeDemand, paths.bindingPatterns, paths.conversions, paths.conversionModel, paths.conversionUses]],
    ["CsharpRequiredRecord", [paths.participation, paths.operations, paths.nativeHandlers, paths.analyze, paths.create, requiredRecordsModule,
      paths.classFactories, paths.storage, paths.nativeDemand, paths.bindingPatterns, paths.conversionModel, paths.conversionUses]],
    ["requireCsharpRecord", [paths.participation, paths.nativeHandlers, requiredRecordsModule, paths.classFactories, paths.storage,
      paths.nativeDemand, paths.bindingPatterns, paths.conversionUses]],
    ["assertCsharpRequiredRecords", [paths.create, requiredRecordsModule]],
    ["createCsharpProgramRecords", [paths.analyze, paths.create]],
    ["analyzeCsharpClassFactories", [paths.analyze, paths.classFactories]],
    ["analyzeCsharpNativeParticipation", [paths.participation, paths.analyze]],
    ["analyzeCsharpNativeHandlers", [paths.operations, paths.nativeHandlers]],
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
