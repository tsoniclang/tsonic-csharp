import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { admitCsharpCallableParameterAdapters, admitCsharpCallableValueAdapter } from "../../../dist/analysis/callables/adapters.js";
import { csharpCallableParameterConversionRequests, selectCsharpCallableParameterAdapters } from "../../../dist/policy/conversions/callable-parameters.js";
import { csharpSourcePrimitiveTargetType, csharpNullableTargetType, csharpTargetNamedType, csharpDelegateTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { createCsharpPlanningContext } from "../../../dist/backend/planner/context.js";
import { planCsharpStructuralInterfaceMembers } from "../../../dist/backend/planner/declarations/interfaces/structural.js";
import { printCsharpCompilationUnit } from "../../../dist/print/source/printer.js";
import { admitCsharpNativeDeclarations } from "../../../dist/analysis/declarations/native-value-declarations.js";
import { planMethodDeclaration } from "../../../dist/backend/planner/declarations/classes/methods.js";
import { planCsharpProjectCallableAdapters } from "../../../dist/backend/planner/declarations/classes/callable-adapters.js";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const host = { typeDefinitions: undefined, projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) }, target: {},
  objectShapes: Object.freeze({ resolveNode: () => undefined, resolveTarget: () => undefined }) };
const scalar = csharpSourcePrimitiveTargetType("string");
const unrelated = csharpSourcePrimitiveTargetType("boolean");
const parameter = (type, flags = {}) => ({ name: "value", passingMode: "by-value", type, ...flags });
const rest = type => parameter({ kind: "array", element: type }, { paramsArray: true });

test("callable admission uses only its actual completed shape view and preserves native absence", () => {
  const source = csharpTargetNamedType("Owner.Actual", undefined, undefined, { allowsRefLikeTypeArguments: [] });
  const middle = csharpTargetNamedType("Owner.Middle", undefined, undefined, { allowsRefLikeTypeArguments: [] });
  const target = csharpTargetNamedType("Owner.Contract", undefined, undefined, { allowsRefLikeTypeArguments: [] });
  const shapes = new Map([[source.id, Object.freeze({ targetType: source, members: [], implements: [middle] })],
    [middle.id, Object.freeze({ targetType: middle, members: [], implements: [target] })]]);
  let reads = 0;
  const actual = { ...host, objectShapes: Object.freeze({ resolveNode: () => undefined,
    resolveTarget(type) { reads++; return shapes.get(type.id); } }) };
  const admitted = admitCsharpCallableValueAdapter(actual, source, target);
  assert.equal(admitted?.conversion.kind === "implicit" && admitted.conversion.proof === "object-shape-interface", true,
    "the exact actual transitive implementation graph supplies the native result relation");
  assert.equal(reads > 0, true, "admission consults the one completed graph");
  const completed = reads;
  for (let index = 0; index < 3; index++) assert.equal(admitted.source === source && admitted.target === target, true,
    "published adapter reads retain original carrier identities");
  assert.equal(reads, completed, "reading an admitted adapter never reclassifies its source or target");
  assert.equal(admitCsharpCallableValueAdapter(host, source, target) === undefined, true,
    "an exact missing-edge view cannot borrow a relation from another policy store");
  assert.equal(admitCsharpCallableValueAdapter(actual, csharpNullableTargetType(source), target) === undefined, true,
    "native callable admission cannot implicitly erase absence");
  const nullable = admitCsharpCallableValueAdapter(actual, source, csharpNullableTargetType(target));
  assert.equal(nullable?.conversion.kind === "implicit" && nullable.conversion.proof === "object-shape-interface", true,
    "the same native reference relation may retain target absence");
});

test("rest adapters retain logical positions, exact conversion carriers and immutable segments", () => {
  const selected = admitCsharpCallableParameterAdapters(host, [rest(scalar)], [parameter(scalar), rest(scalar)]);
  assert.deepEqual(selected.map(adapter => adapter.kind), ["rest-element", "rest"]);
  assert.equal(selected[0].parameterIndex, 0);
  assert.equal(selected[0].offset, 0);
  assert.equal(selected[1].segments[0].offset, 1);
  assert.equal(selected[1].segments[0].parameterIndex, 0);
  assert.equal(targetTypeRefEquals(selected[0].adapter.source, scalar), true, "rest projection preserves exact source carrier");
  assert.equal(targetTypeRefEquals(selected[0].adapter.target, scalar), true, "rest projection preserves exact destination carrier");
  assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected[0]) && Object.isFrozen(selected[1].segments), true,
    "adapter and rest segments are immutable");
  assert.throws(() => { selected[1].segments[0].offset = 0; }, TypeError);
  const same = admitCsharpCallableParameterAdapters(host, [rest(scalar)], [rest(scalar)]);
  assert.equal(same[0].kind, "value");
  assert.equal(same[0].adapter.conversion.kind, "identity");
  const empty = admitCsharpCallableParameterAdapters(host, [], [rest(scalar)]);
  assert.deepEqual(empty[0].segments, []);
  const optional = admitCsharpCallableParameterAdapters(host, [rest(scalar)], [parameter(csharpNullableTargetType(scalar), { optional: true })]);
  assert.equal(optional[0].kind, "rest-element");
  assert.equal(optional[0].optional, true);
});

test("rest adapters reject malformed sequence positions and unproved native representations", () => {
  for (const [source, destination] of [
    [[rest(scalar), parameter(scalar)], [rest(scalar)]],
    [[rest(scalar)], [rest(scalar), parameter(scalar)]],
    [[parameter(scalar, { paramsArray: true })], [rest(scalar)]],
    [[rest(scalar)], [rest(unrelated)]],
    [[], [parameter(scalar)]],
    [[parameter(scalar, { passingMode: "byref-readwrite" })], [parameter(scalar)]],
  ]) assert.equal(admitCsharpCallableParameterAdapters(host, source, destination) === undefined, true,
    "an invalid native parameter correspondence is refused");
});

test("exact native parameter forwarding retains by-reference modes without a second selector", () => {
  for (const passingMode of ["byref-readwrite", "byref-readonly", "byref-writeonly-must-init"]) {
    const source = [parameter(scalar, { passingMode })];
    const target = [parameter(scalar, { passingMode, optional: true, paramsArray: false })];
    const selected = admitCsharpCallableParameterAdapters(host, source, target);
    assert.equal(selected?.length === 1 && selected[0].kind === "value" && selected[0].parameterIndex === 0 &&
      selected[0].adapter.conversion.kind === "identity", true, `exact ${passingMode} forwarding remains native`);
    assert.equal(selectCsharpCallableParameterAdapters(source, target, []) === undefined, true,
      `unadmitted ${passingMode} identity is not manufactured by policy`);
  }
});

test("parameter admission requests only the ordered physical correspondences, not a carrier product", () => {
  const types = ["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "float32", "float64"]
    .map(csharpSourcePrimitiveTargetType);
  const source = types.map(type => parameter(type));
  const exact = csharpCallableParameterConversionRequests(source, source);
  assert.equal(exact.length, source.length, "native identity asks for one conversion per distinct parameter");
  const rotated = csharpCallableParameterConversionRequests(source, [...source.slice(1), source[0]]);
  assert.equal(rotated.length, source.length, "ordinary positional mapping is linear in its actual parameter count");
  assert.equal(rotated.every((request, index) => request.source === source[index].type &&
    request.target === source[(index + 1) % source.length].type), true, "requests retain exact ordered source and destination identities");
  const variadic = csharpCallableParameterConversionRequests([rest(scalar)], [parameter(scalar), rest(scalar)]);
  assert.equal(variadic.length, 1, "one rest element conversion is shared across its finite fixed/rest correspondence");
});

const nativeForwardingModes = [
  { name: "Ref", modes: ["byref-readwrite"], names: ["value"], signature: "ref int value", arguments: "ref value",
    implementation: "value += 3; return value;" },
  { name: "In", modes: ["byref-readonly"], names: ["value"], signature: "in int value", arguments: "in value",
    implementation: "return value + 9;" },
  { name: "Out", modes: ["byref-writeonly-must-init"], names: ["value"], signature: "out int value", arguments: "out value",
    implementation: "value = 23; return value;" },
  { name: "Mixed", modes: ["by-value", "byref-readwrite", "byref-readonly", "byref-writeonly-must-init"],
    names: ["first", "second", "third", "fourth"], signature: "int first, ref int second, in int third, out int fourth",
    arguments: "first, ref second, in third, out fourth", implementation: "second += first; fourth = second + third; return fourth;" },
];
const nativeForwardingSources = new Map();

function classForwarder(control) {
  let compiled = nativeForwardingSources.get(control.names.length);
  if (compiled === undefined) {
    compiled = compileCsharpSource({ surface: "native", sourceText: `
      import type { int32 } from "@tsonic/core/types.js";
      export class Box { read(${control.names.map(name => `${name}: int32`).join(", ")}): int32 { return ${control.names[0]}; } }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    nativeForwardingSources.set(control.names.length, compiled);
  }
  const program = compiled.result.program;
  const ast = program.source.ast;
  const nodes = [];
  const visit = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  for (const file of program.sourceFiles) visit(file);
  const declaration = nodes.find(node => ast.is.IsMethodDeclaration(node));
  const original = program.records.callableDispatch.get(declaration)?.implementation;
  assert.equal(original?.parameters.length, control.modes.length, `${control.name}: actual checked native method contract`);
  const integer = csharpSourcePrimitiveTargetType("int32");
  const widened = csharpSourcePrimitiveTargetType("int64");
  const implementation = Object.freeze({ ...original, parameters: Object.freeze(original.parameters.map((parameter, index) =>
    Object.freeze({ ...parameter, targetParameter: Object.freeze({ ...parameter.targetParameter, passingMode: control.modes[index] }) }))) });
  const contract = Object.freeze({ ...implementation, returnType: widened });
  const parameters = admitCsharpCallableParameterAdapters(host, contract.parameters.map(parameter => parameter.targetParameter),
    implementation.parameters.map(parameter => parameter.targetParameter));
  const result = admitCsharpCallableValueAdapter(host, integer, widened);
  assert.equal(parameters?.every(adapter => adapter.kind === "value" && adapter.adapter.conversion.kind === "identity"), true,
    `${control.name}: the canonical owner admits native locations without copies`);
  assert.equal(result?.conversion.kind === "implicit" && result.conversion.proof === "numeric", true,
    `${control.name}: the native result is genuinely widened`);
  const interfaceType = csharpTargetNamedType(`Proof.I${control.name}`, undefined, { kind: "named", namespace: ["Proof"], name: `I${control.name}` }, { allowsRefLikeTypeArguments: [], sourceDeclarationKind: "interface" });
  const sourceType = csharpTargetNamedType(`Proof.Generated${control.name}`, undefined,
    { kind: "named", namespace: ["Proof"], name: `Generated${control.name}` }, { allowsRefLikeTypeArguments: [] });
  const signature = csharpDelegateTargetType("System.Func", control.modes.map(() => integer), widened);
  const member = Object.freeze({ sourceName: "read", targetName: "read", memberKind: "method",
    type: Object.freeze({ ...signature, csharpDelegateSignature: Object.freeze({ ...signature.csharpDelegateSignature,
      parameterPassingModes: Object.freeze([...control.modes]) }) }) });
  const forwarding = Object.freeze({ contract: Object.freeze({ parameters: contract.parameters, returnType: contract.returnType }),
    implementation, typeArguments: Object.freeze([]), typeParameters: Object.freeze([]), parameters, result,
    parameterDefaults: Object.freeze(implementation.parameters.map(() => undefined)) });
  const interfaceImplementation = Object.freeze({ sourceNode: declaration, sourceType, interfaceType, properties: Object.freeze([]),
    methods: Object.freeze([Object.freeze({ sourceName: "read", declaration, member, forwarding })]) });
  const selected = Object.freeze({ ...program, objectShapes: Object.freeze({ ...program.objectShapes,
    structuralImplementations: type => type === sourceType ? Object.freeze([interfaceImplementation]) :
      program.objectShapes.structuralImplementations(type) }) });
  const context = createCsharpPlanningContext(selected);
  const passing = mode => mode === "by-value" ? undefined : mode === "byref-readonly" ? "in"
    : mode === "byref-readwrite" ? "ref" : "out";
  const diagnostics = [];
  const planned = planCsharpStructuralInterfaceMembers({ targetType: sourceType }, context, diagnostics);
  assert.equal(diagnostics.length, 0, `${control.name}: actual native class forwarder renders`);
  assert.equal(planned.length, 1, `${control.name}: one explicit interface forwarder`);
  const forwarder = planned[0];
  assert.equal(forwarder.parameters.length, control.modes.length, `${control.name}: every incoming parameter survives`);
  assert.equal(forwarder.returnType.name, "long", `${control.name}: adapted native return width`);
  assert.equal(forwarder.body.statements.length, 1, `${control.name}: no copied locals or duplicate implementation body`);
  const call = forwarder.body.statements[0].expression;
  assert.equal(call.kind, "InvocationExpression", `${control.name}: one direct native invocation`);
  assert.equal(call.arguments.length, control.modes.length, `${control.name}: every physical invocation slot survives`);
  for (const [index, mode] of control.modes.entries()) {
    assert.equal(forwarder.parameters[index].passing, passing(mode), `${control.name}: declaration mode ${index}`);
    assert.equal(call.arguments[index].passing, passing(mode), `${control.name}: invocation mode ${index}`);
    assert.equal(call.arguments[index].expression.kind, "IdentifierName", `${control.name}: native location ${index}`);
    assert.equal(call.arguments[index].expression.name, forwarder.parameters[index].name, `${control.name}: exact incoming identity ${index}`);
  }
  return forwarder;
}

for (const control of nativeForwardingModes) test(`native class ${control.name} forwarding retains all modes with an adapted result`, () => {
  classForwarder(control);
});

function nativeForwardingSource(omitModes = []) {
  const generated = printCsharpCompilationUnit({ kind: "CompilationUnit", usings: [], members: [
    { kind: "NamespaceDeclaration", name: "Proof", members: nativeForwardingModes.map(control => {
      const selected = classForwarder(control);
      const call = selected.body.statements[0].expression;
      const method = !omitModes.includes(control.name) ? selected : { ...selected, body: { kind: "Block", statements: [
        { ...selected.body.statements[0], expression: { ...call,
          arguments: call.arguments.map(({ passing: _passing, ...argument }) => argument) } },
      ] } };
      return { kind: "ClassDeclaration", name: `Generated${control.name}`, modifiers: ["public", "sealed"],
        baseType: { kind: "IdentifierName", name: `Body${control.name}` },
        interfaces: [{ kind: "IdentifierName", name: `I${control.name}` }], members: [method] };
    }) },
  ] });
  const native = nativeForwardingModes.map(control => `
public interface I${control.name} { long read(${control.signature}); }
public class Body${control.name} {
    public int Calls { get; private set; }
    public int read(${control.signature}) { Calls++; ${control.implementation} }
    ${control.name === "In" ? "public int read(int value) { Calls++; return -9001; }" : ""}
}
public sealed class Native${control.name} : Body${control.name}, I${control.name} {
    long I${control.name}.read(${control.signature}) { return this.read(${control.arguments}); }
}`).join("\n");
  return `${generated}\nnamespace Proof { ${native}
public static class Entry {
    public static void Main() {
        var generatedRef = new GeneratedRef(); var nativeRef = new NativeRef();
        int generatedValue = 5, nativeValue = 5;
        long generatedResult = ((IRef)generatedRef).read(ref generatedValue);
        long nativeResult = ((IRef)nativeRef).read(ref nativeValue);
        if (generatedResult != 8L || nativeResult != generatedResult || generatedValue != 8 || nativeValue != generatedValue || generatedRef.Calls != 1 || nativeRef.Calls != 1)
            throw new System.Exception("ref adapted native forwarding");
        var generatedIn = new GeneratedIn(); var nativeIn = new NativeIn();
        generatedValue = 5; nativeValue = 5;
        generatedResult = ((IIn)generatedIn).read(in generatedValue);
        nativeResult = ((IIn)nativeIn).read(in nativeValue);
        if (generatedResult != 14L || nativeResult != generatedResult || generatedValue != 5 || nativeValue != generatedValue || generatedIn.Calls != 1 || nativeIn.Calls != 1)
            throw new System.Exception("in adapted native forwarding");
        var generatedOut = new GeneratedOut(); var nativeOut = new NativeOut();
        generatedResult = ((IOut)generatedOut).read(out generatedValue);
        nativeResult = ((IOut)nativeOut).read(out nativeValue);
        if (generatedResult != 23L || nativeResult != generatedResult || generatedValue != 23 || nativeValue != generatedValue || generatedOut.Calls != 1 || nativeOut.Calls != 1)
            throw new System.Exception("out adapted native forwarding");
        var generatedMixed = new GeneratedMixed(); var nativeMixed = new NativeMixed();
        generatedValue = 5; nativeValue = 5; int generatedReadonly = 11, nativeReadonly = 11;
        generatedResult = ((IMixed)generatedMixed).read(2, ref generatedValue, in generatedReadonly, out int generatedOutput);
        nativeResult = ((IMixed)nativeMixed).read(2, ref nativeValue, in nativeReadonly, out int nativeOutput);
        if (generatedResult != 18L || nativeResult != generatedResult || generatedValue != 7 || nativeValue != generatedValue || generatedReadonly != 11 || nativeReadonly != generatedReadonly || generatedOutput != 18 || nativeOutput != generatedOutput || generatedMixed.Calls != 1 || nativeMixed.Calls != 1)
            throw new System.Exception("mixed adapted native forwarding");
        System.Console.Write("ref,in,out,mixed: native-equivalent");
    }
} }\n`;
}

function buildNativeForwarding(name, omitModes = []) {
  const scratch = fileURLToPath(new URL("../../../.temp/class-forwarding-native/", import.meta.url));
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, `${name}-`));
  writeFileSync(join(root, "Program.cs"), nativeForwardingSource(omitModes));
  writeFileSync(join(root, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup>
<TargetFramework>net10.0</TargetFramework><OutputType>Exe</OutputType><LangVersion>14.0</LangVersion>
<Nullable>enable</Nullable><ImplicitUsings>disable</ImplicitUsings><TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup></Project>\n`);
  const child = { cwd: root, encoding: "utf8", timeout: 240_000, maxBuffer: 1_048_576,
    env: { ...process.env, DOTNET_PROCESSOR_COUNT: String(process.env.TSONIC_TEST_CHILD_JOBS ?? "1"),
      DOTNET_CLI_USE_MSBUILD_SERVER: "0", MSBUILDDISABLENODEREUSE: "1" } };
  const build = spawnSync("dotnet", ["build", join(root, "Proof.csproj"), "-c", "Release", "--nologo", "--verbosity", "quiet",
    "-m:1", "-nr:false", "-p:UseSharedCompilation=false", "-p:BuildInParallel=false"], child);
  writeFileSync(join(root, "build.log"), `${build.stdout ?? ""}\n${build.stderr ?? ""}`);
  process.stdout.write(`C01 native class proof ${name}: ${root}\n`);
  return { build, run: () => {
    const result = spawnSync("dotnet", ["run", "--project", join(root, "Proof.csproj"), "-c", "Release", "--no-build", "--no-restore"], child);
    writeFileSync(join(root, "run.log"), `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
    return result;
  } };
}

test("real .NET class ref, in, out and mixed forwarders match handwritten adapted-result methods", () => {
  const proof = buildNativeForwarding("adapted-return");
  assert.equal(proof.build.status, 0, `native build: ${String(proof.build.stdout).slice(-4096)} ${proof.build.error ?? ""}`);
  const executed = proof.run();
  assert.equal(executed.status, 0, `native execution: ${String(executed.stderr).slice(-4096)} ${executed.error ?? ""}`);
  assert.equal(executed.stdout, "ref,in,out,mixed: native-equivalent", "exact native location effects, call counts and widened results");
});

test("class native countercontrol rejects omitted ref and out invocation modes", () => {
  const proof = buildNativeForwarding("missing-ref-out", ["Ref", "Out"]);
  assert.equal(proof.build.status === 0, false, "native compilation rejects both missing required modifiers");
  const diagnostics = `${proof.build.stdout}\n${proof.build.stderr}`;
  assert.equal(diagnostics.includes("error CS1620") && diagnostics.includes("'ref'") && diagnostics.includes("'out'"), true,
    "Roslyn proves both location modes are required");
});

test("class native countercontrol observes omitted in selecting the wrong valid overload", () => {
  const proof = buildNativeForwarding("missing-in", ["In"]);
  assert.equal(proof.build.status, 0, "C# permits omitted in and selects the by-value overload");
  const executed = proof.run();
  assert.equal(executed.status === 0, false, "the runtime observer detects the incorrect overload");
  assert.equal(String(executed.stderr).includes("in adapted native forwarding"), true,
    "the failure is the exact in-overload observation, not an unrelated error");
});

function nativeMethodNodes(program) {
  const declarations = [];
  const visit = node => {
    if (program.source.ast.is.IsMethodDeclaration(node)) declarations.push(node);
    program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  program.sourceFiles.forEach(visit);
  return declarations;
}

function admitMethodRecords(program, nodes, records = program.records) {
  return admitCsharpNativeDeclarations(program.source.ast, nodes, records.nativeUse,
    program.projectTypes, program.sourceNavigation, records, records, records.nativeParticipation, records.nativeUnreachable,
    records, records.callableDispatch, records.classFactory, records);
}

for (const surface of ["native", "js"]) {
  test(`static, abstract, optional and rest methods consume final native dispatch on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export abstract class Base { abstract read(value?: number): number; }
      export class View extends Base {
        static increment(value: number): number { return value + 1; }
        read(value?: number): number { return value ?? 5; }
        sum(first: number, ...rest: number[]): number { return first + rest[0]; }
      }
      export function run(): number {
        const view: Base = new View();
        return View.increment(view.read()) + new View().sum(2, 3);
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const methods = nativeMethodNodes(program);
    assert.equal(methods.length, 4, "every declared native method has one final signature");
    for (const method of methods) {
      const dispatch = program.records.callableDispatch.get(method);
      assert.equal(dispatch?.implementation.sourceDeclaration === method, true,
        "the existing dispatch family publishes the actual source method contract");
      assert.equal(Object.isFrozen(dispatch) && Object.isFrozen(dispatch.adapters), true,
        "the method contract is immutable before planning");
      if (program.source.ast.hasModifierKind(method, "static")) {
        assert.equal(dispatch.overridesBase || dispatch.hasDerivedOverride || dispatch.adapters.length !== 0, false,
          "static methods never acquire instance dispatch or adapters");
      }
    }
    assert.equal(admitMethodRecords(program, methods).length, 0,
      "final physical signatures, not a second return-type selector, satisfy declaration admission");
    executeCsharpConstruction(compiled, `final-native-methods-${surface}`, false, false, [], `
if (Tsonic.Generated.Index.run() != 11) throw new System.Exception("final native method dispatch");
`);
  });

  test(`native raw adapters retain omitted defaults and one rest sequence on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class OptionalBase { read(value: number): number { return value; } }
      class OptionalView extends OptionalBase {
        read(value: number, extra?: number): number { return value + (extra ?? 2); }
      }
      class RestBase { read(...values: number[]): number { return values[0]; } }
      class RestView extends RestBase { read(value?: number): number { return value ?? 5; } }
      export function run(): number {
        const optional: OptionalBase = new OptionalView();
        const rest: RestBase = new RestView();
        return optional.read(3) + rest.read() + rest.read(7);
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const adapters = nativeMethodNodes(program).flatMap(method => program.records.callableDispatch.get(method)?.adapters ?? []);
    assert.equal(adapters.length, 2, "both native parameter adaptations publish one final logical stream");
    assert.equal(adapters.some(adapter => adapter.parameters.some(parameter => parameter.kind === "omitted")), true,
      "the missing destination consumes its admitted default");
    assert.equal(adapters.some(adapter => adapter.parameters.some(parameter => parameter.kind === "rest-element" && parameter.optional)), true,
      "the single source sequence preserves optional-element absence");
    executeCsharpConstruction(compiled, `native-raw-adapter-streams-${surface}`, false, false, [], `
if (Tsonic.Generated.Index.run() != 17) throw new System.Exception("native admitted default and rest streams");
`);
  });
}

test("method admission owns exact return, parameter, adapter and logical-return refusals", () => {
  const compiled = compileCsharpSource({ sourceText:
    "export class View { static read(value: number): number { return value; } }" });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  const method = nativeMethodNodes(program)[0];
  const dispatch = program.records.callableDispatch.get(method);
  const opaque = Object.freeze({ kind: "opaque", id: "missing" });
  for (const control of [
    { label: "physical return", dispatch: { ...dispatch, implementation: { ...dispatch.implementation, returnType: opaque } },
      node: method, code: "CSHARP_UNSUPPORTED_AST", message: "A method's sealed native return contract is not renderable." },
    { label: "physical parameter", dispatch: { ...dispatch, implementation: { ...dispatch.implementation,
      parameters: [{ ...dispatch.implementation.parameters[0], targetParameter: {
        ...dispatch.implementation.parameters[0].targetParameter, type: opaque } }] } },
      node: dispatch.implementation.parameters[0].sourceParameter, code: "CSHARP_OPAQUE_TARGET_TYPE_UNSUPPORTED",
      message: "Opaque target type 'missing' has no renderable C# source representation." },
    { label: "raw adapter", dispatch: { ...dispatch, adapters: [{ contract: { ...dispatch.implementation, returnType: opaque } }] },
      node: method, code: "CSHARP_UNSUPPORTED_AST", message: "A sealed callable adapter has an unrenderable native signature." },
    { label: "logical return", dispatch, rejectedReturn: { kind: "rejected", reason: "exact completed return refusal" },
      node: method, code: "CSHARP_UNSUPPORTED_AST", message: "exact completed return refusal" },
  ]) {
    const records = { ...program.records,
      callableDispatch: { get: node => node === method ? control.dispatch : program.records.callableDispatch.get(node) },
      returnContract: { get: node => node === method && control.rejectedReturn !== undefined
        ? control.rejectedReturn : program.records.returnContract.get(node) } };
    const issues = admitMethodRecords(program, [method], records);
    assert.equal(issues.length, 1, `${control.label}: exactly one pre-seal refusal`);
    assert.equal(issues[0].code, control.code, `${control.label}: unchanged diagnostic code`);
    assert.equal(issues[0].message, control.message, `${control.label}: unchanged diagnostic message`);
    assert.equal(issues[0].sourceNode === control.node, true, `${control.label}: exact original diagnostic node`);
  }
});

test("method and raw-adapter planners reject only corrupted admitted contracts", () => {
  const compiled = compileCsharpSource({ sourceText:
    "export class View { static read(value: number): number { return value; } }" });
  assertCsharpCompilationSucceeded(compiled);
  const program = compiled.result.program;
  const method = nativeMethodNodes(program)[0];
  const dispatch = program.records.callableDispatch.get(method);
  const file = program.source.ast.getSourceFile(method);
  for (const control of [
    { label: "missing contract", dispatch: undefined, message: "final native callable contract" },
    { label: "unrenderable return", dispatch: { ...dispatch, implementation: {
      ...dispatch.implementation, returnType: { kind: "opaque", id: "missing" } } }, message: "renderable native return type" },
  ]) {
    const input = createCsharpPlanningContext({ ...program, records: { ...program.records,
      callableDispatch: { get: node => node === method ? control.dispatch : program.records.callableDispatch.get(node) } } });
    const diagnostics = [];
    assert.throws(() => planMethodDeclaration(method, file, input, diagnostics,
      { kind: "source", declaration: method, role: "member" }),
      error => error.message.includes(control.message), `${control.label}: the producer guarantee fails internally`);
    assert.equal(diagnostics.length, 0, `${control.label}: the planner does not issue a source refusal`);
  }
  const input = createCsharpPlanningContext(program);
  const diagnostics = [];
  const planned = planMethodDeclaration(method, file, input, diagnostics, { kind: "source", declaration: method, role: "member" });
  const corrupted = createCsharpPlanningContext({ ...program, records: { ...program.records,
    callableDispatch: { get: node => node === method ? { ...dispatch, adapters: [{ contract: {
      ...dispatch.implementation, returnType: { kind: "opaque", id: "missing" } } }] }
      : program.records.callableDispatch.get(node) } } });
  assert.throws(() => planCsharpProjectCallableAdapters(method, planned, file, corrupted, diagnostics),
    error => error.message.includes("renderable physical signature"), "raw signatures were admitted before planner entry");
  assert.equal(diagnostics.length, 0, "corrupted raw adapters cannot fabricate another source diagnostic");
  const invalidStream = createCsharpPlanningContext({ ...program, records: { ...program.records,
    callableDispatch: { get: node => node === method ? { ...dispatch, adapters: [{ contract: dispatch.implementation,
      parameters: [] }] } : program.records.callableDispatch.get(node) } } });
  assert.throws(() => planCsharpProjectCallableAdapters(method, planned, file, invalidStream, diagnostics),
    error => error.message.includes("exact logical argument stream"),
    "one admitted parameter adapter per physical destination is a producer guarantee");
  assert.equal(diagnostics.length, 0, "a corrupted stream is distinct from a child's existing source refusal");
});

test("a rejected method default cannot become an adapter-stream invariant", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    function tag(parts: TemplateStringsArray): number { return 1; }
    class Base { read(): number { return 1; } }
    export class View extends Base {
      read(value: number = tag\`default\`): number { return value; }
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the checked optional override is valid source");
  assert.equal(compiled.result.diagnostics.some(issue => issue.category === "error"), true,
    "the unsupported initializer retains its source refusal instead of an internal error");
  assert.equal(compiled.targetDiagnostics.some(issue => issue.code === "CSHARP_UNSUPPORTED_AST"), true,
    "the checked JS initializer keeps its actual unsupported-expression refusal");
  assert.equal(compiled.targetDiagnostics.some(issue => issue.code.startsWith("TSONIC_INTERNAL_")), false,
    "a refused initializer cannot become an internal adapter-stream failure");
  assert.equal(compiled.artifacts.size, 0, "a rejected child cannot publish its incomplete adapter");
});
