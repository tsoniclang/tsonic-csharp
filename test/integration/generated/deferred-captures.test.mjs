import assert from "node:assert/strict";
import test from "node:test";
import { deferredCapturesSource } from "../../../../tsonic/test/fixtures/deferred-captures.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";

for (const surface of [undefined, "js"]) {
  test(`deferred captures retain one initialized native activation on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: deferredCapturesSource + `
      export function beforeReference(): number {
        const read = (): number => forward.size;
        const selected = read();
        const forward = new Item(13);
        return selected + forward.size;
      }
      export function beforeValue(): number {
        const read = (): number => forward;
        const selected = read();
        const forward = 13;
        return selected;
      }
      interface NativeReader { read<T>(input: T): number; }
      export function protocolReady(): number {
        const reader: NativeReader = { read<T>(input: T): number { return forward.size; } };
        const forward = new Item(13);
        return reader.read(0);
      }
      export function protocolEarly(): number {
        const reader: NativeReader = { read<T>(input: T): number { return forward.size; } };
        const selected = reader.read(0);
        const forward = new Item(13);
        return selected + forward.size;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const source = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.doesNotMatch(source, /captured binding is not initialized|\bvalue\d+(?:Value|Initialized)\b/u,
      "native deferred places have no read guard, flag or private guard backing");
    executeCsharpConstruction(compiled, `deferred-captures-${surface ?? "native"}`, false, false, [], `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("original deferred capture values");
if (Tsonic.Generated.Index.beforeValue() != 0) throw new System.Exception("native early scalar default");
if (Tsonic.Generated.Index.protocolReady() != 13) throw new System.Exception("native protocol deferred field");
try {
    Tsonic.Generated.Index.beforeReference();
    throw new System.Exception("native early reference did not throw");
} catch (System.NullReferenceException) { }
try {
    Tsonic.Generated.Index.protocolEarly();
    throw new System.Exception("native early protocol reference did not throw");
} catch (System.NullReferenceException) { }
`);
  });
}
