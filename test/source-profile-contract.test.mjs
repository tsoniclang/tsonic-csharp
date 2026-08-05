import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCompilerSessionFromFiles,
  formatDiagnostics,
} from "@tsonic/tsts";
import {
  csharpJsSourceProfileOwnerId,
  csharpJsSurfaceSourceProfileContributions,
  csharpSourceProfileContributions,
  csharpSourceProfileOwnerId,
} from "../dist/source/csharp-source-semantics/source-profile-declarations.js";

test("C# source profile accepts CLR names and rejects JS names under noLib", () => {
  const valid = createSourceProfileSession({
    profile: "csharp",
    sourceText: [
      "const path: string = \"a/b\";",
      "const parts = path.Split(\"/\");",
      "const count = parts.Length;",
      "export const result = `${count}`;",
      "",
    ].join("\n"),
  });
  assertNoBundledTypeScriptLibraries(valid);
  assert.equal(formatDiagnostics(valid.getDiagnostics("all")), "");

  const invalid = createSourceProfileSession({
    profile: "csharp",
    sourceText: [
      "declare const template: TemplateStringsArray;",
      "const path: string = \"a/b\";",
      "const parts = path.split(\"/\");",
      "const count = [1, 2, 3].length;",
      "export const result = `${parts}:${count}`;",
      "",
    ].join("\n"),
  });
  assertNoBundledTypeScriptLibraries(invalid);
  const diagnosticsText = formatDiagnostics(invalid.getDiagnostics("all"));
  assert.match(diagnosticsText, /Property 'split' does not exist on type 'string'\. Did you mean 'Split'\?/u);
  assert.match(diagnosticsText, /Property 'length' does not exist on type 'number\[\]'\. Did you mean 'Length'\?/u);
  assert.match(diagnosticsText, /Cannot find name 'TemplateStringsArray'/u);
});

test("JS surface profile accepts JS names and rejects CLR names under noLib", () => {
  const valid = createSourceProfileSession({
    profile: "js",
    sourceText: [
      "declare const template: TemplateStringsArray;",
      "const path: string = \"a/b\";",
      "const parts = path.split(\"/\");",
      "const count = parts.length;",
      "const raw = String.raw(template, path);",
      "export const result = `${count}:${raw}`;",
      "",
    ].join("\n"),
  });
  assertNoBundledTypeScriptLibraries(valid);
  assert.equal(formatDiagnostics(valid.getDiagnostics("all")), "");

  const invalid = createSourceProfileSession({
    profile: "js",
    sourceText: [
      "const path: string = \"a/b\";",
      "const parts = path.Split(\"/\");",
      "const count = [1, 2, 3].Length;",
      "export const result = `${parts}:${count}`;",
      "",
    ].join("\n"),
  });
  assertNoBundledTypeScriptLibraries(invalid);
  const diagnosticsText = formatDiagnostics(invalid.getDiagnostics("all"));
  assert.match(diagnosticsText, /Property 'Split' does not exist on type 'string'\. Did you mean 'split'\?/u);
  assert.match(diagnosticsText, /Property 'Length' does not exist on type 'number\[\]'\. Did you mean 'length'\?/u);
});

test("JS surface Map and iterator types are iterable with for-of under noLib", () => {
  const session = createSourceProfileSession({
    profile: "js",
    sourceText: [
      "const map = new Map<string, number>();",
      "map.set(\"a\", 1);",
      "let total = 0;",
      "for (const value of map.values()) total += value;",
      "for (const key of map.keys()) total += key.length;",
      "const set = new Set<number>();",
      "for (const item of set) total += item;",
      "export const result = total;",
      "",
    ].join("\n"),
  });
  assertNoBundledTypeScriptLibraries(session);
  assert.equal(formatDiagnostics(session.getDiagnostics("all")), "");
});

test("ECMAScript string iteration remains available in both source profiles", () => {
  for (const profile of ["csharp", "js"]) {
    const session = createSourceProfileSession({
      profile,
      sourceText: [
        "let result = \"\";",
        "for (const character of \"A😀\") result += character;",
        "export { result };",
        "",
      ].join("\n"),
    });
    assertNoBundledTypeScriptLibraries(session);
    assert.equal(
      formatDiagnostics(session.getDiagnostics("all")),
      "",
      `${profile} profile must retain standard ECMAScript string iteration`,
    );
  }
});

function createSourceProfileSession(options) {
  const files = new Map([
    ["/src/index.ts", options.sourceText],
  ]);
  for (const file of sourceProfileFiles(options.profile)) {
    files.set(file.path, file.text);
  }
  return createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files,
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
      strict: true,
    },
  });
}

function sourceProfileFiles(profile) {
  if (profile === "csharp") {
    const declarations = csharpSourceProfileContributions(sourceProfileContext([])).declarations ?? [];
    return declarationFiles(csharpSourceProfileOwnerId, declarations);
  }
  const csharpDeclarations = csharpSourceProfileContributions(sourceProfileContext([{ id: csharpJsSourceProfileOwnerId }])).declarations ?? [];
  assert.deepEqual(csharpDeclarations, []);
  const jsDeclarations = csharpJsSurfaceSourceProfileContributions().declarations ?? [];
  return declarationFiles(csharpJsSourceProfileOwnerId, jsDeclarations);
}

function declarationFiles(ownerId, declarations) {
  return declarations.map((declaration) => ({
    path: `/src/.tsonic/source-profiles/${ownerId}/${declaration.fileName}`,
    text: declaration.text,
  }));
}

function sourceProfileContext(selectedSurfaces) {
  return {
    project: { entryPoint: "index.ts", rootDir: ".", targets: [] },
    target: { id: "csharp" },
    targetPack: { id: "csharp", displayName: "C#" },
    selectedCapabilities: [],
    selectedSurfaces,
  };
}

function assertNoBundledTypeScriptLibraries(session) {
  const checked = session.checkSource();
  const fileNames = checked.sourceFiles
    .map((sourceFile) => checked.ast.getFileName(sourceFile))
    .filter((fileName) => fileName !== "");
  assert.equal(fileNames.some((fileName) => /\/lib\.[^/]*\.d\.ts$/u.test(fileName)), false, `bundled TypeScript lib leaked into source profile program: ${fileNames.join("\n")}`);
}
