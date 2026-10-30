import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";

const nativeOptionsSource = `
    import type { TlsOptions } from "node:tls";
    export function make(key: string, cert: string): TlsOptions {
      const options = { key, cert };
      const alias = options;
      const selected: TlsOptions = alias;
      alias.cert = cert;
      if (options.cert !== cert || options.cert.length !== cert.length) throw new Error("reference field mutation");
      return selected;
    }
    export function run(): boolean {
      const key = "κλειδί";
      const cert = "certificate";
      const value = make(key, cert);
      return value.key === key && value.cert === cert && value.ca === undefined;
    }
  `;

test("untyped native option aliases refuse later native context without publishing artifacts", () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: nativeOptionsSource });
  const errors = compiled.targetDiagnostics.filter(issue => issue.category === "error");
  assert.equal(errors.length > 0 && errors.every(issue => issue.code === "TSONIC_UNTYPED_OBJECT_LITERAL"), true,
    `the original two-alias source requires its own native literal context: ${errors.slice(0, 4).map(issue => issue.code).join(", ")}`);
  assert.equal(compiled.artifacts.size, 0, "untyped native option aliases publish no native artifacts");
});

test("equality-only narrowing of a provider option retains the native Length compile error", () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()],
    sourceText: nativeOptionsSource.replace("const options =", "const options: TlsOptions =") });
  const source = [...compiled.artifacts.values()].join("\n");
  assert.match(source, /options\.cert\.Length/u, "the original narrowed provider read is emitted unchanged");
  assert.throws(() => executeCsharpConstruction(compiled, "native-reference-equality-only-read", false, false,
    [join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj")]),
  error => /Index\.cs\(\d+,\d+\): error CS1061: 'TsValue' does not contain a definition for 'Length'/u.test(error.message),
  "the native compiler rejects exactly the unproved provider string read, not another refusal");
});

test("native option reference fields retain one allocation, aliases and exact string payloads", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()],
    sourceText: nativeOptionsSource.replace("const options =", "const options: TlsOptions =")
      .replace("options.cert.length !== cert.length", "cert.length < 0") });
  executeCsharpConstruction(compiled, "native-reference-construction", false, false,
    [join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj")], `
using System;
using Tsonic.CSharp.Node;
using Tsonic.CSharp.Runtime;
using Index = Tsonic.Generated.Index;
if (!Index.run()) throw new Exception("original source reference and absence contract");
string key = new string('k', 20);
string cert = new string('c', 100);
for (int index = 0; index < 1000; index++) {
    GC.KeepAlive(Index.make(key, cert));
    GC.KeepAlive(Handwritten(key, cert));
}
long before = GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 10000; index++) {
    var result = Index.make(key, cert);
    if (!ReferenceEquals(TsValue.CastDynamic<string>(result.key), key) ||
        !ReferenceEquals(TsValue.CastDynamic<string>(result.cert), cert)) throw new Exception("exact original native references");
    GC.KeepAlive(result);
}
long generated = GC.GetAllocatedBytesForCurrentThread() - before;
before = GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 10000; index++) GC.KeepAlive(Handwritten(key, cert));
long handwritten = GC.GetAllocatedBytesForCurrentThread() - before;
if (generated != handwritten) throw new Exception($"native option allocation {generated} != {handwritten}");
static TlsOptions Handwritten(string key, string cert) =>
    new TlsOptions { key = TsValue.from(key), cert = TsValue.from(cert) };
` );
  const source = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  assert.equal([...source.matchAll(/new Tsonic\.CSharp\.Node\.TlsOptions\b/gu)].length, 1,
    "one native allocation at the original producer");
  const make = source.slice(source.indexOf("TlsOptions make("), source.indexOf("bool run("));
  assert.match(make, /cert\.Length/u, "the positive reads length from the local declared string");
  assert.doesNotMatch(make, /options\.cert\.Length|CastDynamic<string>/u,
    "the positive does not request the unsupported provider string projection");
  assert.doesNotMatch(make, /ApplyDynamicBinary|\.clone\(|new Tsonic\.CSharp\.Runtime\.TsObject/u);
  assert.doesNotMatch(source, /Activator|DynamicInvoke|System\.Reflection|new Tsonic\.Generated\.__TsonicShape/u);
});
