import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

test("authored multiline strings emit as exact readable C# raw literals", () => {
  const tick = String.fromCharCode(96);
  const compiled = compileCsharpSource({
    sourceText: [
      "export function template(): string {",
      "  return " + tick + "first \"\"\" line",
      "  \\" + "$" + "{value} 😀",
      tick + ";",
      "}",
      "",
    ].join("\n"),
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(
    source,
    /return """"\n            first """ line\n              \$\{value\} 😀\n\n            """";/u,
  );
  assert.doesNotMatch(source, /first \\"\\"\\" line\\n/u);
});

test("readable C# strings compile and preserve their exact runtime value", () => {
  const tick = String.fromCharCode(96);
  const sourceValue = [
    "first \"\"\" line",
    "  ${value} 😀",
    "",
  ].join("\n") + "|left\r\nright";
  const compiled = compileCsharpSource({
    sourceText: [
      'import { Console } from "@tsonic/dotnet/System.js";',
      "class Func {}",
      "function apply(callback: (value: string) => string, value: string): string {",
      "  return callback(value);",
      "}",
      "const readable = " + tick + "first \"\"\" line",
      "  \\" + "$" + "{value} 😀",
      tick + ";",
      'const escaped = "left\\r\\nright";',
      'Console.Write(apply((value: string): string => value, readable + "|" + escaped));',
      "",
    ].join("\n"),
    targetOptions: { outputType: "Exe" },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const outputRoot = resolve(
    import.meta.dirname,
    "../../../../.temp/exact-human-output-native",
    String(process.pid),
  );
  for (const [path, text] of compiled.artifacts) {
    const outputPath = resolve(outputRoot, path);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, text, "utf8");
  }
  const projectPath = resolve(outputRoot, "TsonicGenerated.csproj");
  const build = spawnSync(
    "dotnet",
    ["build", projectPath, "--nologo", "--verbosity", "quiet"],
    { encoding: "utf8" },
  );
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
  const executed = spawnSync(
    "dotnet",
    ["run", "--project", projectPath, "--no-build", "--no-restore"],
    { encoding: "utf8" },
  );
  assert.equal(executed.status, 0, `${executed.stdout}\n${executed.stderr}`);
  assert.equal(executed.stdout, sourceValue);
});

test("C# using directives follow exact unqualified target-AST consumers", () => {
  const qualifiedOnly = compileCsharpSource({
    sourceText: "export function identity(value: number): number { return value; }\n",
  });
  assert.deepEqual(qualifiedOnly.targetDiagnostics, []);
  assert.doesNotMatch(
    qualifiedOnly.artifacts.get("src/Index.cs"),
    /^using System;/u,
  );

  const delegate = compileCsharpSource({
    sourceText: [
      "export function invoke(callback: (value: number) => number): number {",
      "  return callback(1);",
      "}",
      "",
    ].join("\n"),
  });
  assert.deepEqual(delegate.targetDiagnostics, []);
  assert.match(delegate.artifacts.get("src/Index.cs"), /^using System;/u);
  assert.match(delegate.artifacts.get("src/Index.cs"), /Func<double, double>/u);

  const collision = compileCsharpSource({
    sourceText: [
      "export class Func {}",
      "export function invoke(callback: (value: number) => number): number {",
      "  return callback(1);",
      "}",
      "",
    ].join("\n"),
  });
  assert.deepEqual(collision.targetDiagnostics, []);
  assert.doesNotMatch(collision.artifacts.get("src/Index.cs"), /^using System;/u);
  assert.match(
    collision.artifacts.get("src/Index.cs"),
    /global::System\.Func<double, double>/u,
  );
});

test("generated structural classes use readable names without weakening identity", () => {
  const compiled = compileCsharpSource({
    sourceText: [
      "export interface TodoInput {",
      "  id: number;",
      "  title: string;",
      "}",
      "export function create(): TodoInput {",
      "  return { id: 1, title: \"write tests\" };",
      "}",
      "",
    ].join("\n"),
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs");
  const shapes = compiled.artifacts.get("generated/TsonicObjectShapes.cs");
  const selected = /new (TodoInputShape_[a-f0-9]{12,64})/u.exec(source)?.[1];
  assert.notEqual(selected, undefined);
  assert.match(shapes, new RegExp("class " + selected + " : TodoInput", "u"));
  assert.doesNotMatch(source, /__TsonicShape_/u);
  assert.doesNotMatch(shapes, /__TsonicShape_/u);
});
