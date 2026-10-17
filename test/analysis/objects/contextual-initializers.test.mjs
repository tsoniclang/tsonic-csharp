import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCsharpCompilationSucceeded,
  compileCsharpSource,
} from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const sourceText = `
function direct(): number {
  const { value } = { value: 7 } as const;
  return value;
}
function choose(flag: boolean): number {
  const { value } = flag ? { value: 11 } : { value: 13 };
  return value;
}
function nonNull(): number {
  const { value } = { value: 17 }!;
  return value;
}
function tuple(): number {
  const [value] = [19] as const;
  return value;
}
function exactKey(): number {
  const { key } = { key: "value" } as const;
  const value = { [key]: 23 };
  return value[key];
}
export function run(): boolean {
  return direct() === 7 && choose(true) === 11 && choose(false) === 13 &&
    nonNull() === 17 && tuple() === 19 && exactKey() === 23;
}
`;

const metadataScaffoldSource = `
const nativeKey = "value";
interface Holder { [nativeKey]: number; }
function exactKey(): number {
  const { key } = { key: "value" } as const;
  const value: Holder = { [key]: 23 };
  return value[key];
}
export function run(): boolean { return exactKey() === 23; }
`;

const nativeProgram = `
static double NativeChoose(bool flag) {
  var value = flag ? new NativeValue(11) : new NativeValue(13);
  return value.Value;
}
var direct = new NativeValue(7);
var nonNull = new NativeValue(17);
var tuple = new System.ValueTuple<double>(19);
var exactKey = new NativeValue(23);
if (!Tsonic.Generated.Index.run() || direct.Value != 7 || NativeChoose(true) != 11 ||
  NativeChoose(false) != 13 || nonNull.Value != 17 || tuple.Item1 != 19 || exactKey.Value != 23) {
  throw new System.Exception("native contextual initializer counterpart");
}
readonly record struct NativeValue(double Value);
`;

for (const surface of [undefined, "js"]) {
  test(`C# ${surface ?? "native"} metadata-only computed key scaffold preserves the actual source`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: metadataScaffoldSource });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(compiled.result.program !== undefined && compiled.result.plan !== undefined, true, "metadata is not an invalid native program");
    executeCsharpConstruction(compiled, `contextual-key-metadata-${surface ?? "native"}`,
      false, false, [], 'if (!Tsonic.Generated.Index.run()) throw new System.Exception("metadata key counterpart");');
  });

  test(`C# ${surface ?? "native"} local initializers keep actual fields and match native values`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(compiled.result.program !== undefined && compiled.result.plan !== undefined, true,
      "actual local initializers are admitted and planned, not skipped or replaced by synthetic fields");
    assert.equal(compiled.result.artifacts.length > 0, true, "the actual source emits native artifacts");
    executeCsharpConstruction(compiled, `contextual-initializers-${surface ?? "native"}`,
      false, false, [], nativeProgram);
  });
}
