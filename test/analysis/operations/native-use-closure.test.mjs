import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { targetUseSiteIdentity } from "@tsonic/target-api/analysis";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpBindingPatterns } from "../../../dist/analysis/control-flow/binding-patterns.js";
import { analyzeCsharpNativeDemand } from "../../../dist/analysis/operations/native-demand.js";
import { csharpNativeUseSite } from "../../../dist/target-model/records/native-demand.js";
import { csharpNeverTargetType, csharpObjectTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpArrayLiteralElementTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { getCsharpRuntimeUnionArms, isCsharpJsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { memoryAbiCapability } from "../../helpers/memory-abi.mjs";
import { compileCsharpNativeUseSource } from "../../helpers/expected-native-uses.mjs";
import { planCsharpDiscardedStatement, planCsharpPlannedDiscard } from "../../../dist/backend/planner/statements/statement-output.js";
import { admitCsharpSourceOwnedMemberRead } from "../../../dist/analysis/operations/member-access.js";
import { genericObjectMethodValueSource } from "../../../../tsonic/test/fixtures/generic-object-methods.mjs";
import { unsupportedGenericCallableOwnershipCases } from "../../fixtures/generic-callable-ownership.mjs";

test("the single discard entry omits pure defaults without dropping preludes, effects or never completion", () => {
  const scalar = csharpSourcePrimitiveTargetType("float64");
  const absent = { kind: "DefaultExpression" };
  assert.equal(planCsharpDiscardedStatement(absent, scalar) === undefined, true,
    "a pure untyped default cannot become an invalid C# discard assignment");
  const effect = { kind: "ExpressionStatement", expression: { kind: "InvocationExpression",
    callee: { kind: "IdentifierName", name: "observe" }, arguments: [] } };
  const statements = planCsharpPlannedDiscard({ prelude: [effect],
    completion: { kind: "value", carrier: scalar, expression: absent } });
  assert.equal(statements.length === 1 && statements[0] === effect, true,
    "omitting a pure result preserves the identical effect prelude exactly once and in order");
  const call = effect.expression;
  const discarded = planCsharpDiscardedStatement(call, scalar);
  assert.equal(discarded?.kind === "ExpressionStatement" && discarded.expression === call, true,
    "a real invocation is never discarded as a stable value");
  assert.equal(planCsharpDiscardedStatement(call, csharpNeverTargetType())?.kind, "ThrowStatement",
    "a native never completion retains its original throw route before purity is considered");
});

for (const surface of ["native", "js"]) {
  test(`${surface} generic super construction consumes the exact canonical native base environment`, { timeout: 240_000 }, () => {
    const compiled = compileCsharpNativeUseSource({ surface, sourceText: `
      class GenericOptions<T> {
        constructor(private readonly grouping: T) {}
        get useGrouping(): T { return this.grouping; }
      }
      class NativeOptions extends GenericOptions<boolean> {
        constructor() { super(false); }
      }
      class Forwarded<T> extends GenericOptions<T> {
        constructor(value: T) { super(value); }
      }
      export function run(): boolean {
        const direct = new NativeOptions();
        const forwarded = new Forwarded<boolean>(true);
        return !direct.useGrouping && forwarded.useGrouping;
      }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the original inherited generic construction is checked source");
    assert.equal(compiled.targetDiagnostics.length, 0, "the selected base native parameter contract is complete before sealing");
    assert.equal(compiled.result.program !== undefined && compiled.result.plan !== undefined, true,
      "the exact direct and forwarded base environments are published together");
    const output = [...compiled.artifacts.values()].join("\n");
    assert.match(output, /class NativeOptions : GenericOptions<bool>/u,
      "the selected closed native base keeps its exact actual generic argument");
    assert.match(output, /class Forwarded<T> : GenericOptions<T>/u,
      "the forwarded native base retains the original bound generic identity");
    executeCsharpConstruction(compiled, `generic-super-native-environment-${surface}`);
  });
}

test("native Promise continuations keep the original exact external-callee refusal before publication", () => {
  const expression = "Promise.resolve(1).then((value: number): number => value + 1)";
  const sourceText = [
    "export function chain(): Promise<number> {",
    `  return ${expression};`,
    "}",
    "",
  ].join("\n");
  const compiled = compileCsharpNativeUseSource({ surface: "native", sourceText });
  assert.equal(compiled.sourceDiagnosticsText, "", "the original unsupported native API is checked source, not a type error");
  assert.equal(compiled.targetDiagnostics.length, 1, "only the exact selected source API refusal is reported");
  const issue = compiled.targetDiagnostics[0];
  assert.equal(issue.code, "CSHARP_UNSUPPORTED_AST");
  assert.equal(issue.source, "tsonic-csharp");
  assert.equal(issue.category, "error");
  assert.equal(issue.message, "The exact selected source callee is external to the project and has no C# target relation.");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
    "unsupported native continuations publish no program, plan or artifacts");
  const original = compiled.nativeStage.diagnostics[0];
  const ast = compiled.nativeStage.source.ast;
  const node = original.sourceNode;
  assert.equal(node !== undefined && ast.is.IsCallExpression(node), true, "the original call, not its callback or result conversion, owns the refusal");
  const file = ast.getSourceFile(node);
  assert.equal(file !== undefined, true, "the exact original checked file owns the rejected call");
  const range = ast.authoredRange(node);
  assert.equal(range.kind, "authored", "the rejected call retains its original authored range");
  assert.equal(ast.getSourceText(file).slice(range.start, range.end), expression,
    "the source refusal retains the complete original selected continuation call");
  assert.equal(range.start, sourceText.indexOf(expression),
    "the unchanged original call starts at index.ts:2:10");
  assert.equal(range.end, sourceText.indexOf(expression) + expression.length, "the exact original call span is retained");
});

test("native catch does not acquire a JavaScript continuation relation from its external signature", () => {
  const expression = "Promise.resolve(1).catch((): number => 7)";
  const compiled = compileCsharpNativeUseSource({ surface: "native",
    sourceText: `export function recover(): Promise<number> { return ${expression}; }` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the native profile declares the source method without implementing a JS continuation");
  const issue = compiled.nativeStage.diagnostics[0];
  const ast = compiled.nativeStage.source.ast;
  const range = issue?.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
  assert.equal(compiled.targetDiagnostics.length === 1 && issue.code === "CSHARP_UNSUPPORTED_AST" &&
    issue.message === "The exact selected source callee is external to the project and has no C# target relation." &&
    range?.kind === "authored" && ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end) === expression, true,
  "the exact actual continuation call owns its original unsupported-native-API refusal");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
    "native catch publishes no partial program, plan or target artifacts");
});

test("an external direct function keeps its source shape but requires a native implementation before publication", () => {
  const expression = "external(7)";
  const compiled = compileCsharpNativeUseSource({ surface: "native",
    sourceText: `export function run(): number { return ${expression}; }`,
    files: { "external.d.ts": "declare function external(value: number): number;" } });
  assert.equal(compiled.sourceDiagnosticsText, "", "the original selected external function is valid checked source");
  const issue = compiled.nativeStage.diagnostics[0];
  const ast = compiled.nativeStage.source.ast;
  const range = issue?.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
  assert.equal(compiled.targetDiagnostics.length === 1 && issue.code === "CSHARP_UNSUPPORTED_AST" &&
    issue.message === "The exact selected source callee is external to the project and has no C# target relation." &&
    range?.kind === "authored" && ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end) === expression, true,
  "shape/type information is not a native executable implementation or target relation");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
    "an unimplemented external function emits no partial native program or artifact");
});

for (const surface of ["native", "js"]) test(`${surface} authored Half tokens round once at native precision without a host double round trip`, () => {
  const cases = [
    ["belowOverflow", "65519.999999999999999999999", 0x7bff],
    ["negativeBelowOverflow", "-65519.999999999999999999999", 0xfbff],
    ["evenMidpoint", "1.00048828125", 0x3c00],
    ["aboveMidpoint", "1.0004882812500000000000000000001", 0x3c01],
    ["oddMidpoint", "1.00146484375", 0x3c02],
    ["belowOddMidpoint", "1.0014648437499999999999999999999", 0x3c01],
    ["subnormalMidpoint", "2.98023223876953125e-8", 0x0000],
    ["aboveSubnormalMidpoint", "2.980232238769531250000000000001e-8", 0x0001],
    ["negativeSubnormalMidpoint", "-2.98023223876953125e-8", 0x8000],
    ["underflow", "1e-5000", 0x0000],
    ["negativeUnderflow", "-1e-5000", 0x8000],
    ["negativeZero", "-0", 0x8000],
    ["hexBelowOverflow", "0xffef", 0x7bff],
    ["parenthesizedBelowOverflow", "(65519.999999999999999999999)", 0x7bff],
    ["parenthesizedAboveMidpoint", "(1.0004882812500000000000000000001)", 0x3c01],
  ];
  const compiled = compileCsharpSource({ surface, sourceText: `
    import type { float16, float64, int32 } from "@tsonic/core/types.js";
    ${cases.map(([name, token]) => `export function ${name}(): float16 { return ${token}; }`).join("\n")}
    export function actual(value: float64): float16 { return value as float16; }
    export function nativeIntegerZero(): int32 { return -0; }
    export function nativeFloatingZero(): float64 { return -0; }
    export function keyBelowOverflow(): Record<float16, number> { return { 65519.999999999999999999999: 7 }; }
    export function keyAboveMidpoint(): Record<float16, number> { return { 1.0004882812500000000000000000001: 9 }; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.program !== undefined && compiled.targetDiagnostics.length === 0, true,
    compiled.targetDiagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | "));
  const output = [...compiled.artifacts.values()].join("\n");
  assert.doesNotMatch(output, /65520|Half\.Parse|Convert\.ToHalf|BitConverter/u,
    "authored Half constants emit their selected exact native value without runtime parsing, allocation or a rounded overflow token");
  assert.deepEqual(output.match(/new System\.[^\n]*/gu), [
    "new System.Collections.Generic.Dictionary<Half, double>",
    "new System.Collections.Generic.Dictionary<Half, double>",
  ], "only the two authored dictionary constructions allocate; every authored Half constant remains allocation-free");
  executeCsharpConstruction(compiled, `authored-half-exact-${surface}`, false, false, [], `
using Subject = Tsonic.Generated.Index;
static int Bits(System.Half value) => System.BitConverter.HalfToInt16Bits(value) & 0xffff;
${cases.map(([name, , bits]) => `if (Bits(Subject.${name}()) != ${bits}) throw new System.Exception("${name}: exact Half bits");`).join("\n")}
if (Bits(Subject.actual(1.00048828125D)) != 0x3c00 || !System.Half.IsPositiveInfinity(Subject.actual(65520D)) ||
    Bits(Subject.actual(-0D)) != 0x8000)
    throw new System.Exception("a genuine computed double keeps native explicit conversion semantics");
if (Subject.nativeIntegerZero() != 0 || System.BitConverter.DoubleToInt64Bits(Subject.nativeFloatingZero()) != long.MinValue)
    throw new System.Exception("an explicit integer destination or the floating negative-zero sign changed");
if (!Subject.keyBelowOverflow().TryGetValue(System.Half.MaxValue, out double first) || first != 7D ||
    !Subject.keyAboveMidpoint().TryGetValue((System.Half)1.0009765625D, out double second) || second != 9D)
    throw new System.Exception("property keys consume the same exact authored Half-bit selection");
`);
});

for (const surface of ["native", "js"]) test(`${surface} native switch labels consume their selected discriminant carrier before sealing`, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `
    import type { int32, int64 } from "@tsonic/core/types.js";
    export function narrow(value: int32): int32 {
      switch (value) { case 1: return 7 / 2; case 2147483647: return 9 / 2; default: return 5; }
    }
    export function wide(value: int64): int32 {
      switch (value) { case 9007199254740993n: return 7; case -9007199254740993n: return 9; default: return 11; }
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.program !== undefined && compiled.targetDiagnostics.length === 0, true,
    compiled.targetDiagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | "));
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /case 1:/u);
  assert.match(output, /case 2147483647:/u);
  assert.doesNotMatch(output, /case (?:1|2147483647)D:/u,
    "native integral labels never acquire an erased source-number double carrier");
  executeCsharpConstruction(compiled, `native-switch-labels-${surface}`, false, false, [], `
if (Tsonic.Generated.Index.narrow(1) != 3 || Tsonic.Generated.Index.narrow(int.MaxValue) != 4 ||
    Tsonic.Generated.Index.narrow(0) != 5 || Tsonic.Generated.Index.wide(9007199254740993L) != 7 ||
    Tsonic.Generated.Index.wide(-9007199254740993L) != 9 || Tsonic.Generated.Index.wide(0L) != 11)
    throw new System.Exception("native switch labels, integer division or full-width equality changed");
`);
});

for (const surface of ["native", "js"]) test(`${surface} instance native property observations admit their original receiver exactly once`, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    let reads: int32 = 0;
    function make(): Error { reads += 1; return new Error("selected"); }
    function count(): int32 { return reads; }
    export function run(): boolean {
      reads = 0;
      const name = make().name;
      const stack = make().stack;
      return name === "Error" && stack === undefined && count() === 2;
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.program !== undefined && compiled.targetDiagnostics.length === 0, true,
    compiled.targetDiagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | "));
  const program = compiled.result.program;
  const ast = program.source.ast;
  let receivers = 0;
  const visit = node => {
    const selected = program.records.selectedProperty.get(node)?.selection;
    if (selected?.kind === "resolved" && selected.source.receiver !== undefined &&
      selected.targetMember.id !== undefined &&
      (selected.targetMember.id === "Tsonic.CSharp.Runtime.Error.name" || selected.targetMember.id === "Tsonic.CSharp.Runtime.Error.stack")) {
      const receiver = selected.source.receiver.expression;
      const use = program.records.nativeUse.expression(receiver);
      assert.equal(selected.receiver.kind === "instance" && use !== undefined && use.site.subject === node && use.site.role === "receiver" &&
        use.use.expression === receiver && use.use.kind !== "erased" && use.use.completion.kind === "value" &&
        targetTypeRefEquals(use.use.carrier, program.records.valueRead.get(receiver)?.value) &&
        targetTypeRefEquals(use.use.carrier, use.use.completion.type), true,
      "the actual selected instance property consumes its original checked receiver at the admitted receiver slot");
      receivers += 1;
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  assert.equal(receivers, 2, "both original Error observations use their exact selected instance receiver contracts");
  executeCsharpConstruction(compiled, `native-property-receiver-${surface}`, false, false, [], `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("instance native getter receiver effects changed");
`);
});

for (const surface of ["native", "js"]) test(`${surface} contextual generic callable creation and captured frames use the same nullable native result`, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `
    import type { int32, int64, float64 } from "@tsonic/core/types.js";
    function invoke<Value>(read: () => Value | null | undefined): Value | null | undefined { return read(); }
    export function direct(): int64 | null | undefined { return invoke<int64>(() => 9n); }
    export function captured(): boolean {
      let total: int64 = 9007199254740993n;
      const read = (): int64 => { total += 1n; return total; };
      const first = invoke<int64>(read);
      const second = invoke<int64>(read);
      return first === 9007199254740994n && second === 9007199254740995n && total === 9007199254740995n;
    }
    export function authored(): float64 {
      const read: () => float64 = (): int32 => 7 / 2;
      return read();
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.program !== undefined && compiled.targetDiagnostics.length === 0, true,
    compiled.targetDiagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | "));
  const output = [...compiled.artifacts.values()].join("\n");
  assert.doesNotMatch(output, /Func<System\.Numerics\.BigInteger>/u,
    "the construction uses the actual nullable long context, not an adapter from a falsely materialized arbitrary-precision delegate");
  executeCsharpConstruction(compiled, `contextual-native-creation-${surface}`, false, false, [], `
using Subject = Tsonic.Generated.Index;
if (Subject.direct() != 9L || !Subject.captured() || Subject.authored() != 3D)
    throw new System.Exception("native nullable creation, captured mutation or authored integer body semantics changed");
`);
});

for (const surface of ["native", "js"]) test(`${surface} a contextual creation cannot admit an out-of-range native literal body`, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `
    import type { int64 } from "@tsonic/core/types.js";
    function invoke<Value>(read: () => Value | null | undefined): Value | null | undefined { return read(); }
    export function run(): int64 | null | undefined { return invoke<int64>(() => 9223372036854775808n); }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
    "actual construction requirements reject the body before publishing a callable or a partial program");
  assert.equal(compiled.targetDiagnostics.length === 1 && compiled.targetDiagnostics[0].code === "CSHARP_UNSUPPORTED_AST" &&
    compiled.targetDiagnostics[0].message === "Source bigint literal is outside the exact 'int64' range.", true,
  "native creation is not permission to skip the exact body admission or replace its source error with an invariant");
});

for (const surface of ["native", "js"]) test(`${surface} optional ${surface === "native" ? "instance" : "target-parameter"} receivers consume their original storage before the presence guard`, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    let reads: int32 = 0;
    function observe(value: string | undefined): string | undefined { reads += 1; return value; }
    function suffix(): string { reads += 10; return "${surface === "native" ? "X" : "!"}"; }
    function count(): int32 { return reads; }
    export function run(flag: boolean): boolean {
      reads = 0;
      const selected = ${surface === "native" ? 'observe(flag ? " X " : undefined)?.Trim().EndsWith(suffix())'
        : 'observe(flag ? " X " : undefined)?.trim().concat(suffix()).toLowerCase()'};
      return flag ? selected === ${surface === "native" ? "true" : '"x!"'} && count() === 11 : selected === undefined && count() === 1;
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.program !== undefined && compiled.targetDiagnostics.length === 0, true,
    compiled.targetDiagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | "));
  const program = compiled.result.program;
  const ast = program.source.ast;
  let receivers = 0;
  const visit = node => {
    const call = program.records.selectedCall.get(node);
    const receiver = call?.optionalReceiver;
    if (receiver !== undefined && call.target?.kind === "resolved" &&
      (surface === "native" || call.target.call.receiver.kind === "target-parameter")) {
      const site = csharpNativeUseSite(node, { kind: "receiver" }, { target: receiver.storage });
      const use = program.records.nativeUse.get(site);
      assert.equal(use !== undefined && use.kind !== "erased" && use.completion.kind === "value" &&
        use.expression === receiver.expression && targetTypeRefKey(use.completion.type) === targetTypeRefKey(receiver.storage), true,
      "the actual receiver is evaluated once in its original storage, not implicitly unwrapped before its guard");
      if (surface === "native") {
        assert.equal(call.target.call.receiver.kind === "instance" && receiver.parameterType === undefined &&
          receiver.conversion === undefined, true,
        "the actual native instance ABI needs no fabricated target-parameter conversion");
      } else assert.equal(receiver.parameterType !== undefined && receiver.conversion !== undefined &&
          program.records.expressionConversion.get(receiver.expression, receiver.type, receiver.parameterType, "implicit") !== undefined, true,
        "the exact selected present-value parameter conversion is admitted separately before sealing");
      receivers += 1;
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  assert.equal(receivers > 0, true, `the control exercises the actual ${surface === "native" ? "native instance" : "JS target-parameter"} receiver route`);
  executeCsharpConstruction(compiled, `optional-native-receiver-storage-${surface}`, false, false, [], `
if (!Tsonic.Generated.Index.run(false) || !Tsonic.Generated.Index.run(true))
    throw new System.Exception("optional receiver presence, single evaluation or lazy argument changed");
`);
});

test("native optional receivers do not acquire an undeclared JS trim alias", () => {
  const compiled = compileCsharpSource({ surface: "native", sourceText:
    "export function run(value: string | undefined): string | undefined { return value?.trim(); }" });
  assert.equal(compiled.source.diagnostics.length, 1, compiled.sourceDiagnosticsText);
  assert.match(compiled.sourceDiagnosticsText,
    /error TS2551: Property 'trim' does not exist on type 'string'\. Did you mean 'Trim'\?/u);
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
    "the precise checked native spelling refusal publishes no program, plan or compatibility path");
});

test("selected property-projection arguments retain their native input until the one admitted projection", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int64 } from "@tsonic/core/types.js";
    export class Options { readonly useGrouping: boolean = false; }
    export function format(options: Options): string {
      const value: int64 = 9007199254740993n;
      return value.toLocaleString("en", options);
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.program !== undefined && compiled.targetDiagnostics.length === 0, true,
    compiled.targetDiagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | "));
  const program = compiled.result.program;
  const ast = program.source.ast;
  let projections = 0;
  const visit = node => {
    const selection = program.records.selectedCall.get(node)?.target;
    if (selection?.kind === "resolved") for (const argument of selection.call.arguments) {
      if (argument.targetParameter.csharpValueProjection !== "properties") continue;
      const expression = selection.source.sourceArguments[argument.sourceArgumentIndex]?.expression;
      const admitted = expression === undefined ? undefined : program.records.nativeUse.expression(expression);
      assert.equal(admitted !== undefined && admitted.site.subject === node && admitted.use.kind !== "erased" &&
        admitted.use.completion.kind === "value" && !isCsharpJsValueTargetType(admitted.use.completion.type), true,
      "a native selected-properties input is not irreversibly boxed as an opaque TsValue first");
      const members = program.records.propertyProjection.get(expression, admitted.use.completion.type);
      assert.equal(members?.length === 1 && members[0].sourceName === "useGrouping", true,
        "the sole projection consumes the exact pre-seal selected-parameter member correspondence");
      projections += 1;
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  assert.equal(projections, 1, "one actual selected property-projection boundary");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal(output.includes("CreateDynamicObject"), true,
    "the existing selected-properties native recipe is emitted instead of an opaque native object box");
  assert.doesNotMatch(output, /TsValue\.from\(options\)/u,
    "the original native receiver is not substituted for its required selected property values");
});

for (const surface of ["native", "js"]) test(`${surface} unreachable contextual defaults do not retain a native capture frame`, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    export function create(fallback: { count: int32 }): (value: { count: int32 }) => unknown {
      return (value: unknown = fallback): unknown => value;
    }
    export function run(): boolean {
      const fallback = { count: 0 as int32 }; const value = { count: 7 as int32 };
      const read = create(fallback); return read(value) === value;
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.program !== undefined && compiled.targetDiagnostics.length === 0, true,
    compiled.targetDiagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | "));
  const program = compiled.result.program;
  const ast = program.source.ast;
  let closures = 0;
  const visit = node => {
    if (ast.is.IsArrowFunction(node)) {
      closures += 1;
      const parameter = ast.parameters(node)[0];
      assert.equal(program.records.runtimeDefault.get(parameter)?.native.kind, "value",
        "the actual incoming delegate argument cannot execute its authored default");
      assert.equal(program.records.lambdaCreation.get(node)?.staticBody, true,
        "the discarded default is not an actual lexical capture");
      assert.equal(program.records.lambdaCreation.get(node)?.kind, "cached",
        "a no-capture first-class closure uses the native shared delegate rather than a fresh allocation");
      assert.equal(program.records.captureClosure.get(node) === undefined, true,
        "no activation frame is retained solely for an unreachable default reference");
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  assert.equal(closures, 1, "the actual source arrow is checked once");
  executeCsharpConstruction(compiled, `contextual-default-capture-cost-${surface}`, false, false, [], `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("contextual default identity changed");
System.Func<object> generated = () => Tsonic.Generated.Index.create(null!);
System.Func<object> native = () => new System.Func<object, object>(static value => value);
long Measure(System.Func<object> create) {
    long before = System.GC.GetAllocatedBytesForCurrentThread();
    for (int index = 0; index < 4096; index++) System.GC.KeepAlive(create());
    return System.GC.GetAllocatedBytesForCurrentThread() - before;
}
_ = Measure(generated); _ = Measure(native);
long actual = Measure(generated); long expected = Measure(native);
if (actual != expected) throw new System.Exception("unreachable default capture allocation: " + actual + " != " + expected);
`);
});

for (const surface of ["native", "js"]) test(`${surface} capture-free factories share native identity while captured factories remain fresh`, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `
    export function make(): () => number { return () => 7; }
    export function capture(value: number): () => number { return () => value; }
    export function run(): boolean { return make() === make() && capture(7) !== capture(7); }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "" && compiled.targetDiagnostics.length === 0, true,
    `${surface}: ${compiled.sourceDiagnosticsText}; ${compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; ")}`);
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, "the shared no-capture and fresh captured factories are admitted together");
  const creations = [];
  const visit = node => {
    if (program.source.ast.is.IsArrowFunction(node)) creations.push(program.records.lambdaCreation.get(node));
    program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  assert.equal(creations.length === 2 && creations[0].kind === "cached" && creations[0].staticBody === true &&
    creations[1].kind === "fresh" && creations[1].staticBody === false, true,
  "one canonical creation owner distinguishes the exact static body from the captured activation");
  executeCsharpConstruction(compiled, `native-cached-capture-inverse-${surface}`, false, false, [], `
using Subject = Tsonic.Generated.Index;
if (!Subject.run() || !System.Object.ReferenceEquals(Subject.make(), Subject.make()) ||
    System.Object.ReferenceEquals(Subject.capture(7), Subject.capture(7)) || Subject.capture(9)() != 9D)
    throw new System.Exception("native closure-expression cache or fresh captured identity changed");
for (int index = 0; index < 4096; index++) System.GC.KeepAlive(Subject.make());
long before = System.GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 4096; index++) System.GC.KeepAlive(Subject.make());
if (System.GC.GetAllocatedBytesForCurrentThread() != before)
    throw new System.Exception("a capture-free closure allocated per evaluation");
`);
});

for (const surface of ["native", "js"]) test(`${surface} contextual defaults retain incoming, body storage and absent-branch effects independently`, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    let defaults: int32 = 0;
    function make(): unknown { defaults += 1; return { count: 7 as int32 }; }
    function count(): int32 { return defaults; }
    function present(read: (value: { count: int32 }) => boolean): boolean { return read({ count: 7 as int32 }); }
    function optional(read: (value: { count: int32 } | undefined) => boolean, flag: boolean): boolean {
      return read(flag ? { count: 7 as int32 } : undefined);
    }
    export function run(flag: boolean): boolean {
      defaults = 0;
      const first = present((value: unknown = make()): boolean => typeof value === "object");
      if (!first || count() !== 0) return false;
      const second = optional((value: unknown = make()): boolean => typeof value === "object", flag);
      return second && count() === (flag ? 0 : 1);
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.program !== undefined && compiled.targetDiagnostics.length === 0, true,
    compiled.targetDiagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | "));
  const program = compiled.result.program;
  const ast = program.source.ast;
  const contracts = [];
  const visit = node => {
    if (ast.is.IsArrowFunction(node)) {
      const parameter = ast.parameters(node)[0];
      const contract = parameter === undefined ? undefined : program.records.runtimeDefault.get(parameter);
      assert.equal(contract !== undefined && targetTypeRefKey(contract.parameterType) === targetTypeRefKey(contract.native.source) &&
        targetTypeRefKey(contract.valueType) === targetTypeRefKey(contract.native.target), true,
      "the one declaration default contract publishes the real native input and the independent body storage");
      contracts.push(contract);
      const initializer = ast.as.AsParameterDeclaration(parameter)?.Initializer;
      assert.equal(initializer !== undefined && (program.records.nativeUse.expression(initializer) === undefined) ===
        (contract.native.kind === "value"), true,
      "an always-present incoming value has no default runtime expression; the absence-bearing input retains its real default");
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  assert.equal(contracts.length === 2 && contracts[0].native.kind === "value" && contracts[1].native.kind === "guarded", true,
    "both actual native header forms are covered without changing omission or body storage into a second default decision");
  executeCsharpConstruction(compiled, `contextual-native-default-${surface}`, false, false, [], `
if (!Tsonic.Generated.Index.run(false) || !Tsonic.Generated.Index.run(true))
    throw new System.Exception("contextual default conversion or absent-branch effects changed");
`);
});

for (const surface of ["native", "js"]) test(`${surface} nominal enum return, compound storage and nullable aliases never become a numeric summary`, () => {
  const compiled = compileCsharpSource({ surface, files: { "flags.ts": `
    export enum Flags { First = 1, Second = 2 }
    export enum Wide { First = 4294967296, Second = 8589934592 }
    export enum Duplicate { First = 1, Again = 1, Second = 2 }
    export interface Named { [Flags.First]: number; }
  ` }, sourceText: `
    import { Flags, Wide, Duplicate } from "./flags.js";
    export function combine(flag: boolean): Flags { return flag ? (Flags.First | Flags.Second) : Flags.First; }
    export function conjunction(left: Flags, right: Flags): Flags { return left & right; }
    export function exclusive(left: Flags, right: Flags): Flags { return left ^ right; }
    export function complement(value: Flags): Flags { return ~value; }
    export function wide(): Wide { return Wide.First | Wide.Second; }
    export function duplicate(): Duplicate { return Duplicate.Again | Duplicate.Second; }
    export function compound(value: Flags): Flags {
      let result: Flags = value; result |= Flags.Second; result &= ~Flags.Second; result ^= Flags.First; return result;
    }
    export function defaults(value: Flags): boolean {
      switch (value) { case Flags.First: return false; case Flags.Second: return false; default: return true; }
    }
    export function copied(flag: boolean): Flags | undefined {
      const selected = flag ? Flags.First : undefined; const alias = selected; return alias;
    }
    export function run(flag: boolean): boolean {
      const stored = flag ? (Flags.First | Flags.Second) : Flags.First;
      return stored === combine(flag) && defaults(stored) === flag &&
        conjunction(stored, Flags.First) === Flags.First &&
        exclusive(stored, Flags.Second) === (flag ? Flags.First : (Flags.First | Flags.Second)) &&
        complement(complement(stored)) === stored &&
        duplicate() === (Duplicate.First | Duplicate.Second) && wide() === (Wide.First | Wide.Second) &&
        compound(stored) === (((stored | Flags.Second) & ~Flags.Second) ^ Flags.First);
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.program !== undefined && compiled.targetDiagnostics.length === 0, true,
    compiled.targetDiagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | "));
  executeCsharpConstruction(compiled, `nominal-native-enum-${surface}`, false, false, [], `
using Subject = Tsonic.Generated.Index;
foreach (bool flag in new[] { false, true }) {
    var value = Subject.combine(flag);
    if (!Subject.run(flag) || Subject.complement(Subject.complement(value)) != value ||
        (long)Subject.wide() != 12884901888L || (int)Subject.duplicate() != 3 || Subject.copied(flag).HasValue != flag ||
        (flag && (int)Subject.copied(flag)!.Value != 1))
        throw new System.Exception("nominal enum native operators, layout, value or absence changed");
}
for (int iteration = 0; iteration < 8192; iteration++) { _ = Subject.run((iteration & 1) != 0); _ = Subject.copied(true); }
long before = System.GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 4096; iteration++) {
    if (!Subject.run((iteration & 1) != 0) || !Subject.copied(true).HasValue) throw new System.Exception("enum observation");
}
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("native enum observations allocated");
`);
});

const emissionPrograms = [
  ["class and static initializers", `
    function next(): number { return 3; }
    export class Box { value = next(); static shared = next(); }
    export function run(): number { const box = new Box(); return box.value + Box.shared; }`],
  ["base constructor arguments", `import type { int32 } from "@tsonic/core/types.js";
    export class Base { value: int32; constructor(value: int32) { this.value = value; } }
    export class Derived extends Base { constructor() { super(7 / 2); } }
    export function run(): int32 { return new Derived().value; }`],
  ["parameter, pattern and lambda defaults", `
    function next(): number { return 3; }
    function parameter(value: number = next()): number { return value; }
    function pattern([value = next()]: number[]): number { return value; }
    export function run(): number { const callback = (value: number = next()) => value;
      const [item = next()] = [1]; return parameter() + pattern([]) + callback() + item; }`],
  ["template spans", 'export function run(value: number): string { return `value=${value},next=${value + 1}`; }'],
  ["switch cases", `export function run(value: number): number {
    switch (value) { case 1: return 3; case 2: return 4; default: return 5; } }`],
  ["optional chains", `export interface Box { value: number; }
    export function run(box?: Box): number { return box?.value ?? 3; }`],
  ["sequence spread", `function sum(...values: number[]): number { return values.length; }
    export function run(values: number[]): number { const result = [1, ...values, 2]; return sum(...result); }`],
  ["await operands", `async function first(): Promise<number> { return 3; }
    export async function run(): Promise<number> { return await first(); }`],
  ["yield operands", `import type { int32 } from "@tsonic/core/types.js";
    export function* run(): Generator<int32, string, unknown> { yield 1; yield 2; return "done"; }`],
  ["delete, void and typeof", `export function run(values: number[], value: number): string {
    delete values[0]; void value; return typeof value; }`],
  ["comma expression", `export function run(): number { let value = 0; return (value++, value + 1); }`],
  ["accessor bodies", `export class Box { stored = 1; get value(): number { return this.stored; }
    set value(next: number) { this.stored = next; } }
    export function run(): number { const box = new Box(); box.value = 3; return box.value; }`],
  ["IIFE callee", `export function run(value: number): number { return ((next: number) => next + 1)(value); }`],
  ["module and default export", `function next(): number { return 3; }
    const value = next(); export default value;`],
  ["compound and logical assignments and increments", `export function run(): number {
    let value = 1; value += 2; value++; --value; let optional: number | undefined = value; optional ??= 4; return optional; }`],
  ["attribute argument metadata", `import { attribute } from "@tsonic/core/lang.js";
    import { ObsoleteAttribute } from "@tsonic/dotnet/System.js";
    export class Box { run(): void {} }
    attribute<Box>().add(() => new ObsoleteAttribute("old", false));`],
];

for (const surface of ["js", "native"]) for (const [label, program] of emissionPrograms) test(
  `${surface === "js" ? "" : "native "}sealed emission context covers ${label}`, () => {
  const sourceText = surface === "native" && label === "delete, void and typeof"
    ? `export function run(values: Record<string, number>, value: number): string {
        delete values["key"]; void value; return typeof value; }`
    : surface === "native" && label === "sequence spread" ? program.replace("values.length", "values.Length") : program;
  const compiled = compileCsharpSource({ sourceText, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, `${label}: ${compiled.sourceDiagnosticsText}`);
  const errors = compiled.result.diagnostics.filter(diagnostic => diagnostic.category === "error");
  assert.equal(errors.length, 0, `${label}: ${errors.map(diagnostic => `${diagnostic.code}: ${diagnostic.message}`).join("; ")}`);
  assert.equal(compiled.result.program !== undefined && [...compiled.artifacts.keys()].some(path => path.endsWith(".cs")), true,
    `${label}: one sealed program reaches native source emission`);
});

const discardedPrograms = [
  ["as", "(() => 1) as (() => number);"],
  ["non-null", "(() => 1)!;"],
  ["type assertion", "<() => number>(() => 1);"],
  ["void", "void (() => 1);"],
  ["conditional", "flag ? () => 1 : () => 2;"],
  ["logical and", "flag && (() => 1);"],
  ["logical or", "flag || (() => 1);"],
  ["coalescing", "optional ?? (() => 1);"],
  ["comma", "(flag = !flag, (() => 1));"],
  ["nested wrappers", "((flag ? (() => 1) : (() => 2))! satisfies (() => number));"],
];

for (const surface of ["native", "js"]) for (const [label, statement] of discardedPrograms) test(
  `${surface} discarded callable ${label} is inactive, not a pending conversion`, () => {
  const compiled = compileCsharpSource({ sourceText: `
    export function run(flag: boolean, optional?: () => number): number { ${statement} return 5; }
  `, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, `${label}: ${compiled.sourceDiagnosticsText}`);
  assert.equal(compiled.targetDiagnostics.length === 0 && compiled.result.program !== undefined, true,
    `${label}: ${compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; ")}`);
  const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  assert.equal(output.length > 0 && !output.includes("=>"), true, `${label}: no discarded closure allocation reaches emission`);
});

for (const surface of ["native", "js"]) test(`${surface} discarded callable branches retain every condition and operand effect`,
  { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    let trace = 0;
    function tick(value: number): number { trace = trace * 10 + value; return value; }
    function condition(value: boolean, mark: number): boolean { tick(mark); return value; }
    function ready(): number { return 1; }
    export function run(flag: boolean): boolean {
      trace = 0;
      (() => tick(9)) as (() => number);
      (() => tick(9))!;
      <() => number>(() => tick(9));
      void (() => tick(9));
      condition(flag, 1) ? (() => tick(9)) : (() => tick(9));
      condition(flag, 2) ? (tick(3), (() => tick(9))) : (tick(4), (() => tick(9)));
      condition(flag, 5) && (tick(6), (() => tick(9)));
      condition(flag, 7) || (tick(8), (() => tick(9)));
      const optional: (() => number) | undefined = flag ? undefined : ready;
      optional ?? (tick(1), (() => tick(9)));
      (tick(2), (() => tick(9)));
      ((condition(flag, 3) ? (() => tick(9)) : (() => tick(9)))! satisfies (() => number));
      return trace === (flag ? 123567123 : 12457823);
    }
  `, surface });
  assert.equal(compiled.sourceDiagnosticsText === "" && compiled.targetDiagnostics.length === 0, true,
    `${surface}: ${compiled.sourceDiagnosticsText}; ${compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; ")}`);
  executeCsharpConstruction(compiled, `discarded-callable-effect-order-${surface}`, false, false, [],
    `if (!Tsonic.Generated.Index.run(true) || !Tsonic.Generated.Index.run(false)) throw new System.Exception("discarded callable effect order");`);
});

for (const surface of ["native", "js"]) test(`${surface} discarded coalescing preserves mixed presence, short circuits and zero native allocation`,
  { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    class Trace { static value: number = 0; }
    function tick(value: number): number { Trace.value = Trace.value * 10 + value; return value; }
    function condition(value: boolean, mark: number): boolean { tick(mark); return value; }
    function ready(): number { return 1; }
    function fail(): never { tick(9); throw new Error("discarded branch"); }
    export function observed(): number { return Trace.value; }
    export function run(flag: boolean): number {
      Trace.value = 0;
      (condition(flag, 1) ? (tick(2), () => tick(9)) : (tick(3), undefined)) ?? (tick(4), () => tick(9));
      (condition(flag, 5) ? (tick(6), undefined) : (tick(7), () => tick(9))) ?? (tick(8), () => tick(9));
      (condition(true, 1) && (condition(flag, 2) ? (() => tick(9)) : (() => tick(9)))) ?? (tick(4), () => tick(9));
      const optional: number | undefined = flag ? undefined : 1;
      (tick(5), optional) ?? (tick(6), () => tick(9));
      return Trace.value;
    }
    export function rightThrow(flag: boolean): void {
      Trace.value = 0;
      (condition(flag, 1) ? (() => tick(9)) : undefined) ?? fail();
    }
    export function falseIsPresent(): number {
      Trace.value = 0;
      (condition(false, 1) && (() => tick(9))) ?? (tick(2), () => tick(9));
      return Trace.value;
    }
    export function nullIsAbsent(flag: boolean): number {
      Trace.value = 0;
      (condition(flag, 1) ? (tick(2), () => tick(9)) : (tick(3), null)) ?? (tick(4), () => tick(9));
      return Trace.value;
    }
    export function leftThrow(): void {
      Trace.value = 0;
      (fail(), ready()) ?? (tick(8), () => tick(9));
    }
    export function allocation(flag: boolean): number {
      const captured = flag ? 1 : 2;
      (flag ? (() => captured) : undefined) ?? (() => captured + 1);
      return captured;
    }
  `, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, `${surface}: ${compiled.sourceDiagnosticsText}`);
  assert.equal(compiled.targetDiagnostics.length === 0 && compiled.result.program !== undefined, true,
    compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  assert.equal(output.includes("=>"), false, "discarded capture functions never become native delegates");
  executeCsharpConstruction(compiled, `discarded-coalescing-presence-${surface}`, false, false, [], `
    if (Tsonic.Generated.Index.run(true) != 125681256 || Tsonic.Generated.Index.run(false) != 13457125)
      throw new System.Exception("mixed presence or operand order");
    if (Tsonic.Generated.Index.falseIsPresent() != 1) throw new System.Exception("false is present, not absent");
    if (Tsonic.Generated.Index.nullIsAbsent(true) != 12 || Tsonic.Generated.Index.nullIsAbsent(false) != 134)
      throw new System.Exception("native null and undefined share the selected absence contract");
    Tsonic.Generated.Index.rightThrow(true);
    if (Tsonic.Generated.Index.observed() != 1) throw new System.Exception("present branch must skip rejection");
    bool rightFailed = false;
    try { Tsonic.Generated.Index.rightThrow(false); } catch (System.Exception) { rightFailed = true; }
    if (!rightFailed || Tsonic.Generated.Index.observed() != 19) throw new System.Exception("absent branch must retain rejection");
    bool leftFailed = false;
    try { Tsonic.Generated.Index.leftThrow(); } catch (System.Exception) { leftFailed = true; }
    if (!leftFailed || Tsonic.Generated.Index.observed() != 9) throw new System.Exception("left rejection must skip all later work");
    for (int iteration = 0; iteration < 20000; iteration++) _ = Tsonic.Generated.Index.allocation((iteration & 1) == 0);
    long before = System.GC.GetAllocatedBytesForCurrentThread();
    double total = 0;
    for (int iteration = 0; iteration < 20000; iteration++) total += Tsonic.Generated.Index.allocation((iteration & 1) == 0);
    long allocated = System.GC.GetAllocatedBytesForCurrentThread() - before;
    if (total != 30000 || allocated != 0) throw new System.Exception("discarded function allocation: " + allocated);
  `);
});

for (const surface of ["native", "js"]) test(`${surface} actual array and creation conversions close before structural publication`, () => {
  const sourceText = `
    import type { int32 } from "@tsonic/core/types.js";
    function readonlyValues(): readonly number[] { return [1, 2]; }
    function choose(flag: boolean): readonly number[] { return flag ? [1] : [2, 3]; }
    function identity(value: int32): number { return value; }
    export function run(flag: boolean): number {
      const values: readonly number[] = [...readonlyValues(), ...choose(flag)];
      const callback: (value: int32) => number = value => identity(value);
      void callback(1);
      return values.length;
    }
  `;
  const compiled = compileCsharpSource({ sourceText: surface === "native" ? sourceText.replace("values.length", "values.Length") : sourceText, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.targetDiagnostics.length === 0 && compiled.result.program !== undefined, true,
    compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  assert.equal([...compiled.artifacts.keys()].some(path => path.endsWith(".cs")), true, "actual construction conversions reach emission");
});

for (const surface of ["native", "js"]) test(`${surface} inferred async returns join native payloads once before constructing the task`,
  { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32, int64 } from "@tsonic/core/types.js";
    function narrow(): int32 { return 3; }
    function wide(): int64 { return 9007199254740993n; }
    async function completed(): Promise<int64> { return wide(); }
    async function mixed(flag: boolean) { if (flag) return narrow(); return wide(); }
    async function optional(flag: boolean) { if (flag) return wide(); }
    async function pending() { return await completed(); }
    export async function run(): Promise<boolean> {
      return await mixed(true) === 3n && await mixed(false) === 9007199254740993n &&
        await optional(false) === undefined && await optional(true) === 9007199254740993n &&
        await pending() === 9007199254740993n;
    }
  `, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.targetDiagnostics.length === 0 && compiled.result.program !== undefined, true,
    compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  executeCsharpConstruction(compiled, `native-async-payload-join-${surface}`, true);
});

for (const surface of ["native", "js"]) test(`${surface} numeric spread carriers are order-independent without erasing genuine native unions`,
  { timeout: 300_000 }, () => {
  const sourceText = `
    import type { int32, uint32, int64, float64 } from "@tsonic/core/types.js";
    function sum(...values: number[]): number { return values.length; }
    export function run(values: number[]): number {
      const prefix = [1, ...values, 2];
      const suffix = [...values, 1, 2];
      return sum(...prefix) + sum(...suffix);
    }
    export function permutations(signed: int32, unsigned: uint32): boolean {
      const left = [signed, unsigned, 0.5];
      const middle = [signed, 0.5, unsigned];
      const right = [0.5, signed, unsigned];
      return left[0] === signed && left[1] === unsigned && left[2] === 0.5 && middle[0] === signed &&
        middle[1] === 0.5 && middle[2] === unsigned && right[0] === 0.5 && right[1] === signed && right[2] === unsigned;
    }
    export function nativePairs(signed: int32, unsigned: uint32): boolean {
      const narrow = [signed, 1];
      const narrowReverse = [1, signed];
      const narrowLeft = [signed, 1, 2];
      const narrowMiddle = [1, signed, 2];
      const narrowRight = [1, 2, signed];
      const bare = [signed, unsigned];
      const explicit: number[] = [signed, unsigned, 0.5];
      void bare;
      return narrow[0] === signed && narrow[1] === 1 &&
        narrowReverse[0] === 1 && narrowReverse[1] === signed &&
        narrowLeft[0] === signed && narrowLeft[1] === 1 && narrowLeft[2] === 2 &&
        narrowMiddle[0] === 1 && narrowMiddle[1] === signed && narrowMiddle[2] === 2 &&
        narrowRight[0] === 1 && narrowRight[1] === 2 && narrowRight[2] === signed &&
        explicit[0] === signed && explicit[1] === unsigned && explicit[2] === 0.5;
    }
    export function literalBoundaries(signed: int32): boolean {
      const boundary = [signed, 2147483648];
      const explicitDouble = [signed, 1 as float64];
      return boundary[0] === signed && boundary[1] === 2147483648 &&
        explicitDouble[0] === signed && explicitDouble[1] === 1;
    }
    export function preserveNegativeZero(signed: int32): number {
      const signedZeros = [signed, -0 as float64];
      return signedZeros[1];
    }
    ${surface !== "js" ? "" : `export function authoredNegativeZero(signed: int32): number {
      const authoredZeros = [signed, -0];
      return authoredZeros[1];
    }`}
    const narrow: int32 = 1;
    const wide: int64 = 9007199254740993n;
    export const distinct = [narrow, wide];
    export const homogeneousWide = [wide, wide];
  `;
  const compiled = compileCsharpSource({ sourceText: surface === "native" ? sourceText.replace("values.length", "values.Length") : sourceText, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  const program = compiled.result.program;
  assert.equal(compiled.targetDiagnostics.length === 0 && program !== undefined, true,
    compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  const arrays = new Map();
  const ast = program.source.ast;
  const visit = node => {
    if (ast.is.IsVariableDeclaration(node)) {
      const declaration = ast.as.AsVariableDeclaration(node);
      const initializer = declaration?.Initializer;
      if (initializer !== undefined && ast.is.IsArrayLiteralExpression(initializer)) {
        arrays.set(ast.text(ast.name(node)), getCsharpArrayLiteralElementTargetType(program.records.valueRead.get(initializer)?.value));
      }
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  for (const name of ["prefix", "suffix", "left", "middle", "right"]) assert.equal(arrays.get(name)?.kind === "source-primitive" &&
    arrays.get(name)?.name === "float64", true, `${name}: actual double spread and numeric literals share the same native carrier`);
  assert.equal(arrays.get("narrow")?.kind === "source-primitive" && arrays.get("narrow")?.name === "int32", true,
    "an actual native int32 and its exact integer literal retain the admitted int32 carrier");
  for (const name of ["narrowReverse", "narrowLeft", "narrowMiddle", "narrowRight"]) assert.equal(
    arrays.get(name)?.kind === "source-primitive" && arrays.get(name)?.name === "int32", true,
    `${name}: native int32 and representable integer literals retain their carrier in every peer position`);
  for (const name of ["boundary", "explicitDouble", "signedZeros"]) assert.equal(
    arrays.get(name)?.kind === "source-primitive" && arrays.get(name)?.name === "float64", true,
    `${name}: native range, explicit float64 and signed zero prevent integral literal retargeting`);
  if (surface === "js") assert.equal(arrays.get("authoredZeros")?.kind === "source-primitive" &&
    arrays.get("authoredZeros")?.name === "float64", true, "the actual JS float64 negative-zero literal keeps its native floating carrier");
  const bare = getCsharpRuntimeUnionArms(arrays.get("bare"), program.typeDefinitions);
  assert.equal(bare?.length === 2 && bare.some(type => type.kind === "source-primitive" && type.name === "int32") &&
    bare.some(type => type.kind === "source-primitive" && type.name === "uint32"), true,
    "a bare signed/unsigned pair retains its existing checked union, never a synthetic wider carrier");
  assert.equal(arrays.get("explicit")?.kind === "source-primitive" && arrays.get("explicit")?.name === "float64", true,
    "an explicitly authored number array retains its actual native float64 contract");
  const distinct = getCsharpRuntimeUnionArms(arrays.get("distinct"), program.typeDefinitions);
  assert.equal(distinct?.length === 2 && distinct.some(type => type.kind === "source-primitive" && type.name === "int32") &&
    distinct.some(type => type.kind === "source-primitive" && type.name === "int64"), true,
    "a genuine checked union preserves both explicit native widths");
  assert.equal(arrays.get("homogeneousWide")?.kind === "source-primitive" && arrays.get("homogeneousWide")?.name === "int64", true,
    "a homogeneous native int64 array never takes a floating route");
  executeCsharpConstruction(compiled, `native-array-common-carrier-${surface}`, false, false, [],
    `if (Tsonic.Generated.Index.run(${surface === "native" ? "new double[] { 3, 4 }"
      : "new Tsonic.CSharp.Js.JSArray<double>(new double[] { 3, 4 })"}) != 8 ||
      !Tsonic.Generated.Index.permutations(-7, 4294967295U) ||
      !Tsonic.Generated.Index.nativePairs(-7, 4294967295U) ||
      !Tsonic.Generated.Index.literalBoundaries(-7) ||
      System.BitConverter.DoubleToInt64Bits(Tsonic.Generated.Index.preserveNegativeZero(-7)) != long.MinValue ||
      ${surface !== "js" ? "" : "System.BitConverter.DoubleToInt64Bits(Tsonic.Generated.Index.authoredNegativeZero(-7)) != long.MinValue ||"}
      Tsonic.Generated.Index.homogeneousWide[0] != 9007199254740993L) throw new System.Exception("native array common carrier");`);
});

for (const surface of ["native", "js"]) test(`${surface} a named interface property has no inferred physical native-field guarantee`,
  { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface, capabilities: [memoryAbiCapability("csharp")], sourceText: `
    import { abi } from "test:abi";
    import { memorylayout, addressof, torawptr, reinterpretrawptr, loadptr, storeptr, unsafecontext } from "@tsonic/core/lang.js";
    import type { uint32 } from "@tsonic/core/types.js";
    const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
    interface Box { value: uint32; }
    function create() { const value: uint32 = 7; return { value, extra: true }; }
    function change(factory: () => Box): boolean {
      unsafecontext();
      const box = factory();
      const pointer = addressof(box.value);
      const raw = torawptr(pointer, word);
      const restored = reinterpretrawptr(raw, word);
      if (restored === undefined) return false;
      storeptr(restored, 9);
      return box.value === 9 && loadptr(pointer) === 9;
    }
    export function run(): boolean { return change(create); }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.program === undefined, true, "the existing field-backing refusal precedes publication");
  assert.equal(compiled.targetDiagnostics.length === 1 && compiled.targetDiagnostics[0].code === "CSHARP_NATIVE_BACKING_NOT_PROVEN" &&
    compiled.targetDiagnostics[0].message === "Native field backing requires one complete compiler-owned mutable data field.", true,
    "a named interface's accessor contract is not invented physical field evidence");
  assert.equal([...compiled.artifacts.keys()].some(path => path.endsWith(".cs")), false, "no refused native program is emitted");
});

for (const surface of ["native", "js"]) test(`${surface} actual structural callable returns retain every native-backed physical implementation`,
  { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface, capabilities: [memoryAbiCapability("csharp")], sourceText: `
    import { abi } from "test:abi";
    import { memorylayout, addressof, torawptr, reinterpretrawptr, loadptr, storeptr, unsafecontext } from "@tsonic/core/lang.js";
    import type { uint32 } from "@tsonic/core/types.js";
    const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
    type Box = { value: uint32 };
    type Wide<Payload> = { value: uint32; payload: Payload };
    function create() { const value: uint32 = 7; return { value, extra: true }; }
    function createOther() { const value: uint32 = 7; return { value, label: "other" }; }
    function createWide(): Wide<number> { const value: uint32 = 7; return { value, payload: 0.5 }; }
    function coerce<Payload>(value: Wide<Payload>): Box { return value; }
    function transitiveFactory(): Box { return coerce(createWide()); }
    function change(factory: () => Box): boolean {
      unsafecontext();
      const box = factory();
      const pointer = addressof(box.value);
      const raw = torawptr(pointer, word);
      const restored = reinterpretrawptr(raw, word);
      if (restored === undefined) return false;
      storeptr(restored, 9);
      return box.value === 9 && loadptr(pointer) === 9;
    }
    export function run(): boolean { return change(create); }
    export function runOther(): boolean { return change(createOther); }
    export function runTransitive(): boolean { return change(transitiveFactory); }
    export function crossAlias(): boolean {
      unsafecontext();
      const original = createWide();
      const box = coerce(original);
      const pointer = addressof(box.value);
      const raw = torawptr(pointer, word);
      const restored = reinterpretrawptr(raw, word);
      if (restored === undefined) return false;
      storeptr(restored, 9);
      return original.value === 9 && box.value === 9 && loadptr(pointer) === 9;
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.targetDiagnostics.length === 0 && compiled.result.program !== undefined, true,
    compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  const program = compiled.result.program;
  const ast = program.source.ast;
  const producers = [];
  const visit = node => {
    if (ast.is.IsFunctionDeclaration(node) && ["create", "createOther"].includes(ast.text(ast.name(node)))) producers.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  assert.equal(producers.length, 2, "both actual checked callable producers are present");
  for (const producer of producers) {
    const contract = program.records.returnContract.get(producer);
    assert.equal(contract?.kind === "resolved" && program.records.nativeField.get(contract.type, "value") !== undefined, true,
      `${ast.text(ast.name(producer))}: final backing contains the actual late structural implementation`);
  }
  executeCsharpConstruction(compiled, `native-backed-structural-return-${surface}`, false, true, [],
    `if (!Tsonic.Generated.Index.run() || !Tsonic.Generated.Index.runOther() || !Tsonic.Generated.Index.runTransitive() ||
      !Tsonic.Generated.Index.crossAlias()) throw new System.Exception("native field aliases through concrete, transitive and generic structural factories");`);
});

for (const surface of ["native", "js"]) test(`${surface} actual native delegate variance preserves identity and allocates no adapter`,
  { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    type Product = { value: int32; extra: boolean };
    type View = { value: int32 };
    function make(value: int32) { return { value, extra: true }; }
    export function nativeFactory(): (value: int32) => Product { return make; }
    export function retain(factory: (value: int32) => Product): (value: int32) => View { return factory; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.targetDiagnostics.length === 0 && compiled.result.program !== undefined, true,
    compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  const program = compiled.result.program;
  const ast = program.source.ast;
  const returns = [];
  const visit = node => {
    if (ast.is.IsReturnStatement(node)) {
      const expression = ast.as.AsReturnStatement(node).Expression;
      if (expression !== undefined && ast.is.IsIdentifier(expression) && ast.text(expression) === "factory") returns.push(expression);
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  assert.equal(returns.length, 1, "the source has one actual native variant return use");
  const use = program.records.nativeUse.expression(returns[0])?.use;
  assert.equal(use?.kind === "converted" && use.input.kind === "value", true,
    "the exact consumed callable source and destination are retained");
  const selected = program.records.expressionConversion.get(returns[0], use.input.type, use.target, use.mode);
  assert.equal(selected?.kind === "implicit" && selected.proof === "reference", true,
    "the selected native relation has no adapter, captures, boxing or copy");
  executeCsharpConstruction(compiled, `native-delegate-variance-${surface}`, false, false, [], `
    var original = Tsonic.Generated.Index.nativeFactory();
    var widened = Tsonic.Generated.Index.retain(original);
    if (!System.Object.ReferenceEquals(original, widened) || widened(7).value != 7)
      throw new System.Exception("native variance keeps delegate identity and invocation");
    for (int index = 0; index < 20000; index++)
      if (!System.Object.ReferenceEquals(original, Tsonic.Generated.Index.retain(original)))
        throw new System.Exception("native variance warmup identity");
    long before = System.GC.GetAllocatedBytesForCurrentThread();
    bool same = true;
    for (int index = 0; index < 20000; index++)
      same &= System.Object.ReferenceEquals(original, Tsonic.Generated.Index.retain(original));
    long allocated = System.GC.GetAllocatedBytesForCurrentThread() - before;
    if (!same || allocated != 0) throw new System.Exception("native variance must allocate zero adapter bytes");
  `);
});

test("tagged template operands have finite contexts without changing the retained source refusal", () => {
  const compiled = compileCsharpSource({ sourceText: `
    function tag(parts: TemplateStringsArray, value: number): string { return parts[0]; }
    export function run(value: number): string { return tag\`value=\${value}\`; }`, surface: "js" });
  assert.equal(compiled.sourceDiagnosticsText === "", true, "the tagged-template control is source-valid");
  const errors = compiled.result.diagnostics.filter(diagnostic => diagnostic.category === "error");
  assert.equal(errors.length === 1 && errors[0].code === "CSHARP_UNSUPPORTED_AST" &&
    errors[0].message === "Expression is outside the current C# planning surface.", true,
    `the unsupported tagged renderer keeps its exact source refusal, never an emission-context invariant: ${errors.map(({ code, message }) => `${code}: ${message}`).join("; ")}`);
});

for (const surface of ["native", "js"]) test(`${surface} exact native function groups are not acquired as delegate operands`, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `
    let calls = 0;
    function identity<Value>(value: Value): Value { return value; }
    function next(value: number): number { calls++; return value + 1; }
    function fail(): never { calls += 10; throw new Error("argument"); }
    function invoke(callback: (value: number) => number): number { return callback(6); }
    export function run(): boolean {
      if (identity<number>(7) !== 7 || invoke(next) !== 7) return false;
      let caught = false;
      try { next(fail()); } catch { caught = true; }
      return caught && calls === 11;
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "" && compiled.targetDiagnostics.length === 0, true,
    `${surface}: ${compiled.sourceDiagnosticsText}; ${compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; ")}`);
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, "the actual checked native function contracts reach one sealed program");
  const groups = [];
  let values = 0;
  const visit = node => {
    if (program.source.ast.is.IsCallExpression(node)) {
      const selected = program.records.selectedCall.get(node)?.sourceCall;
      if (selected?.kind === "function") {
        groups.push(program.source.ast.text(selected.expression));
        assert.equal(program.records.nativeUse.expression(selected.expression) === undefined, true,
          "an exact native method group has no runtime delegate acquisition or fabricated generic carrier");
      } else if (selected?.kind === "value") {
        values++;
        assert.equal(program.records.nativeUse.expression(selected.expression) !== undefined, true,
          "a real callable value retains its admitted callee read and evaluation order");
      }
    }
    program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  assert.equal(groups.sort().join() === "fail,identity,invoke,next" && values === 1, true,
    "every actual generic, ordinary, throwing-argument and callback call form is observed exactly once");
  const generated = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  assert.equal(/_\s*=\s*(?:global::Tsonic\.Generated\.)?Index\.(?:next|identity)\s*;/u.test(generated), false,
    "a never argument cannot manufacture an invalid discarded native method group");
  executeCsharpConstruction(compiled, `native-function-group-completion-${surface}`);
});

for (const surface of ["native", "js"]) test(`${surface} an erased result boundary keeps the actual native object construction`, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    let calls: int32 = 0;
    class Base { read(): unknown { return undefined; } }
    class Source extends Base { override read() { calls++; return { count: 7 as int32 }; } }
    function direct(): unknown { calls++; return { count: 11 as int32 }; }
    export function run(): boolean {
      const source: Base = new Source();
      return typeof source.read() === "object" && typeof direct() === "object" && calls === 2;
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "" && compiled.targetDiagnostics.length === 0, true,
    `${surface}: ${compiled.sourceDiagnosticsText}; ${compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; ")}`);
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, "the checked body and its erased result boundary are both admitted");
  let constructions = 0;
  const visit = node => {
    if (program.source.ast.is.IsObjectLiteralExpression(node)) {
      constructions++;
      const use = program.records.nativeUse.expression(node)?.use;
      assert.equal(use?.kind === "converted" && use.input.kind === "value" &&
        !isCsharpJsValueTargetType(use.carrier) && isCsharpJsValueTargetType(use.target), true,
      "the source body constructs its actual closed native payload and boxes only at the selected result boundary");
      assert.equal(use.objectShape !== undefined && use.objectShape.members.length === 1 &&
        use.objectShape.members[0].type.kind === "source-primitive" && use.objectShape.members[0].type.name === "int32", true,
      "contextual unknown cannot replace the exact native member storage with dynamic slots");
    }
    program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  assert.equal(constructions, 2, "both the direct return and the native virtual result adapter retain their physical bodies");
  const generated = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  assert.equal(generated.includes("CreateDynamicObject"), false, "a closed native payload does not acquire a dynamic-object allocation");
  executeCsharpConstruction(compiled, `native-object-result-boundary-${surface}`);
});

test("transparent wrappers of discarded callable creation remain erased without a fabricated completion", () => {
  const compiled = compileCsharpSource({ sourceText: `export function run(): number {
    (() => 1);
    ((() => 2));
    (() => 3) satisfies (() => number);
    return 4;
  }` });
  assert.equal(compiled.sourceDiagnosticsText === "" && compiled.result.diagnostics.length === 0, true,
    "every discarded creation keeps its pre-existing valid source admission");
  const program = compiled.result.program;
  const wrappers = [];
  const visit = node => {
    if (program.source.ast.is.IsExpressionStatement(node)) wrappers.push(program.source.ast.as.AsExpressionStatement(node).Expression);
    program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  assert.equal(wrappers.length, 3, "all three authored creation effects are represented");
  for (const wrapper of wrappers) assert.equal(program.records.nativeUse.expression(wrapper)?.use.kind === "erased", true,
    "a transparent wrapper inherits only its actual discarded child, never a pending source failure");
});

test("native void completion preserves effectful absent calls and the selected conditional branch", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    let calls = 0;
    function absent(): undefined { calls++; return undefined; }
    function condition(): boolean { calls++; return true; }
    function call(): void { return (absent()); }
    function branch(): void { return condition() ? absent() : absent(); }
    export function run(): boolean { call(); branch(); return calls === 3; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "" && compiled.targetDiagnostics.length === 0, true,
    `native void effect control: ${compiled.sourceDiagnosticsText}; ${compiled.targetDiagnostics.map(({ message }) => message).join("; ")}`);
  const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  const voidBodies = output.match(/public static void (?:call|branch)\(\)[\s\S]*?\n        \}/gu) ?? [];
  assert.equal(voidBodies.length, 2, "both native void methods reach emission");
  assert.equal(voidBodies.some(body => /return null/u.test(body)) || /default\(void\)|_ = null/u.test(output), false,
    "the native completion never fabricates a void value or a null effect");
  executeCsharpConstruction(compiled, "native-void-absent-effect-order");
});

function owners(sourceText, surface = "js") {
  const compiled = compileCsharpSource({ sourceText, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, compiled.result.diagnostics.map(item => `${item.code}: ${item.message}`).join("; "));
  const source = createTargetSourceProgram(compiled.source);
  const ast = source.ast;
  const records = program.records;
  const nodes = [];
  const walk = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) walk(child); }); };
  for (const file of program.sourceFiles) walk(file);
  const bindingPatterns = analyzeCsharpBindingPatterns({ ast, semanticsFor: source.semantics.forNode, sourceFiles: program.sourceFiles, participation: records.nativeParticipation,
    evidence: records, operations: records, valueReads: records, objectShapes: program.objectShapes });
  const input = { ast, sourceFiles: program.sourceFiles, navigation: program.sourceNavigation, names: program.names, evidence: records, operations: records,
    nativeExpressionIssues: [],
    declarations: records, objectShapes: program.objectShapes,
    exactLiteral: records.exactLiteral, propertyKeyBindings: expression => {
      const use = records.nativeUse.expression(expression)?.use;
      return use === undefined || use.kind === "erased" ? undefined : use.propertyKeys;
    },
    valueReads: records, participation: records.nativeParticipation, bindingPatterns, callableCreation: { get: () => undefined },
    callableTarget: records.callableTarget,
    attributeApplications: records, classInitialization: records, projectTypes: program.projectTypes,
    classFactories: { classFactory: records.classFactory, factories: program.classFactories },
    expected: { entries: [], pending: [], inactive: [], expectedUse: { get: () => undefined } } };
  const text = node => String(ast.getSourceText(ast.getSourceFile(node))).slice(ast.pos(node), ast.end(node)).trim().replace(/\s+/gu, " ");
  const variable = name => nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === name);
  return { ast, nodes, records, input, text, variable };
}

test("every admitted native edge resolves to the one exact immutable publication", () => {
  const value = owners(`import type { int32 } from "@tsonic/core/types.js";
    function identity(value: int32): int32 { return value; }
    export function run(value: int32): int32 { return identity(value) + 1; }`, "native");
  const demand = analyzeCsharpNativeDemand(value.input, []);
  assert.equal(demand.unadmitted.length, 0, demand.unadmitted.map(entry => entry.reason).join("; "));
  assert.equal(demand.entries.length > 3, true, "nonvacuous closure");
  const keys = new Map();
  for (const entry of demand.entries) {
    const identities = keys.get(entry.site.subject) ?? new Set();
    assert.equal(identities.has(targetUseSiteIdentity(entry.site)), false, "one write per native use");
    identities.add(targetUseSiteIdentity(entry.site)); keys.set(entry.site.subject, identities);
    assert.equal(demand.nativeUse.get(entry.site) === entry.use, true, "lookup is the published object");
    if (entry.use.kind === "erased") continue;
    for (const child of entry.use.children) assert.equal(demand.nativeUse.get(child) !== undefined, true, `closed child ${child.role}`);
  }
});

test("an alternative never does not erase the other branch or a callable creation", () => {
  const value = owners(`function fail(): never { throw new Error("stop"); }
    export function choose(flag: boolean): number { return flag ? fail() : 3; }
    export const callback: () => never = () => fail();`);
  const arrow = value.nodes.find(node => value.ast.is.IsArrowFunction(node));
  const carrier = value.records.valueRead.get(arrow)?.value;
  assert.equal(carrier !== undefined, true, "native-use-closure:58: carrier !== undefined");
  const demand = analyzeCsharpNativeDemand({ ...value.input, callableCreation: { get: node => node === arrow ? { kind: "selected", carrier } : undefined } }, []);
  const conditional = demand.entries.find(entry => entry.use.kind !== "erased" && entry.use.evaluation.kind === "conditional");
  assert.equal(conditional !== undefined && conditional.use.completion.kind === "value", true, "native-use-closure:61: conditional !== undefined && conditional.use.completion.kind === \"value\"");
  const creation = demand.entries.find(entry => entry.use.expression === arrow);
  assert.equal(creation !== undefined && creation.use.kind !== "erased" && creation.use.evaluation.kind === "creation" &&
    creation.use.completion.kind === "value" && creation.use.children.length === 0, true, "native-use-closure:64: creation !== undefined && creation.use.kind !== \"erased\" && creation.use.evaluation.kind =");
  assert.equal(demand.nativeUse.order(arrow)?.length > 0, true, "the body is still in compilation order");
});

test("a physical collection carrier survives a never completion before its outer conversion", () => {
  const value = owners(`function fail(): never { throw new Error("stop"); } export const result: number[] = [fail()];`);
  const declaration = value.variable("result");
  const expression = value.ast.as.AsVariableDeclaration(declaration).Initializer;
  const carrier = Object.freeze({ kind: "array", element: csharpSourcePrimitiveTargetType("float64") });
  const target = csharpObjectTargetType();
  const site = csharpNativeUseSite(declaration, { kind: "initializer" }, { target });
  const stage = csharpNativeUseSite(expression, { kind: "constructed-result" }, { target });
  const use = Object.freeze({ expression, carrier, target, readProjection: "projected", strength: "required", exactInteger: false, mode: "implicit", representation: "convert",
    children: Object.freeze([stage]), construction: Object.freeze({ site: stage, carrier, children: Object.freeze([]) }) });
  const expected = { entries: [{ site, use }], pending: [], inactive: [], expectedUse: { get: request =>
    request.subject === site.subject && targetUseSiteIdentity(request) === targetUseSiteIdentity(site) ? use : undefined } };
  const demand = analyzeCsharpNativeDemand({ ...value.input, expected }, []);
  const constructed = demand.nativeUse.get(stage);
  const converted = demand.nativeUse.get(site);
  assert.equal(constructed?.kind === "constructed" && constructed.carrier === carrier && constructed.completion.kind === "never", true, "native-use-closure:83: constructed?.kind === \"constructed\" && constructed.carrier === carrier && constructed.comp");
  assert.equal(converted?.kind === "converted" && converted.carrier === carrier && converted.target === target && converted.completion.kind === "never", true, "native-use-closure:84: converted?.kind === \"converted\" && converted.carrier === carrier && converted.target === t");
});

test("different finalized contexts and pending data remain private, not a first-target fallback", () => {
  const value = owners("export const result = 1;", "native");
  const declaration = value.variable("result");
  const expression = value.ast.as.AsVariableDeclaration(declaration).Initializer;
  const entries = ["int32", "float64"].map(name => {
    const target = csharpSourcePrimitiveTargetType(name);
    return { site: csharpNativeUseSite(declaration, { kind: "initializer" }, { target }), use: {
      expression, carrier: target, target, readProjection: "projected", strength: "required", exactInteger: false, mode: "implicit", representation: "construct", children: [] } };
  });
  const demand = analyzeCsharpNativeDemand({ ...value.input, expected: { entries, pending: [], inactive: [], expectedUse: { get: () => undefined } } }, []);
  assert.equal(demand.entries.some(entry => entry.use.expression === expression), false, "neither target is silently selected");
  assert.equal(demand.unadmitted.some(entry => entry.expression === expression && entry.reason === "use-context-unresolved"), true, "native-use-closure:98: demand.unadmitted.some(entry => entry.expression === expression && entry.reason === \"use-c");
});

test("actual native key refusals precede expected-slot pending and retain every original diagnostic", () => {
  const value = owners("export const result = { first: 1, second: 2 };", "native");
  const declaration = value.variable("result");
  const expression = value.ast.as.AsVariableDeclaration(declaration).Initializer;
  const names = value.ast.properties(expression).map(property => value.ast.name(property));
  assert.equal(names.length === 2 && names.every(name => name !== undefined), true, "two actual checked property identities");
  const issues = names.map((sourceNode, index) => Object.freeze({ category: "error", source: "tsonic-csharp",
    code: "CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN", sourceNode, message: `Exact selected key refusal ${index}.`, requiredBy: [expression] }));
  const site = csharpNativeUseSite(declaration, { kind: "initializer" });
  const demand = analyzeCsharpNativeDemand({ ...value.input, nativeExpressionIssues: issues,
    expected: { ...value.input.expected, pending: [{ site, expression, reason: "inconsistent-request" }] } }, []);
  assert.equal(demand.unadmitted.length, 2, "both selected key refusals replace pending at the actual use root");
  assert.equal(demand.unadmitted.every((entry, index) => entry.kind === "source-refusal" && entry.requiredBy === expression &&
    entry.diagnostic === issues[index]), true, "the original diagnostic and actual required expression keep separate identities");
  assert.equal(demand.nativeUse.expression(expression) === undefined, true, "a refused expression never receives a fabricated native use");
});

test("a selected external source callee refuses before unresolved argument grouping", () => {
  const value = owners("function make(value: number): number { return value; } export const result = make(7);", "native");
  const node = value.nodes.find(candidate => value.ast.is.IsCallExpression(candidate));
  const original = value.input.operations.selectedCall.get(node);
  assert.equal(node !== undefined && original?.target?.kind === "source-owned", true,
    "the actual checked source-owned call supplies the existing operation boundary");
  const reason = "The exact selected source callee is external to the project and has no C# target relation.";
  const selected = Object.freeze({ ...original, sourceCall: Object.freeze({ kind: "rejected", reason }),
    sourceArgumentGrouping: undefined });
  const operations = { ...value.input.operations, selectedCall: { get: candidate => candidate === node
    ? selected : value.input.operations.selectedCall.get(candidate) } };
  const demand = analyzeCsharpNativeDemand({ ...value.input, operations }, []);
  const refusal = demand.unadmitted[0];
  assert.equal(demand.unadmitted.length === 1 && refusal.kind === "source-refusal" && refusal.requiredBy === node &&
    refusal.diagnostic.sourceNode === node && refusal.diagnostic.code === "CSHARP_UNSUPPORTED_AST" &&
    refusal.diagnostic.message === reason, true,
  "the selected source callee owns the one precise refusal, not an argument or result conversion cascade");
  assert.equal(demand.nativeUse.expression(node) === undefined, true,
    "an unresolved argument group cannot turn a rejected source API into a fabricated native call");
});

for (const surface of ["native", "js"]) test(`${surface} actual ambient admission precedes pending slots without observing an erased body`, () => {
  const value = owners(`
declare const external: number;
export function run(): number {
  function hidden(): number { return external; }
  return 42;
}`, surface);
  const hidden = value.nodes.find(node => value.ast.is.IsFunctionDeclaration(node) && value.ast.text(value.ast.name(node)) === "hidden");
  const reference = value.nodes.find(node => value.ast.is.IsIdentifier(node) && value.ast.text(node) === "external" &&
    value.ast.is.IsReturnStatement(value.ast.parent(node)));
  assert.equal(hidden !== undefined && reference !== undefined && value.records.nativeParticipation.get(hidden) === "erased", true,
    "the real canonical producer erases the exact original dormant body and retains its checked reference");
  const dormant = analyzeCsharpNativeDemand(value.input, []);
  assert.equal(dormant.unadmitted.length === 0 && dormant.nativeUse.expression(reference) === undefined, true,
    "native demand does not invent an implementation obligation for an erased body");
  const site = csharpNativeUseSite(value.ast.parent(reference), { kind: "return" });
  const demand = analyzeCsharpNativeDemand({ ...value.input,
    participation: { get: node => node === hidden ? "body" : value.input.participation.get(node) },
    expected: { ...value.input.expected, pending: [{ site, expression: reference, reason: "inconsistent-request" }] },
  }, []);
  const refusals = demand.unadmitted.filter(entry => entry.kind === "source-refusal");
  const refusal = refusals[0];
  assert.equal(refusals.length === 1 && refusal.requiredBy === reference && refusal.diagnostic.sourceNode === reference &&
    refusal.diagnostic.code === "CSHARP_AMBIENT_VALUE_IMPLEMENTATION_MISSING" &&
    refusal.diagnostic.message === "A runtime read of an authored ambient variable requires an exact native implementation.", true,
  "the same actual runtime reference reports its original source refusal before an expected-slot pending or missing-fact invariant");
  assert.equal(demand.unadmitted.some(entry => entry.kind === "pending-use" && entry.expression === reference), false,
    "the precise implementation refusal is not replaced by pending carrier evidence");
  assert.equal(demand.nativeUse.expression(reference) === undefined, true,
    "refused actual use cannot publish an invented native binding or expression");
});

for (const [label, body, expression, family] of [
  ["call", "function make(): number { return 1; } export const result = make();", "make()", "selectedCall"],
  ["construction", "class Box { value = 1; } export const result = new Box();", "new Box()", "selectedConstruction"],
  ["property", "const box = { value: 1 }; export const result = box.value;", "box.value", "selectedProperty"],
  ["element", "const values = [1]; export const result = values[0];", "values[0]", "selectedElement"],
]) test(`a selected ${label} refusal reaches analysis with its canonical code, node, reason and complete evidence`, () => {
  const value = owners(body, "native");
  const node = value.nodes.find(candidate => value.text(candidate) === expression &&
    value.input.operations[family].get(candidate) !== undefined);
  assert.equal(node !== undefined, true, `${label}: the real operation owner publishes its selected boundary`);
  const original = value.input.operations[family].get(node);
  const diagnostic = Object.freeze({ extensionId: "test-source-policy", extensionCode: "EXACT_NATIVE_RELATION",
    publicCode: "DO_NOT_SUBSTITUTE_PUBLIC_CODE", numericCode: 9101001, category: "error",
    nodeOrSpan: node, message: `Selected ${label} native relation is not closed.`, evidence: Object.freeze([
      Object.freeze({ message: "The selected physical carrier is exact." }),
      Object.freeze({ message: "Its required native relation is absent." }),
      Object.freeze({ message: "The selected physical carrier is exact." }),
    ]) });
  const target = Object.freeze({ kind: "rejected", diagnostic });
  const selected = label === "property" ? { ...original, selection: target }
    : { ...original, target };
  const operations = { ...value.input.operations, [family]: { get: candidate => candidate === node
    ? selected : value.input.operations[family].get(candidate) } };
  const demand = analyzeCsharpNativeDemand({ ...value.input, operations }, []);
  const refusals = demand.unadmitted.filter(entry => entry.kind === "source-refusal");
  const refusal = refusals[0];
  assert.equal(refusals.length === 1 && refusal.requiredBy === node && refusal.diagnostic.sourceNode === node &&
    refusal.diagnostic.code === "TS9101001" && refusal.diagnostic.category === diagnostic.category &&
    refusal.diagnostic.source === diagnostic.extensionId && refusal.diagnostic.message === diagnostic.message, true,
  `${label}: the one canonical mapper preserves the actual selected node, numeric code, category, owner and reason`);
  assert.equal(refusal.diagnostic.evidence?.length === 2 &&
    refusal.diagnostic.evidence[0] === diagnostic.evidence[0].message &&
    refusal.diagnostic.evidence[1] === diagnostic.evidence[1].message && Object.isFrozen(refusal.diagnostic.evidence), true,
  `${label}: all distinct evidence survives once, in its original order`);
  assert.equal(demand.nativeUse.expression(node) === undefined, true,
    `${label}: a refused operation is never published as an accepted native use`);
});

test("an actual selected empty construct differs from an erased construct for native key requirements", () => {
  const value = owners("export function accept(): void {}", "native");
  const declaration = value.nodes.find(node => value.ast.is.IsFunctionDeclaration(node));
  const sourceNode = value.ast.name(declaration);
  const issue = Object.freeze({ category: "error", source: "tsonic-csharp", code: "CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN",
    sourceNode, message: "Exact selected native signature key refusal.", requiredBy: [declaration] });
  const selected = analyzeCsharpNativeDemand({ ...value.input, nativeExpressionIssues: [issue] }, []);
  assert.equal(selected.unadmitted.length === 1 && selected.unadmitted[0].kind === "source-refusal" &&
    selected.unadmitted[0].requiredBy === declaration && selected.unadmitted[0].diagnostic === issue, true,
  "a valid empty native signature still admits its exact key requirements");
  const erased = analyzeCsharpNativeDemand({ ...value.input, nativeExpressionIssues: [issue],
    participation: { get: node => node === declaration ? "erased" : value.input.participation.get(node) } }, []);
  assert.equal(erased.unadmitted.length, 0, "the same owner-selected erasure has no native key obligation");
  assert.equal(erased.nativeUse.order(declaration)?.length, 0, "erasure keeps the established empty native order");
});

for (const [name, type, expression] of [["integer", "int32", "-2"], ["negative-zero", "float32", "-0"]]) {
  test(`a finalized ${name} literal is one native construction without its source spelling operand`, () => {
    const value = owners(`import type { ${type} } from "@tsonic/core/types.js"; export const result: ${type} = ${expression};`, "native");
    const declaration = value.variable("result");
    const initializer = value.ast.as.AsVariableDeclaration(declaration).Initializer;
    const carrier = csharpSourcePrimitiveTargetType(type);
    const literal = value.records.exactLiteral.get(initializer, carrier);
    assert.equal(literal?.kind === "resolved", true, "the real literal producer admits the authored token");
    const site = csharpNativeUseSite(declaration, { kind: "initializer" }, { target: carrier });
    const use = Object.freeze({ expression: initializer, carrier, target: carrier, readProjection: "projected", strength: "required", exactInteger: false,
      mode: "implicit", representation: "construct", children: Object.freeze([]), literal: literal.recipe });
    const expected = { entries: [{ site, use }], pending: [], inactive: [], expectedUse: { get: request =>
      request.subject === site.subject && targetUseSiteIdentity(request) === targetUseSiteIdentity(site) ? use : undefined } };
    const demand = analyzeCsharpNativeDemand({ ...value.input, expected }, []);
    const selected = demand.nativeUse.get(site);
    assert.equal(selected?.kind === "constructed" && selected.carrier === carrier && selected.completion.kind === "value", true,
      "one exact native literal carrier and completing construction");
    assert.equal(selected.children.length, 0, "literal token spelling does not create a runtime operand");
    assert.equal(demand.entries.some(entry => entry.site.subject === initializer && entry.site.role === "operand:only"), false,
      "no source-unary operand is admitted for the finalized literal");
    assert.equal(demand.requiredBindingRoots.includes(declaration), true, "the completing initializer requires its binding root");
  });
}

test("binding requirements follow actual completion and retain signature parameters", () => {
  const value = owners(`
    function fail(): never { throw new Error("stop"); }
    export interface Contract { accept([value]: [number]): number; }
    function make(value: number): [number] { return [value]; }
    export function run(): number { const [value] = make(fail()); return value; }
  `);
  const demand = analyzeCsharpNativeDemand(value.input, []);
  const stopped = value.nodes.find(node => value.ast.is.IsVariableDeclaration(node) &&
    value.ast.is.IsArrayBindingPattern(value.ast.name(node)));
  assert.equal(stopped !== undefined, true, "one destructuring declaration");
  assert.equal(demand.requiredBindingRoots.includes(stopped), false, "a never-completing initializer needs no projection payload");
  const parameter = value.nodes.find(node => value.ast.is.IsParameterDeclaration(node) &&
    value.ast.is.IsArrayBindingPattern(value.ast.name(node)));
  assert.equal(parameter !== undefined, true, "one signature parameter");
  assert.equal(demand.requiredBindingRoots.includes(parameter), true, "a retained signature keeps its parameter projection requirement");
  assert.equal(Object.isFrozen(demand.requiredBindingRoots), true, "required-root publication is immutable");
});

for (const surface of ["native", "js"]) test(`${surface} source-owned member admission closes every selected source boundary before publication`, () => {
  const value = owners("export function read(value: { item: number }): number { return value.item; }", surface);
  const node = value.nodes.find(candidate => value.ast.is.IsPropertyAccessExpression(candidate) && value.text(candidate) === "value.item");
  const original = value.records.selectedProperty.get(node);
  const classification = original?.sourceOwned;
  assert.equal(original?.selection.kind === "source-owned" && classification?.shapeMember?.kind === "resolved" &&
    classification.objectShape !== undefined, true, "the real producer supplies one exact checked member in its complete native shape");
  const admitted = admitCsharpSourceOwnedMemberRead(value.input, node, { selection: original.selection, classification });
  assert.equal(admitted.kind, "resolved", "the actual selected property is admitted without a planner or artifact validator");
  const missing = [
    ["classification", undefined, "A source-owned property has no sealed C# source-property classification."],
    ["selected result", { ...classification, selectedReadType: undefined },
      "The exact selected source property read has no closed C# flow representation."],
  ];
  for (const [label, sourceOwned, reason] of missing) {
    const operations = { ...value.input.operations, selectedProperty: { get: candidate => candidate === node
      ? { ...original, sourceOwned } : value.input.operations.selectedProperty.get(candidate) } };
    const demand = analyzeCsharpNativeDemand({ ...value.input, operations }, []);
    assert.equal(demand.unadmitted.some(entry => entry.kind === "pending-use" && entry.expression === node &&
      entry.reason === "operation-unresolved" && entry.message === reason), true,
    `${label}: internal missing producer evidence remains pending with its exact cause, never a new source limitation`);
    assert.equal(demand.unadmitted.some(entry => entry.kind === "source-refusal"), false,
      `${label}: incomplete native evidence is not disguised as an unsupported source program`);
    assert.equal(demand.nativeUse.expression(node) === undefined, true, `${label}: missing facts cannot publish a native expression`);
  }
  for (const field of ["jsValueOperation", "runtimeUnionProperty", "jsValueProperty"]) {
    const reason = `Exact existing ${field} source refusal.`;
    const operations = { ...value.input.operations, selectedProperty: { get: candidate => candidate === node
      ? { ...original, sourceOwned: { ...classification, [field]: Object.freeze({ kind: "rejected", reason }) } }
      : value.input.operations.selectedProperty.get(candidate) } };
    const site = csharpNativeUseSite(value.ast.parent(node), { kind: "return" });
    const demand = analyzeCsharpNativeDemand({ ...value.input, operations,
      expected: { ...value.input.expected, pending: [{ site, expression: node, reason: "inconsistent-request" }] } }, []);
    const refusals = demand.unadmitted.filter(entry => entry.kind === "source-refusal");
    assert.equal(refusals.length === 1 && refusals[0].requiredBy === node && refusals[0].diagnostic.sourceNode === node &&
      refusals[0].diagnostic.code === "CSHARP_UNSUPPORTED_AST" && refusals[0].diagnostic.message === reason, true,
    `${field}: the identical original selected refusal reaches the one source diagnostic boundary before pending conversion slots`);
    assert.equal(demand.nativeUse.expression(node) === undefined, true, `${field}: a rejected member is never an admitted artifact`);
  }
  const naming = { ...classification, objectShape: undefined, shapeMember: undefined };
  const noName = admitCsharpSourceOwnedMemberRead({ ...value.input,
    names: { resolve: () => ({ kind: "rejected", reason: "Exact canonical name rejection." }) } }, node,
  { selection: original.selection, classification: naming });
  assert.equal(noName.kind === "rejected" && noName.reason ===
    "The exact selected source property has no C#-representable declaration name. Exact canonical name rejection.", true,
  "the one existing source name plan owns the complete native member spelling refusal");
});

for (const surface of ["native", "js"]) test(`${surface} admitted generic member values preserve their actual owners, storage, aliases and single receiver evaluation`,
  { timeout: 300_000 }, () => {
  const compiled = compileCsharpNativeUseSource({ surface, sourceText: genericObjectMethodValueSource });
  assert.equal(compiled.sourceDiagnosticsText, "", "all original quantified method, alias, projection and storage sources are retained");
  assert.equal(compiled.targetDiagnostics.length === 0 && compiled.result.program !== undefined, true,
    compiled.targetDiagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | "));
  const program = compiled.result.program;
  const ast = program.source.ast;
  let properties = 0;
  const visit = node => {
    const entry = program.records.nativeUse.expression(node);
    const property = program.records.selectedProperty.get(node);
    if (entry !== undefined && entry.use.kind !== "erased" && entry.use.kind !== "location" &&
      property?.selection.kind === "source-owned") {
      const admitted = admitCsharpSourceOwnedMemberRead({ ast, names: program.names, navigation: program.sourceNavigation }, node,
        { selection: property.selection, classification: property.sourceOwned });
      assert.equal(admitted.kind, "resolved", "every actual generic member emission consumes its same complete source-owned evidence");
      properties += 1;
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  assert.equal(properties > 0, true, "the full original generic member storage/owner program exercises a nonvacuous admission domain");
  executeCsharpConstruction(compiled, `admitted-generic-source-members-${surface}`);
});

for (const surface of ["native", "js"]) for (const row of unsupportedGenericCallableOwnershipCases.filter(row => row.name.startsWith("nominal-"))) {
  test(`${surface} ${row.name} retains the exact original pre-seal member refusal`, () => {
    const compiled = compileCsharpNativeUseSource({ surface, sourceText: row.source });
    assert.equal(compiled.sourceDiagnosticsText, "", "the original unsupported native extraction remains valid checked source");
    assert.equal(compiled.targetDiagnostics.length, 1, "the selected native callable-value owner reports exactly one original refusal");
    assert.equal(compiled.targetDiagnostics[0].code, row.code);
    assert.equal(compiled.targetDiagnostics[0].message, "An extracted quantified nominal method has no supported native callable-value owner.");
    const ast = compiled.nativeStage.source.ast;
    const node = compiled.nativeStage.diagnostics[0].sourceNode;
    assert.equal(node !== undefined && ast.is.IsPropertyAccessExpression(node), true,
      "the original extracted property owns the refusal before a target program or backend can exist");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
      "unsupported quantified extraction publishes no program, plan or artifacts");
  });
}

for (const surface of ["native", "js"]) test(`${surface} native unary completions retain the actual promoted CLR result before boxing`,
  { timeout: 300_000 }, () => {
  const smallTypes = [["I8", "int8", "sbyte", "-128"], ["U8", "uint8", "byte", "255"],
    ["I16", "int16", "short", "-32768"], ["U16", "uint16", "ushort", "65535"]];
  const cases = smallTypes.flatMap(([suffix, type, nativeType, value]) => [
    { name: `plus${suffix}`, type, nativeType, value, operator: "+", result: "int32", nativeResult: "int", expected: Number(value) },
    { name: `minus${suffix}`, type, nativeType, value, operator: "-", result: "int32", nativeResult: "int", expected: -Number(value) },
    { name: `complement${suffix}`, type, nativeType, value, operator: "~", result: "int32", nativeResult: "int", expected: ~Number(value) },
  ]);
  cases.push(
    { name: "plusU32", type: "uint32", nativeType: "uint", value: "uint.MaxValue", operator: "+",
      result: "uint32", nativeResult: "uint", expected: "uint.MaxValue" },
    { name: "minusU32", type: "uint32", nativeType: "uint", value: "uint.MaxValue", operator: "-",
      result: "int64", nativeResult: "long", expected: "-4294967295L" },
    { name: "complementU32", type: "uint32", nativeType: "uint", value: "uint.MaxValue", operator: "~",
      result: "uint32", nativeResult: "uint", expected: "0U" },
    { name: "prefixI8", type: "int8", nativeType: "sbyte", value: "7", operator: "++",
      result: "int8", nativeResult: "sbyte", expected: "8" },
    { name: "postfixI8", type: "int8", nativeType: "sbyte", value: "7", operator: "--",
      postfix: true, result: "int8", nativeResult: "sbyte", expected: "7" },
    { name: "decrementI8", type: "int8", nativeType: "sbyte", value: "7", operator: "--",
      result: "int8", nativeResult: "sbyte", expected: "6" },
    { name: "incrementI8", type: "int8", nativeType: "sbyte", value: "7", operator: "++",
      postfix: true, result: "int8", nativeResult: "sbyte", expected: "7" },
    { name: "prefixU32", type: "uint32", nativeType: "uint", value: "7", operator: "++",
      result: "uint32", nativeResult: "uint", expected: "8U" },
    { name: "postfixU32", type: "uint32", nativeType: "uint", value: "7", operator: "--",
      postfix: true, result: "uint32", nativeResult: "uint", expected: "7U" },
    { name: "minusF32", type: "float32", nativeType: "float", value: "1.5F", operator: "-",
      result: "float32", nativeResult: "float", expected: "-1.5F" },
  );
  const sourceText = `
    import type { int8, uint8, int16, uint16, int32, uint32, float32 } from "@tsonic/core/types.js";
    ${cases.map(row => `export function ${row.name}(value: ${row.type}) { return ${row.postfix ? `value${row.operator}` : `${row.operator}value`}; }`).join("\n")}
    export function boxedMinusI8(value: int8): unknown { return -value; }
    export function boxedMinusU32(value: uint32): unknown { return -value; }
    export function boxedLiteral(): unknown { return -1; }
    export function literalDestination(): int8 { return -128; }
    let calls: int32 = 0;
    function observe(value: int8): int8 { calls += 1; return value; }
    export function ordered(): int32 {
      calls = 0;
      const result = -observe(-128);
      return result + calls;
    }
  `;
  const compiled = compileCsharpNativeUseSource({ surface, sourceText });
  assert.equal(compiled.sourceDiagnosticsText, "", "all original numeric widths remain checked source");
  assert.equal(compiled.targetDiagnostics.length === 0 && compiled.result.program !== undefined, true,
    compiled.targetDiagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | "));
  const program = compiled.result.program;
  const ast = program.source.ast;
  const expected = new Map(cases.map(row => [row.name, row.result]));
  let observed = 0;
  const visit = (node, owner) => {
    const name = ast.is.IsFunctionDeclaration(node) ? ast.text(ast.name(node)) : owner;
    if (ast.is.IsFunctionDeclaration(node) && expected.has(name)) {
      const contract = program.records.callableTarget.entry(node);
      assert.equal(contract?.returnType.kind === "source-primitive" && contract.returnType.name === expected.get(name), true,
        `${name}: inferred return storage retains the actual native unary result`);
    }
    if ((ast.is.IsPrefixUnaryExpression(node) || ast.is.IsPostfixUnaryExpression(node)) && expected.has(name)) {
      const selected = program.records.unaryOperation.get(node)?.target;
      const use = program.records.nativeUse.expression(node)?.use;
      assert.equal(selected?.kind === "resolved" && selected.resultType.kind === "source-primitive" &&
        selected.resultType.name === expected.get(name), true, `${name}: the pre-seal operator owns native promotion`);
      assert.equal(use !== undefined && use.kind !== "erased" && use.completion.kind === "value" &&
        use.completion.type.kind === "source-primitive" && use.completion.type.name === expected.get(name), true,
      `${name}: native consumption publishes that same physical result rather than a compensating boxing cast`);
      observed += 1;
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child, name); });
  };
  for (const file of program.sourceFiles) visit(file);
  assert.equal(observed, cases.length, "every unary form has its actual source and native-use witness");
  executeCsharpConstruction(compiled, `native-unary-promoted-completions-${surface}`, false, false, [], `
using Subject = Tsonic.Generated.Index;
${cases.map(row => `System.Func<${row.nativeType}, ${row.nativeResult}> ${row.name} = Subject.${row.name};
if (${row.name}((${row.nativeType})${row.value}) != ${row.expected})
    throw new System.Exception("${row.name}: actual CLR signature or numeric value");`).join("\n")}
if (Subject.boxedMinusI8(sbyte.MinValue).unwrap() is not int signed || signed != 128 ||
    Subject.boxedMinusU32(uint.MaxValue).unwrap() is not long unsigned || unsigned != -4294967295L ||
    Subject.boxedLiteral().unwrap() is not double literal || literal != -1D ||
    Subject.literalDestination() != sbyte.MinValue || Subject.ordered() != 129)
    throw new System.Exception("native unary boxing type, explicit literal destination or single evaluation changed");
for (int index = 0; index < 20000; index++) {
    _ = Subject.minusI8(sbyte.MinValue);
    _ = Subject.minusU32(uint.MaxValue);
}
long before = System.GC.GetAllocatedBytesForCurrentThread();
long total = 0;
for (int index = 0; index < 20000; index++) total += Subject.minusI8(sbyte.MinValue) + Subject.minusU32(uint.MaxValue);
if (total != (128L - uint.MaxValue) * 20000L || System.GC.GetAllocatedBytesForCurrentThread() != before)
    throw new System.Exception("native promoted unary operations preserve values with zero additional allocations");
`);
});

for (const surface of ["native", "js"]) for (const [sourceType, carrier] of [["uint64", "uint64"], ["nativeUint", "native-uint"]]) {
  test(`${surface} unary minus rejects the actual unsupported ${sourceType} operator before publication`, () => {
    const compiled = compileCsharpNativeUseSource({ surface, sourceText: `
      import type { ${sourceType} } from "@tsonic/core/types.js";
      export function invalid(value: ${sourceType}) { return -value; }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the native operator, not a source type error, owns this refusal");
    assert.equal(compiled.targetDiagnostics.length, 1, "one actual unsupported native operator is reported");
    const issue = compiled.targetDiagnostics[0];
    assert.equal(issue.code, "CSHARP_UNSUPPORTED_AST", "the existing source-refusal boundary retains its diagnostic code");
    assert.equal(issue.message, `C# unary '-' is not defined for the native '${carrier}' carrier.`);
    const original = compiled.nativeStage.diagnostics[0];
    const ast = compiled.nativeStage.source.ast;
    assert.equal(original.sourceNode !== undefined && ast.is.IsPrefixUnaryExpression(original.sourceNode), true,
      "the exact authored unary expression owns its diagnostic before sealing");
    const range = ast.authoredRange(original.sourceNode);
    const file = ast.getSourceFile(original.sourceNode);
    assert.equal(range.kind === "authored" && file !== undefined &&
      ast.getSourceText(file).slice(range.start, range.end) === "-value", true,
    "the original operand identity and source range are retained");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
      "invalid predefined unsigned negation cannot reach a backend or publish native artifacts");
  });
}

test("the canonical native binding domain includes actual local declarations and selects catch bindings once", () => {
  const value = owners(`
    export function initializerless<T>(value: T): T {
      let T: T | undefined;
      if (T === undefined) return value;
      return T;
    }
    export function named<T>(value: T): T {
      function T(other: T): T { return other; }
      return T(value);
    }
    export function used<T>(value: T): T {
      try { return value; }
      catch (T) { if (T instanceof Error) return value; throw T; }
    }
    export function rethrown<T>(value: T): T { try { return value; } catch (T) { throw T; } }
    export function unused<T>(value: T): T { try { return value; } catch (T) { return value; } }
  `, "native");
  const demand = analyzeCsharpNativeDemand(value.input, []);
  const initializerless = value.nodes.find(node => value.ast.is.IsVariableDeclaration(node) &&
    value.ast.is.IsVariableDeclarationList(value.ast.parent(node)) && value.ast.text(value.ast.name(node)) === "T");
  const localFunction = value.nodes.find(node => value.ast.is.IsFunctionDeclaration(node) &&
    value.ast.text(value.ast.name(node)) === "T");
  assert.equal(initializerless !== undefined && demand.requiredBindingRoots.includes(initializerless), true,
    "an actual initializer-less native local has a binding even without an initializer use");
  assert.equal(localFunction !== undefined && value.records.nativeParticipation.get(localFunction) === "body" &&
    demand.requiredBindingRoots.includes(localFunction), true,
  "a native local function's existing body participation owns its emitted value name");
  const clauses = value.nodes.filter(node => value.ast.is.IsCatchClause(node));
  assert.equal(clauses.length, 3, "all original used, rethrow-only and unused catch clauses are present");
  for (const [index, clause] of clauses.entries()) {
    const declaration = value.ast.as.AsCatchClause(clause).VariableDeclaration;
    const order = demand.nativeUse.order(clause);
    assert.equal(declaration !== undefined && order !== undefined, true, "the actual checked clause and its order are published");
    const required = index === 0;
    assert.equal(demand.requiredBindingRoots.includes(declaration), required,
      `${index}: only an actual source value use retains the authored catch binding`);
    assert.equal(order.some(step => step.kind === "construct" && step.construct === declaration), required,
      `${index}: the data-only backend consumes the same canonical catch selection`);
    assert.equal(demand.nativeUse.order(declaration) !== undefined, required,
      `${index}: an omitted binding has no separate native construct to be reselected`);
  }
});
