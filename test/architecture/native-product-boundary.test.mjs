import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectNativeProductBoundaryFindings,
  collectNativeProductBoundaryFindingsFromSources,
  collectNativeProductManifestFindingsFromText,
  formatNativeProductBoundaryFinding,
} from "./native-product-boundary.mjs";

const repoRoot = new URL("../..", import.meta.url).pathname;

test("native product boundary source stays ESM-only and native-compilable", () => {
  const findings = collectNativeProductBoundaryFindings(repoRoot);
  assert.deepEqual(findings.map(formatNativeProductBoundaryFinding), []);
});

test("native product boundary scanner rejects module shims and catch-all files", () => {
  const findings = collectNativeProductBoundaryFindingsFromSources([
    {
      file: "src/legacy-loader.cjs",
      text: "export const ignored = true;\n",
    },
    {
      file: "src/source/csharp-source-semantics/surfaces/js/policy.ts",
      text: "export const policy = [];\n",
    },
    {
      file: "src/source/csharp-source-semantics/semantics.ts",
      text: "export const semantics = [];\n",
    },
    {
      file: "src/commonjs.ts",
      text: [
        "const fs = require(\"node:fs\");",
        "module.exports = {};",
        "exports.value = 1;",
        "const here = __dirname;",
        "export = value;",
      ].join("\n"),
    },
    {
      file: "src/shims.ts",
      text: [
        "/// <reference types=\"node\" />",
        "namespace Shim { export const value = 1; }",
        "declare module \"legacy\" { export const value: number; }",
      ].join("\n"),
    },
    {
      file: "src/imports.ts",
      text: [
        "import { readFileSync } from \"fs\";",
        "import { bad } from \"left-pad\";",
        "import { local } from \"./local\";",
      ].join("\n"),
    },
  ]);

  assert.deepEqual(
    findings.map((finding) => `${finding.file}:${finding.ruleId}`),
    [
      "src/commonjs.ts:commonjs-require-call",
      "src/commonjs.ts:commonjs-module-exports-assignment",
      "src/commonjs.ts:commonjs-named-exports-assignment",
      "src/commonjs.ts:commonjs-dirname-filename",
      "src/commonjs.ts:commonjs-export-equals",
      "src/imports.ts:node-builtin-without-node-prefix",
      "src/imports.ts:unapproved-product-import",
      "src/imports.ts:esm-relative-import-extension",
      "src/legacy-loader.cjs:commonjs-source-extension",
      "src/shims.ts:triple-slash-reference",
      "src/shims.ts:typescript-namespace-declaration",
      "src/shims.ts:typescript-ambient-module-shim",
      "src/source/csharp-source-semantics/semantics.ts:catch-all-semantic-blob-file",
      "src/source/csharp-source-semantics/surfaces/js/policy.ts:procedural-policy-catch-all-file",
    ],
  );
});

test("native product boundary scanner ignores fixture strings", () => {
  const findings = collectNativeProductBoundaryFindingsFromSources([
    {
      file: "test/example.test.mjs",
      text: [
        "const fixture = `",
        "  /// <reference types=\"node\" />",
        "  namespace CsharpFixture;",
        "  const fs = require(\"fs\");",
        "`;",
      ].join("\n"),
    },
    {
      file: "src/print/csharp.ts",
      text: "const csharpLine = `namespace Generated {}`;\n",
    },
  ]);

  assert.deepEqual(findings.map(formatNativeProductBoundaryFinding), []);
});

test("native product boundary scanner distinguishes CommonJS require from method APIs", () => {
  const findings = collectNativeProductBoundaryFindingsFromSources([
    {
      file: "src/requirements.ts",
      text: [
        "interface Registry { readonly require(value: string): void; }",
        "const registry = {} as Registry;",
        "registry.require(\"value\");",
        "const local = require(\"legacy\");",
      ].join("\n"),
    },
  ]);

  assert.deepEqual(
    findings.map((finding) => `${finding.file}:${finding.ruleId}:${finding.line}`),
    ["src/requirements.ts:commonjs-require-call:4"],
  );
});

test("native product boundary scanner rejects runtime reflection and dynamic semantics", () => {
  const findings = collectNativeProductBoundaryFindingsFromSources([
    {
      file: "src/generated-runtime-semantics.ts",
      text: [
        "const metadata = System.Reflection;",
        "const property = target.GetProperty(name);",
        "const methods = target.GetMethods();",
        "const value = Activator.CreateInstance(type);",
        "const loaded = Assembly.Load(name);",
        "let carrier: dynamic;",
      ].join("\n"),
    },
    {
      file: "src/diagnostic-text.ts",
      text: "const message = \"System.Reflection GetProperty dynamic are banned in generated output\";\n",
    },
  ]);

  assert.deepEqual(
    findings.map((finding) => `${finding.file}:${finding.ruleId}`),
    [
      "src/generated-runtime-semantics.ts:runtime-reflection-namespace",
      "src/generated-runtime-semantics.ts:runtime-reflection-member-discovery",
      "src/generated-runtime-semantics.ts:runtime-reflection-member-discovery",
      "src/generated-runtime-semantics.ts:runtime-reflection-invocation",
      "src/generated-runtime-semantics.ts:runtime-reflection-invocation",
      "src/generated-runtime-semantics.ts:csharp-dynamic-semantics",
    ],
  );
});

test("native product manifest rejects non-ESM and third-party product dependencies", () => {
  const findings = collectNativeProductManifestFindingsFromText(
    "package.json",
    JSON.stringify({
      type: "commonjs",
      dependencies: {
        "left-pad": "1.0.0",
      },
      peerDependencies: {
        "@tsonic/tsts": "0.0.0",
      },
    }),
  );

  assert.deepEqual(
    findings.map((finding) => finding.ruleId),
    ["package-type-module", "unapproved-product-dependency"],
  );
});
