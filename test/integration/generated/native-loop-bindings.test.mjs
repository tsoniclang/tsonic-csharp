import assert from "node:assert/strict";
import test from "node:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { assertNativeLoopRefusals } from "../../helpers/native-loop-refusals.mjs";
import { createTestWorkspace } from "../../../../tsonic/test/scripts/test-workspaces.mjs";

let nativeFixture;
function buildNativeLoopFixture() {
  if (nativeFixture !== undefined) return nativeFixture;
  const root = createTestWorkspace(fileURLToPath(new URL("../../../.temp/", import.meta.url)), "native-loop-bindings-");
  const project = join(root, "NativeLoopBindings.csproj");
  writeFileSync(project, '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup></Project>');
  writeFileSync(join(root, "Provider.cs"), `namespace NativeLoopBindings;
public struct LoopValue {
    public int Value;
    public LoopValue(int value) { Value = value; }
    public void Mutate() { Value++; }
    public int Changing { get { Value++; return Value; } }
}
public struct NestedValue {
    public LoopValue Inner;
    public NestedValue(int value) { Inner = new LoopValue(value); }
}
public class ReferenceBox {
    public int Value;
    public ReferenceBox(int value) { Value = value; }
}
public static class NativeCalls {
    public static void WriteOut(out int value) { value = 1; }
    public static void Update(ref int value) { value++; }
    public static void Replace(out ReferenceBox value) { value = new ReferenceBox(1); }
    public static int ReadIn(in int value) { return value; }
    public static int Read(int value) { return value; }
}
`);
  const build = spawnSync("dotnet", ["build", project, "-c", "Release", "--nologo", "--verbosity", "quiet", "-m:1", "-nr:false", "-p:UseSharedCompilation=false"],
    { encoding: "utf8", timeout: 240_000, maxBuffer: 1_048_576 });
  assert.equal(build.status, 0, `${build.error ?? ""}\n${build.stdout}\n${build.stderr}`.slice(0, 4096));
  nativeFixture = { project, assembly: join(root, "bin/Release/net10.0/NativeLoopBindings.dll") };
  return nativeFixture;
}

const imports = `
import type { int } from "@tsonic/csharp/types.js";
import { ref, out, inref } from "@tsonic/csharp/lang.js";
import { NativeCalls, LoopValue, NestedValue, ReferenceBox } from "@tsonic/dotnet/NativeLoopBindings.js";
interface Changer { update<T>(value: T): T; }
`;

const negativeControls = [
  {
    "label": "assignment",
    "write": "n = 1",
    "subject": "n = 1"
  },
  {
    "label": "postfix increment",
    "write": "n++",
    "subject": "n++"
  },
  {
    "label": "prefix increment",
    "write": "++n",
    "subject": "++n"
  },
  {
    "label": "postfix decrement",
    "write": "n--",
    "subject": "n--"
  },
  {
    "label": "prefix decrement",
    "write": "--n",
    "subject": "--n"
  },
  {
    "label": "compound assignment",
    "write": "n += 1",
    "subject": "n += 1"
  },
  {
    "label": "array destructuring target",
    "write": "[n] = [1 as int]",
    "subject": "[n] = [1 as int]"
  },
  {
    "label": "object destructuring target",
    "write": "({ value: n } = { value: 1 })",
    "subject": "{ value: n } = { value: 1 }"
  },
  {
    "label": "scalar out root",
    "write": "NativeCalls.WriteOut(out(n))",
    "subject": "n"
  },
  {
    "label": "scalar ref root",
    "write": "NativeCalls.Update(ref(n))",
    "subject": "n"
  },
  {
    "label": "created closure update",
    "write": "const change = () => n++; change()",
    "subject": "n++"
  },
  {
    "label": "created protocol method",
    "write": "const change: Changer = { update<T>(value: T): T { n += 1; return value; } }; change.update(0)",
    "subject": "n += 1"
  },
  {
    "label": "reference binding assignment",
    "write": "box = new ReferenceBox(1)",
    "subject": "box = new ReferenceBox(1)",
    "binding": "box = new ReferenceBox(0)",
    "read": "box.Value",
    "condition": "visits < 2",
    "increment": "visits++"
  },
  {
    "label": "reference out root",
    "write": "NativeCalls.Replace(out(box))",
    "subject": "box",
    "binding": "box = new ReferenceBox(0)",
    "read": "box.Value",
    "condition": "visits < 2",
    "increment": "visits++"
  },
  {
    "label": "value member assignment",
    "write": "p.Value = 1",
    "subject": "p.Value",
    "member": true
  },
  {
    "label": "value member update",
    "write": "p.Value++",
    "subject": "p.Value",
    "member": true
  },
  {
    "label": "value member compound assignment",
    "write": "p.Value += 1",
    "subject": "p.Value",
    "member": true
  },
  {
    "label": "value member call",
    "write": "p.Mutate()",
    "subject": "p.Mutate()",
    "member": true
  },
  {
    "label": "unproved value getter",
    "write": "const observed = p.Changing; void observed",
    "subject": "p.Changing",
    "member": true
  },
  {
    "label": "value member out",
    "write": "NativeCalls.WriteOut(out(p.Value))",
    "subject": "p.Value",
    "member": true
  },
  {
    "label": "value member ref",
    "write": "NativeCalls.Update(ref(p.Value))",
    "subject": "p.Value",
    "member": true
  },
  {
    "label": "nested value member write",
    "write": "p.Inner.Value += 1",
    "subject": "p.Inner.Value",
    "member": true,
    "nested": true
  }
];

for (const surface of ["native", "js"]) {
  for (const control of negativeControls) {
    test(`${surface} captured for binding refuses ${control.label} at its original write`, { timeout: 300_000 }, () => {
      const fixture = buildNativeLoopFixture();
      const binding = control.binding ?? (control.member ? `p = new ${control.nested ? "NestedValue" : "LoopValue"}(0)` : "n: int = 0");
      const sourceText = `${imports}
export function run(): int {
  let visits: int = 0;
  let selected = (): int => -1;
  for (let ${binding}; ${control.condition ?? (control.member ? "visits < 2" : "n < 2")}; ${control.increment ?? (control.member ? "visits++" : "n++")}) {
    selected = (): int => ${control.read ?? (control.member ? control.nested ? "p.Inner.Value" : "p.Value" : "n")};
    ${control.write};
  }
  return selected();
}
`;
      const compiled = compileCsharpSource({ surface, sourceText, targetOptions: {
        references: { assemblies: [{ include: "NativeLoopBindings", hintPath: fixture.assembly }] },
      } });
      const writeOffset = sourceText.lastIndexOf(control.write);
      const subjectOffset = writeOffset + control.write.indexOf(control.subject);
      const occurrence = sourceText.slice(0, subjectOffset).split(control.subject).length - 1;
      assertNativeLoopRefusals(compiled, [{ message: control.member ? "the per-iteration value-type loop binding is mutated through a member; copy it to a body local first." : "the loop variable is captured by a closure and also written in the loop; use a separate variable.",
        text: control.subject, occurrence }]);
    });
  }
}

const positiveControls = [
  { label: "capture-only body", body: `
    let first = (): int => -1, last = (): int => -1;
    for (let n: int = 0; n < 2; n++) {
      const read = (): int => n;
      if (n === 0) first = read; else last = read;
    }
    return first() === 0 && last() === 1;` },
  { label: "own header compound increment", body: `
    let first = (): int => -1, last = (): int => -1;
    for (let n: int = 0; n < 2; n += 1) {
      const read = (): int => n;
      if (n === 0) first = read; else last = read;
    }
    return first() === 0 && last() === 1;` },
  { label: "reference member writes and out", body: `
    let visits: int = 0;
    let first = (): int => -1, last = (): int => -1;
    for (let box = new ReferenceBox(0); visits < 2; visits++) {
      const read = (): int => box.Value;
      if (visits === 0) first = read; else last = read;
      NativeCalls.WriteOut(out(box.Value));
      box.Value += 1;
    }
    return first() === 2 && last() === 2;` },
  { label: "written but never captured", body: `
    let total: int = 0;
    for (let n: int = 0; n < 4; n++) { n += 1; total += n; }
    return total === 4;` },
  { label: "readonly in and by-value arguments", body: `
    let first = (): int => -1;
    let total: int = 0;
    for (let n: int = 0; n < 2; n++) {
      if (n === 0) first = (): int => n;
      total += NativeCalls.ReadIn(inref(n)) + NativeCalls.Read(n);
    }
    return first() === 0 && total === 2;` },
  { label: "native value field reads", body: `
    let visits: int = 0;
    let selected = (): int => -1;
    for (let p = new LoopValue(2); visits < 2; visits++) selected = (): int => p.Value;
    return selected() === 2;` },
  { label: "body-local value mutation", body: `
    let visits: int = 0;
    let selected = (): int => -1;
    for (let p = new LoopValue(2); visits < 2; visits++) {
      let current = p;
      current.Value += 1;
      selected = (): int => current.Value;
    }
    return selected() === 3;` },
];

for (const surface of ["native", "js"]) {
  for (const control of positiveControls) {
    test(`${surface} native for permits ${control.label} with executed values`, { timeout: 300_000 }, () => {
      const fixture = buildNativeLoopFixture();
      const compiled = compileCsharpSource({ surface, sourceText: `${imports}
export function run(): boolean {${control.body}
}
`, targetOptions: { references: { assemblies: [{ include: "NativeLoopBindings", hintPath: fixture.assembly }] } } });
      assertCsharpCompilationSucceeded(compiled);
      const output = compiled.artifacts.get("src/Index.cs");
      assert.equal(typeof output, "string");
      assert.match(output, /\bfor\s*\(/u);
      assert.doesNotMatch(output, /\bwhile\s*\(\s*true\s*\)|__tsonic_first|__TsonicCapture_/u);
      assert.doesNotMatch(output, /\b(?:n|box|p)\s*=\s*__tsonic_value\d+\s*;/u,
        "no copy-back from a per-iteration local into the header binding");
      executeCsharpConstruction(compiled, `native-loop-option-b-${surface}-${control.label.replaceAll(" ", "-")}`,
        false, false, [fixture.project]);
    });
  }
}
