import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { sourcePackageGraphFixture } from "../../../../tsonic/test/fixtures/source-package-graph.mjs";

const sourcePackages = sourcePackageGraphFixture(["index.ts"], {
  "@acme/callbacks": { files: ["index.ts", "contracts.ts"], dependencies: [] },
});
const files = {
  "node_modules/@acme/callbacks/package.json": JSON.stringify({
    name: "@acme/callbacks", version: "1.0.0", type: "module", exports: { ".": "./index.ts" },
  }),
  "node_modules/@acme/callbacks/contracts.ts": `
    import type { int64 } from "@tsonic/core/types.js";
    type ErrorConsumer = (error: Error) => void;
    export type Failure = Error | Parameters<ErrorConsumer>[0];
    export type Control = string | Failure | null | undefined;
    export type Next = (control?: Control) => void;
    export interface Handler { (next: Next, value: int64): int64; }
  `,
  "node_modules/@acme/callbacks/index.ts": `
    import type { Handler } from "./contracts.js";
    export type { Handler } from "./contracts.js";
    export function retain(values: Handler[]): Handler[] { return values; }
    export function pair(values: [Handler, Handler]): [Handler, Handler] { return values; }
  `,
};
const sourceText = `
  import { pair, retain, type Handler } from "@acme/callbacks";
  import type { int64 } from "@tsonic/core/types.js";
  const exact: int64 = 9007199254740993n;
  const identity: Handler = (_next, value) => value;
  export function run(): boolean {
    const values = retain([identity]);
    const selected = pair([identity, identity]);
    const next = () => {};
    return values[0](next, exact) === exact && selected[1](next, exact) === exact;
  }
`;

for (const surface of [undefined, "js"]) {
  test(`source-package callable components retain native storage boundaries in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({
      projectRoot: "/src", surface, files, sourceText, sourcePackages,
    });
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(generated, /source-alias-representation-unavailable|Convert\.ToDouble|DynamicInvoke|System\.Reflection/u);
    executeCsharpConstruction(compiled, `callable-component-storage-${surface ?? "native"}`);
  });
}
