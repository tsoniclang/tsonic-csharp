import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";
import { csharpConstructorBaseCall, csharpConstructorRequiresPreparation } from "../../../../dist/analysis/callables/constructor-entry.js";
import { createCsharpPlanningContext } from "../../../../dist/backend/planner/context.js";
import { planConstructorDeclarations } from "../../../../dist/backend/planner/declarations/classes/constructors.js";
import { csharpProgramSourceFiles } from "../../../helpers/program-source-files.mjs";

test("implicit derived constructors forward exact selected generic and optional source parameters", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int } from "@tsonic/csharp/types.js";
    export class Base<T> {
      constructor(value: T, count?: int) { void value; void count; }
    }
    export class Derived extends Base<string> {}
    export function run(): Derived { return new Derived("ready", 1); }
  ` });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static Derived run()
        {
            return new Derived("ready", 1);
        }
    }
    public class Base<T> : Tsonic.CSharp.Runtime.ITsClosedValueCarrier
    {
        public Base(T value, int? count = null)
        {
            _ = value;
            _ = count;
        }
    }
    public class Derived : Base<string>, Tsonic.CSharp.Runtime.ITsClosedValueCarrier
    {
        public Derived(string value) : base(value)
        {
        }
        public Derived(string value, int? count) : base(value, count)
        {
        }
    }
}
`);
});

test("inherited required constructors prevent invalid C# object initializers", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export class Base {
      value: string;
      constructor(value: string) { this.value = value; }
    }
    export class Derived extends Base {}
    export const item: Derived = { value: "ready" };
  ` });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(
    compiled.result.diagnostics.map(({ code, message }) => ({ code, message })),
    [{
      code: "CSHARP_UNSUPPORTED_AST",
      message:
        "Class object literal emission requires an exact constructible source class with a parameterless constructor.",
    }],
  );
  assert.deepEqual([...compiled.artifacts], []);
});

let nativeConstructorFixture;
function buildNativeConstructorFixture() {
  if (nativeConstructorFixture !== undefined) return nativeConstructorFixture;
  const root = mkdtempSync(fileURLToPath(new URL("../../../../.temp/native-direct-base-", import.meta.url)));
  const project = join(root, "NativeConstructorModes.csproj");
  writeFileSync(project, '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup></Project>');
  writeFileSync(join(root, "Provider.cs"), `namespace NativeConstructorModes;
public class RefBase { public readonly int Value; public RefBase(ref int value) { value += 3; Value = value; } }
public class InBase { public readonly int Value; public InBase(in int value) { Value = value + 4; } }
public class OutBase { public readonly int Value; public OutBase(out int value) { value = 13; Value = value; } }
`);
  const build = spawnSync("dotnet", ["build", project, "-c", "Release", "--nologo", "--verbosity", "quiet", "-m:1", "-nr:false", "-p:UseSharedCompilation=false"],
    { encoding: "utf8", timeout: 240_000, maxBuffer: 1_048_576 });
  assert.equal(build.status, 0, `${build.error ?? ""}\n${build.stdout}\n${build.stderr}`.slice(0, 4096));
  nativeConstructorFixture = { project, assembly: join(root, "bin/Release/net10.0/NativeConstructorModes.dll") };
  return nativeConstructorFixture;
}

for (const surface of ["native", "js"]) {
  test(`direct base constructors forward their final ref, in and out modes on ${surface}`, () => {
    const fixture = buildNativeConstructorFixture();
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      import { ref, inref, out } from "@tsonic/csharp/lang.js";
      import { RefBase, InBase, OutBase } from "@tsonic/dotnet/NativeConstructorModes.js";
      export class RefDerived extends RefBase { constructor(value: int) { super(ref(value)); } }
      export class InDerived extends InBase { constructor(value: int) { super(inref(value)); } }
      export class OutDerived extends OutBase { constructor(value: int) { super(out(value)); } }
      export function run(): int { return new RefDerived(5).Value + new InDerived(7).Value + new OutDerived(0).Value; }
    `, targetOptions: { references: { assemblies: [{ include: "NativeConstructorModes", hintPath: fixture.assembly }] } } });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.ast;
    const constructors = [];
    const visit = node => {
      if (ast.is.IsConstructorDeclaration(node)) constructors.push(node);
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    assert.equal(constructors.length, 3, "all three source constructors retain their actual direct entry");
    for (const [index, constructor] of constructors.entries()) {
      assert.equal(csharpConstructorRequiresPreparation(ast, constructor, program.records, program.records,
        parameter => program.records.capturedBinding.get(parameter) !== undefined), false,
      "the existing entry owner, not a new selector, establishes the direct-only correction domain");
      const call = csharpConstructorBaseCall(ast, constructor);
      const argument = ast.as.AsCallExpression(call).Arguments.Nodes[0];
      assert.equal(program.records.sourceArgument.get(argument)?.argument.passingMode,
        ["byref-readwrite", "byref-readonly", "byref-writeonly-must-init"][index],
        "the renderer consumes the final admitted source mode");
    }
    const output = compiled.artifacts.get("src/Index.cs");
    for (const mode of ["ref", "in", "out"]) assert.match(output, new RegExp(`: base\\(${mode} value\\)`, "u"),
      `${mode}: one native argument is forwarded without a packet or value copy`);
    const constructor = constructors[0];
    const argument = ast.as.AsCallExpression(csharpConstructorBaseCall(ast, constructor)).Arguments.Nodes[0];
    const diagnostics = [];
    planConstructorDeclarations(constructor, "RefDerived", ast.getSourceFile(constructor),
      createCsharpPlanningContext({ ...program, records: { ...program.records,
        sourceArgument: { get: node => node === argument ? undefined : program.records.sourceArgument.get(node) } } }), diagnostics, []);
    assert.equal(diagnostics.length, 1, "a missing mode record is not accepted through a by-value fallback");
    assert.equal(diagnostics[0].message, "C# call planning received an argument without sealed passing evidence.",
      "the existing missing-record refusal is unchanged");
    assert.equal(diagnostics[0].sourceNode === argument, true, "the exact argument remains the refusal subject");
    executeCsharpConstruction(compiled, `native-direct-base-${surface}`, false, false, [fixture.project], `
int changed = 5, original = 7;
var reference = new NativeConstructorModes.RefBase(ref changed);
var read = new NativeConstructorModes.InBase(in original);
var written = new NativeConstructorModes.OutBase(out int assigned);
if (changed != 8 || original != 7 || assigned != 13 ||
    new Tsonic.Generated.RefDerived(5).Value != reference.Value ||
    new Tsonic.Generated.InDerived(7).Value != read.Value ||
    new Tsonic.Generated.OutDerived(0).Value != written.Value || Tsonic.Generated.Index.run() != 32)
    throw new System.Exception("native direct constructor mode correspondence");
`);
  });
}
