import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCompilerSessionFromFiles,
  createExtensionConsumerQueries,
  formatDiagnostics,
} from "@tsonic/tsts";
import {
  compileTargetFromSemanticSession,
  createTargetCompilerExtensions,
} from "../../tsonic/packages/host/dist/index.js";
import { createCsharpTargetPack } from "../dist/index.js";

test("C# build emits default class imports as project-source class references", () => {
  const sourceExample = `
    // box.ts
    export default class Box {}

    // main.ts
    import Box from "./box.js";
    export function create(): Box {
      return new Box();
    }
  `;
  assert.match(sourceExample, /export default class Box/);
  assert.match(sourceExample, /import Box from "\.\/box\.js"/);

  const result = compileCsharpModuleGraph(new Map([
    ["/src/box.ts", "export default class Box {}"],
    ["/src/main.ts", `
      import Box from "./box.js";
      export function create(): Box {
        return new Box();
      }
    `],
  ]));

  assert.deepEqual(result.diagnostics, []);
  assert.match(sourceArtifact(result, "src/Box.cs"), /public class Box/);
  const main = sourceArtifact(result, "src/Main.cs");
  assert.match(main, /public static Box create\(\)/);
  assert.match(main, /return new Box\(\);/);
});

test("C# build emits re-exported default classes as original project-source class references", () => {
  const sourceExample = `
    // box.ts
    export default class Box {}

    // barrel.ts
    export { default } from "./box.js";

    // main.ts
    import Box from "./barrel.js";
    export function create(): Box {
      return new Box();
    }
  `;
  assert.match(sourceExample, /export \{ default \} from "\.\/box\.js"/);
  assert.match(sourceExample, /import Box from "\.\/barrel\.js"/);

  const result = compileCsharpModuleGraph(new Map([
    ["/src/box.ts", "export default class Box {}"],
    ["/src/barrel.ts", "export { default } from \"./box.js\";"],
    ["/src/main.ts", `
      import Box from "./barrel.js";
      export function create(): Box {
        return new Box();
      }
    `],
  ]));

  assert.deepEqual(result.diagnostics, []);
  assert.match(sourceArtifact(result, "src/Box.cs"), /public class Box/);
  const main = sourceArtifact(result, "src/Main.cs");
  assert.match(main, /public static Box create\(\)/);
  assert.match(main, /return new Box\(\);/);
});

function compileCsharpModuleGraph(files) {
  const target = { id: "csharp", options: {} };
  const project = { entryPoint: "main.ts", targets: [target] };
  const targetPack = createCsharpTargetPack();
  const { extensions } = createTargetCompilerExtensions({
    project,
    target,
    targetPack,
  });
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files,
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
      strict: true,
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions,
    },
  });
  const sourceFile = session.getSourceFile("/src/main.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");
  const extensionHost = session.finalizeExtensions();
  assert.ok(extensionHost);
  return compileTargetFromSemanticSession(
    {
      compiler: session,
      program: session.program,
      ast: session.ast,
      types: session.types,
      sourceFiles: session.getSourceFilesToEmit().filter((candidate) => candidate !== undefined),
      extensionHost,
      checker: session.checker,
      facts: createExtensionConsumerQueries(extensionHost, "csharp-module-graph-test"),
      tstsDiagnostics: session.getDiagnostics("all"),
    },
    project,
    target,
    targetPack,
    {
      projectFilePath: "/src/tsonic.json",
      projectRoot: "/src",
      outputRoot: "/out",
      targetOutputRoot: "/out/csharp",
    },
  );
}

function sourceArtifact(result, path) {
  const artifact = result.artifacts.find((candidate) => candidate.kind === "source" && candidate.path === path);
  assert.ok(artifact, `Missing source artifact ${path}`);
  return artifact.text;
}
