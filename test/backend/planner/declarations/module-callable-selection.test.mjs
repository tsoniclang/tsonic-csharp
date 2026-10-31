import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";

test("closed exported arrows become public methods while first-class identities remain values", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({
    files: {
      "functions.ts": `
        export const direct = (value: string): string => value;
        const renamed = (value: string): string => value;
        export { renamed as alias };
        export const retained = (value: string): string => value;
        export function retain() { return retained; }
      `,
    },
    sourceText: `
      import { direct, alias, retain, retained } from "./functions.js";
      export function run(): boolean {
        return direct("one") === "one" && alias("two") === "two" &&
          retain() === retained && retain()("three") === "three";
      }
    `,
  });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /public static string direct\(string value\)/u);
  assert.match(output, /public static string renamed\(string value\)/u);
  assert.match(output, /public static string retained\(string value\)/u);
  assert.match(output, /Func<string, string> retain\(\)/u);
  assert.doesNotMatch(output, /Func<string, string> retained\s*\{/u);
  const nativeOutput = executeCsharpConstruction(compiled, "exported-callable-selection", false, false, [], `
if (Tsonic.Generated.Functions.direct("one") != "one" ||
    Tsonic.Generated.Functions.renamed("two") != "two" ||
    Tsonic.Generated.Functions.retain()("three") != "three")
    throw new System.Exception("original module callable values");
if (Tsonic.Generated.Functions.retain() != (System.Func<string, string>)Tsonic.Generated.Functions.retained)
    throw new System.Exception("original retained native method and receiver");
bool expectedIdentity = NativeModuleIdentityConsumer.Compare();
bool actualIdentity = Tsonic.Generated.Index.run();
if (actualIdentity != expectedIdentity)
    throw new System.Exception("module callable identity differs from handwritten native modules");
System.Console.WriteLine($"native-method-identity: expected={expectedIdentity}; actual={actualIdentity}");

static class NativeModuleIdentity
{
    internal static string Retained(string value) => value;
    internal static System.Func<string, string> Retain() => Retained;
}
static class NativeModuleIdentityConsumer
{
    internal static bool Compare() => object.ReferenceEquals(
        NativeModuleIdentity.Retain(),
        (System.Func<string, string>)NativeModuleIdentity.Retained);
}
`);
  assert.match(nativeOutput, /native-method-identity: expected=(?:True|False); actual=(?:True|False)/u);
  console.log(nativeOutput.match(/native-method-identity: expected=(?:True|False); actual=(?:True|False)/u)[0]);
});
