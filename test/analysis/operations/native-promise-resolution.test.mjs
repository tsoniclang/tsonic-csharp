import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { selectCsharpTargetCallEmission } from "../../../dist/policy/operations/members/target-call-emission.js";
import { csharpTaskTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType, csharpVoidTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpAbsenceTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";

test("native Promise resolution uses native Task values, identity and completed absence without JS runtime transport", () => {
  const compiled = compileCsharpSource({ surface: "native", sourceText: `
import type { int64 } from "@tsonic/core/types.js";
export function scalar(value: int64): Promise<int64> { return Promise.resolve<int64>(value); }
export function pending(value: Promise<int64>): Promise<int64> { return Promise.resolve<int64>(value); }
export function absent(): Promise<void> { return Promise.resolve<void>(undefined); }
` });
  assertCsharpCompilationSucceeded(compiled);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.equal(generated.includes("Task.FromResult<long>"), true, "the exact native int64 carrier reaches Task.FromResult");
  assert.equal(generated.includes("CompletedTask"), true, "native void completion uses the existing completed Task");
  assert.equal(/Tsonic\.CSharp\.Js|TaskCompletion|new object\??\[/u.test(generated), false,
    "native resolution introduces no JS Promise adapter, completion source or argument array");
  executeCsharpConstruction(compiled, "native-promise-resolution", false, false, [], `
long precise = 9007199254740993L;
if (Tsonic.Generated.Index.scalar(precise).GetAwaiter().GetResult() != precise)
    throw new System.Exception("native int64 precision");
var existing = System.Threading.Tasks.Task.FromResult(precise);
if (!object.ReferenceEquals(existing, Tsonic.Generated.Index.pending(existing)))
    throw new System.Exception("native Task identity");
if (!object.ReferenceEquals(System.Threading.Tasks.Task.CompletedTask, Tsonic.Generated.Index.absent()))
    throw new System.Exception("native completed Task identity");
for (int iteration = 0; iteration < 4096; iteration++) _ = Tsonic.Generated.Index.pending(existing);
long before = System.GC.GetAllocatedBytesForCurrentThread();
for (int iteration = 0; iteration < 8192; iteration++) _ = Tsonic.Generated.Index.pending(existing);
if (System.GC.GetAllocatedBytesForCurrentThread() != before)
    throw new System.Exception("native Task forwarding allocated");
`);
});

test("native Task resolution rejects inconsistent sealed input and completion evidence before planning", () => {
  const integer = csharpSourcePrimitiveTargetType("int32");
  const wide = csharpSourcePrimitiveTargetType("int64");
  const task = csharpTaskTargetType(integer);
  const completed = csharpTaskTargetType(csharpVoidTargetType());
  const cases = [
    ["value", integer, task, false],
    ["task", task, task, false],
    ["absence", csharpAbsenceTargetType(), completed, false],
    ["value", wide, task, true],
    ["task", csharpTaskTargetType(wide), task, true],
    ["absence", integer, completed, true],
    ["absence", csharpAbsenceTargetType(), task, true],
  ];
  for (const [form, parameter, result, rejected] of cases) {
    const selected = selectCsharpTargetCallEmission({
      source: {}, argumentPassing: [false], optional: false, projection: undefined, liftedResult: undefined,
      selection: { receiver: { kind: "none" }, targetMember: { kind: "method", id: "native-task-resolution-control",
        static: true, targetName: "FromResult", declaringType: completed,
        parameters: [{ name: "value", type: parameter, passingMode: "by-value" }], returnType: result,
        csharpInvocation: { kind: "native-task-resolution", form } } },
    });
    assert.equal(selected.kind === "rejected", rejected, `${form}: exact native parameter/result correspondence`);
  }
});
