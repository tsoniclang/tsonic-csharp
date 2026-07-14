import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  TstsProviderContractVersion,
  createCompilerSessionFromFiles,
  formatDiagnostics,
  targetConversionFactKey,
} from "@tsonic/tsts";
import { createTsonicCoreSourceExtension } from "@tsonic/source-core";
import {
  createCsharpTargetSemanticsExtension,
  createCsharpSourceSemanticsExtension,
} from "../dist/index.js";
import {
  csharpObservedTargetAssignabilityFactKey,
  csharpTargetConversionOperationFactKey,
  csharpTargetOperationFactKey,
} from "../dist/source/csharp-facts.js";
import { buildDotnetFixture } from "./helpers/dotnet-fixtures.mjs";

const searchValuesModule = "@example/csharp/search-values.js";
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("C# post-check target assignability reports target invalidity without changing the TS relation", () => {
  const sourceText = `
    declare let x: number;
    declare let y: number;
    x = y;
  `;
  const session = createNativeSession(sourceText);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.ok(sourceFile);

  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === 2322), false, formatDiagnostics(diagnostics));
  assert.equal(session.extensionHost?.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_TARGET_ASSIGNABILITY_INVALID"
  ).length, 0);
  session.extensionHost?.facts.set(sourceFile, csharpObservedTargetAssignabilityFactKey, {
    source: {
      kind: "target-named",
      id: "Example.SearchValues`1",
      typeArguments: [{ kind: "opaque", id: "any" }],
    },
    target: {
      kind: "target-named",
      id: "Example.SearchValues`1",
      typeArguments: [{ kind: "source-primitive", name: "int32" }],
    },
    relation: "assignment",
    expression: sourceFile,
  }, [{ message: "Test-injected post-check assignability fact after TSTS accepted a TypeScript assignment." }]);
  const observedFacts = collectFacts(sourceFile, session.ast, session.extensionHost, csharpObservedTargetAssignabilityFactKey);
  assert.equal(observedFacts.length, 1);
  assert.equal(observedFacts[0].relation, "assignment");

  session.finalizeExtensions();

  const targetDiagnostics = session.extensionHost?.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_TARGET_ASSIGNABILITY_INVALID"
  ) ?? [];
  assert.equal(targetDiagnostics.length, 1);
  assert.match(targetDiagnostics[0].message, /after TSTS accepted the TypeScript relation/);
  assert.equal(session.getDiagnostics("all").some((diagnostic) => diagnostic?.code === targetDiagnostics[0].numericCode), true);
});

test("C# post-check target assignability cannot make TypeScript-invalid assignments valid", () => {
  const sourceText = `
    import type { int32 } from "@tsonic/core/types.js";
    import type { SearchValues } from "@example/csharp/search-values.js";

    declare let x: SearchValues<int32>;
    x = null;
  `;
  const session = createSearchValuesSession(sourceText);
  const sourceFile = session.getSourceFile("/src/index.ts");

  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === 2322), true, formatDiagnostics(diagnostics));
  assert.equal(collectFacts(sourceFile, session.ast, session.extensionHost, csharpObservedTargetAssignabilityFactKey).length, 0);

  session.finalizeExtensions();

  const targetDiagnostics = session.extensionHost?.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_TARGET_ASSIGNABILITY_INVALID"
  ) ?? [];
  assert.equal(targetDiagnostics.length, 0);
});

test("C# post-check target assignability fails closed when target type facts are missing", () => {
  const sourceText = `
    declare let x: number;
    declare let y: number;
    x = y;
  `;
  const session = createNativeSession(sourceText);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.ok(sourceFile);
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const assignment = collectNodesByKind(sourceFile, session.ast, "KindBinaryExpression")[0];
  assert.ok(assignment);
  session.extensionHost?.facts.set(assignment, csharpObservedTargetAssignabilityFactKey, {
    source: {},
    target: {},
    relation: "assignment",
    expression: assignment,
  }, [{ message: "Test-injected post-check assignment observation without target type facts." }]);

  session.finalizeExtensions();

  const targetDiagnostics = session.extensionHost?.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_TARGET_ASSIGNABILITY_INVALID"
  ) ?? [];
  assert.equal(targetDiagnostics.length, 1);
  assert.match(targetDiagnostics[0].message, /requires finalized source and target type facts/u);
  assert.equal(session.getDiagnostics("all").some((diagnostic) => diagnostic?.code === 2322), false);
  assert.equal(session.getDiagnostics("all").some((diagnostic) => diagnostic?.code === targetDiagnostics[0].numericCode), true);
});

test("C# post-check target assignability resolves object-rest assignment targets", () => {
  const sourceText = `
    type Shape = { value: number; label: string };

    export function assign(input: Shape): string {
      let value: number = 0;
      let rest: { label: string } = { label: "" };
      ({ value, ...rest } = input);
      return rest.label + value;
    }
  `;
  const session = createNativeSession(sourceText);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.ok(sourceFile);

  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");
  session.finalizeExtensions();

  const diagnostics = session.extensionHost?.diagnostics.all() ?? [];
  assert.equal(diagnostics.filter((diagnostic) => diagnostic.extensionCode === "FACT_CONFLICT").length, 0);
  assert.equal(diagnostics.filter((diagnostic) => diagnostic.extensionCode === "CSHARP_TARGET_ASSIGNABILITY_INVALID").length, 0);
});

test("C# target generic constraints diagnose unproven provider type arguments after TSTS accepts source syntax", () => {
  const sourceText = `
    import type { SearchValues } from "@example/csharp/search-values.js";

    type Bad = SearchValues<object>;
  `;
  const session = createSearchValuesSession(sourceText);
  const sourceFile = session.getSourceFile("/src/index.ts");

  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === 9100145), true, formatDiagnostics(diagnostics));

  const targetDiagnostics = session.extensionHost?.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_TARGET_CONSTRAINT_INVALID"
  ) ?? [];
  assert.equal(targetDiagnostics.length, 1);
  assert.match(targetDiagnostics[0].message, /requires a finalized target type fact/u);
});

test("C# target generic constraints diagnose reflected notnull violations through TSTS type references", () => {
  const sourceText = `
    import type { int32 } from "@tsonic/core/types.js";
    import type { NotNullTarget } from "@tsonic/dotnet/ProviderConstraintFixtures.js";

    type Good = NotNullTarget<int32>;
    type Bad = NotNullTarget<null>;
  `;
  const session = createDotnetConstraintSession(sourceText);
  const sourceFile = session.getSourceFile("/src/index.ts");

  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");
  session.finalizeExtensions();

  const targetDiagnostics = session.extensionHost?.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_TARGET_CONSTRAINT_INVALID"
  ) ?? [];
  assert.equal(targetDiagnostics.length, 1);
  assert.match(targetDiagnostics[0].message, /notnull|target type fact/u);
});

test("C# post-check target assignability fails closed on TypeScript any boundaries without changing the TS relation", () => {
  const sourceText = `
    declare let value: any;
    declare let target: number;
    target = value;
  `;
  const session = createNativeSession(sourceText);
  const sourceFile = session.getSourceFile("/src/index.ts");

  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  session.finalizeExtensions();

  const targetDiagnostics = session.extensionHost?.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_TARGET_ASSIGNABILITY_INVALID"
  ) ?? [];
  assert.equal(targetDiagnostics.length, 1);
  assert.match(targetDiagnostics[0].message, /cannot cross a TypeScript any boundary/u);
  assert.equal(session.getDiagnostics("all").some((diagnostic) => diagnostic?.code === 2322), false);
  assert.equal(session.getDiagnostics("all").some((diagnostic) => diagnostic?.code === targetDiagnostics[0].numericCode), true);
});

test("C# compat mode records typed-boundary conversions for any assignments, initializers, and returns", () => {
  const sourceText = `
    declare let dynamicValue: any;

    export function assigned(): number {
      let target: number = 0;
      target = dynamicValue;
      return target;
    }

    export function initialized(value: any): number {
      const target: number = value;
      return target;
    }

    export function returned(value: any): number {
      return value;
    }

    export function boxed(value: number): any {
      return value;
    }
  `;
  const session = createNativeSession(sourceText, csharpProviderContext({
    id: "csharp",
    options: {
      typescriptCompatibility: "compat",
    },
  }));
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.ok(sourceFile);
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const targetDiagnostics = extensionHost.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_TARGET_ASSIGNABILITY_INVALID"
  );
  assert.equal(targetDiagnostics.length, 0);

  const assignmentRight = collectNodesByKind(sourceFile, session.ast, "KindBinaryExpression")[0]?.Right;
  assert.ok(assignmentRight);
  assertCompatCastFact(extensionHost, assignmentRight);

  const declarations = collectNodesByKind(sourceFile, session.ast, "KindVariableDeclaration");
  const initializer = declarations[2]?.Initializer;
  assert.ok(initializer);
  assertCompatCastFact(extensionHost, initializer);

  const returns = collectNodesByKind(sourceFile, session.ast, "KindReturnStatement");
  const typedReturnExpression = returns[2]?.Expression;
  assert.ok(typedReturnExpression);
  assertCompatCastFact(extensionHost, typedReturnExpression);

  const boxedReturnExpression = returns[3]?.Expression;
  assert.ok(boxedReturnExpression);
  const boxedConversion = extensionHost.facts.get(boxedReturnExpression, targetConversionFactKey);
  const boxedOperation = extensionHost.facts.get(boxedReturnExpression, csharpTargetConversionOperationFactKey);
  assert.equal(boxedConversion?.convertedType?.id, "Tsonic.CSharp.Js.TsValue");
  assert.equal(boxedOperation?.kind, "member");
  assert.equal(boxedOperation.memberName, "from");
  assert.equal(boxedOperation.static, true);
});

test("C# post-check target assignment requires writable selected provider property facts", () => {
  const session = createNativeSession(`
    declare class Target { value: number }
    declare let target: Target;
    declare let source: Target;
    target.value = source.value;
  `);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.ok(sourceFile);
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const assignment = collectNodesByKind(sourceFile, session.ast, "KindBinaryExpression")[0];
  const left = assignment?.Left;
  assert.ok(assignment);
  assert.ok(left);
  session.extensionHost?.facts.set(assignment, csharpObservedTargetAssignabilityFactKey, {
    source: { kind: "source-primitive", name: "float64" },
    target: { kind: "source-primitive", name: "float64" },
    relation: "assignment",
    expression: assignment,
  }, [{ message: "Test-injected post-check assignment observation after TSTS accepted the source assignment." }]);
  session.extensionHost?.facts.set(left, csharpTargetOperationFactKey, selectedMemberOperation({
    id: "Example.Target.ReadonlyValue",
    sourceName: "providerSelectedDeclarationName",
    targetName: "ReadonlyValue",
    kind: "property",
    readonly: true,
  }), [{ message: "Test-injected selected provider property fact proving readonly target mutability." }]);

  session.finalizeExtensions();

  const diagnostics = session.extensionHost?.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_TARGET_MEMBER_WRITE_INVALID"
  ) ?? [];
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /readonly property 'ReadonlyValue'/u);
  assert.equal(session.getDiagnostics("all").some((diagnostic) => diagnostic?.code === diagnostics[0].numericCode), true);
});

test("C# post-check target assignment requires writable selected provider indexer facts", () => {
  const session = createNativeSession(`
    declare class Headers { [key: string]: number }
    declare let headers: Headers;
    headers["Accept"] = 1;
  `);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.ok(sourceFile);
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const assignment = collectNodesByKind(sourceFile, session.ast, "KindBinaryExpression")[0];
  const left = assignment?.Left;
  assert.ok(assignment);
  assert.ok(left);
  session.extensionHost?.facts.set(assignment, csharpObservedTargetAssignabilityFactKey, {
    source: { kind: "source-primitive", name: "float64" },
    target: { kind: "source-primitive", name: "float64" },
    relation: "assignment",
    expression: assignment,
  }, [{ message: "Test-injected post-check assignment observation after TSTS accepted the source assignment." }]);
  session.extensionHost?.facts.set(left, csharpTargetOperationFactKey, selectedMemberOperation({
    id: "Example.Headers.Item(System.String)",
    sourceName: "item",
    targetName: "Item",
    kind: "indexer",
    readonly: true,
    parameters: [
      {
        name: "key",
        type: { kind: "target-named", id: "System.String" },
        passingMode: "by-value",
      },
    ],
  }), [{ message: "Test-injected selected provider string indexer fact proving readonly target mutability." }]);

  session.finalizeExtensions();

  const diagnostics = session.extensionHost?.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_TARGET_MEMBER_WRITE_INVALID"
  ) ?? [];
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /readonly indexer 'Item'/u);
  assert.equal(session.getDiagnostics("all").some((diagnostic) => diagnostic?.code === diagnostics[0].numericCode), true);
});

test("C# post-check target assignment accepts writable selected provider field facts", () => {
  const session = createNativeSession(`
    declare class Target { value: number }
    declare let target: Target;
    declare let source: Target;
    target.value = source.value;
  `);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.ok(sourceFile);
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const assignment = collectNodesByKind(sourceFile, session.ast, "KindBinaryExpression")[0];
  const left = assignment?.Left;
  assert.ok(assignment);
  assert.ok(left);
  session.extensionHost?.facts.set(assignment, csharpObservedTargetAssignabilityFactKey, {
    source: { kind: "source-primitive", name: "float64" },
    target: { kind: "source-primitive", name: "float64" },
    relation: "assignment",
    expression: assignment,
  }, [{ message: "Test-injected post-check assignment observation after TSTS accepted the source assignment." }]);
  session.extensionHost?.facts.set(left, csharpTargetOperationFactKey, selectedMemberOperation({
    id: "Example.Target.MutableField",
    sourceName: "value",
    targetName: "MutableField",
    kind: "field",
  }), [{ message: "Test-injected selected provider field fact proving writable target mutability." }]);

  session.finalizeExtensions();

  assert.equal(session.extensionHost?.diagnostics.all().some((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_TARGET_MEMBER_WRITE_INVALID"
  ), false);
});

test("C# post-check target assignment rejects selected provider events until source event semantics exist", () => {
  const session = createNativeSession(`
    declare class Target { changed: number }
    declare let target: Target;
    target.changed = 1;
  `);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.ok(sourceFile);
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const assignment = collectNodesByKind(sourceFile, session.ast, "KindBinaryExpression")[0];
  const left = assignment?.Left;
  assert.ok(assignment);
  assert.ok(left);
  session.extensionHost?.facts.set(assignment, csharpObservedTargetAssignabilityFactKey, {
    source: { kind: "source-primitive", name: "float64" },
    target: { kind: "source-primitive", name: "float64" },
    relation: "assignment",
    expression: assignment,
  }, [{ message: "Test-injected post-check assignment observation after TSTS accepted the source assignment." }]);
  session.extensionHost?.facts.set(left, csharpTargetOperationFactKey, selectedMemberOperation({
    id: "Example.Target.Changed",
    sourceName: "changed",
    targetName: "Changed",
    kind: "event",
  }), [{ message: "Test-injected selected provider event fact." }]);

  session.finalizeExtensions();

  const diagnostics = session.extensionHost?.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_TARGET_MEMBER_WRITE_INVALID"
  ) ?? [];
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /cannot write event 'Changed'/u);
});

function createSearchValuesSession(sourceText) {
  return createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/node_modules/@tsonic/core/package.json", JSON.stringify({
        name: "@tsonic/core",
        version: "1.0.0",
        type: "module",
        exports: {
          "./types.js": {
            types: "./types.d.ts",
            default: "./types.js",
          },
        },
      })],
      ["/src/node_modules/@example/csharp/package.json", JSON.stringify({
        name: "@example/csharp",
        version: "1.0.0",
        type: "module",
        exports: {
          "./search-values.js": {
            types: "./search-values.d.ts",
            default: "./search-values.js",
          },
        },
      })],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
      strictNullChecks: true,
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: [
        createTsonicCoreSourceExtension(),
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createProviderBackedSearchValuesExtension(),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ],
    },
  });
}

function createDotnetConstraintSession(sourceText) {
  const constraintAssembly = buildConstraintFixture();
  const target = {
    id: "csharp",
    options: {
      references: {
        assemblies: [{ include: constraintAssembly }],
      },
    },
  };
  return createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/node_modules/@tsonic/core/package.json", JSON.stringify({
        name: "@tsonic/core",
        version: "1.0.0",
        type: "module",
        exports: {
          "./types.js": {
            types: "./types.d.ts",
            default: "./types.js",
          },
        },
      })],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
      strictNullChecks: true,
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: [
        createTsonicCoreSourceExtension(),
        createCsharpSourceSemanticsExtension(csharpProviderContext(target)),
        createCsharpTargetSemanticsExtension(csharpProviderContext(target)),
      ],
    },
  });
}

function createNativeSession(sourceText, context = csharpProviderContext()) {
  return createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
      strictNullChecks: true,
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: [
        createTsonicCoreSourceExtension(),
        createCsharpSourceSemanticsExtension(context),
        createCsharpTargetSemanticsExtension(context),
      ],
    },
  });
}

function assertCompatCastFact(extensionHost, subject) {
  const conversion = extensionHost.facts.get(subject, targetConversionFactKey);
  const csharpConversion = extensionHost.facts.get(subject, csharpTargetConversionOperationFactKey);
  assert.equal(conversion?.convertedType?.kind, "source-primitive");
  assert.equal(conversion.convertedType.name, "float64");
  assert.match(conversion.operation?.operationId, /^tsonic\.csharp\.compat\.any\.typed-boundary-cast:/u);
  assert.equal(csharpConversion?.kind, "member");
  assert.equal(csharpConversion.memberName, "CastCompat");
  assert.equal(csharpConversion.static, true);
}

function collectFacts(sourceFile, ast, extensionHost, factKey) {
  if (sourceFile === undefined || extensionHost === undefined) {
    return [];
  }
  const facts = [];
  visit(sourceFile);
  return facts;

  function visit(node) {
    const fact = extensionHost.facts.get(node, factKey);
    if (fact !== undefined) {
      facts.push(fact);
    }
    ast.forEachChild(node, visit);
  }
}

function collectNodesByKind(sourceFile, ast, kindName) {
  const nodes = [];
  visit(sourceFile);
  return nodes;

  function visit(node) {
    if (ast.kindName(node) === kindName) {
      nodes.push(node);
    }
    ast.forEachChild(node, visit);
  }
}

function selectedMemberOperation(member) {
  return {
    kind: "member",
    operationId: member.id,
    operationKind: member.kind === "field" || member.kind === "event" ? "property" : member.kind,
    memberName: member.targetName,
    resultType: { kind: "source-primitive", name: "float64" },
    selectedMember: {
      parameters: [],
      returnType: { kind: "source-primitive", name: "float64" },
      ...member,
    },
  };
}

function createProviderBackedSearchValuesExtension() {
  return {
    identity: {
      id: "example-csharp-search-values-extension",
      version: "1.0.0",
      capabilityNamespace: "example.csharp.search-values",
    },
    initialize(context) {
      context.registerTargetBindingProvider({
        identity: {
          id: "example-csharp-search-values-provider",
          version: "1.0.0",
          target: "csharp",
          extensionContractVersion: TstsProviderContractVersion,
          providerKind: "binding",
        },
        ownsModule(moduleSpecifier) {
          return moduleSpecifier === searchValuesModule ? { kind: "owned" } : { kind: "unowned" };
        },
        resolveModule(moduleSpecifier) {
          return {
            kind: "virtual",
            moduleSpecifier,
            virtualFileName: "tsts-provider://example-csharp/search-values.d.ts",
            providerModuleId: "example.csharp.search-values",
            packageName: "@example/csharp",
            packageVersion: "1.0.0",
          };
        },
        getDeclarationModel(resolution) {
          return {
            moduleSpecifier: resolution.moduleSpecifier,
            providerModuleId: resolution.providerModuleId,
            exports: [{
              id: "SearchValues",
              name: "SearchValues",
              kind: "class",
              targetIdentity: {
                target: "csharp",
                id: "System.Collections.Generic.List`1",
                displayName: "System.Collections.Generic.List<T>",
              },
              typeParameters: [{
                name: "T",
                constraints: [{
                  kind: "target-named",
                  target: "csharp",
                  id: "System.IEquatable`1",
                  typeArguments: [{ kind: "type-parameter", name: "T" }],
                  sourceShape: { kind: "unknown" },
                }],
              }],
              members: [{
                id: "SearchValues.value",
                name: "value",
                kind: "property",
                type: { kind: "type-parameter", name: "T" },
              }],
            }],
          };
        },
      });
    },
  };
}

function csharpProviderContext(target = { id: "csharp" }) {
  return {
    project: {
      entryPoint: "index.ts",
      targets: [target],
    },
    target,
    selectedPackages: [],
    selectedSurfaces: [],
  };
}

function buildConstraintFixture() {
  const project = join(repoRoot, "test/fixtures/dotnet-provider/constraints/ConstraintProviderFixture.csproj");
  const outputDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/constraints/bin");
  const intermediateDirectory = join(repoRoot, ".temp/dotnet-provider-fixtures/constraints/obj/");
  return buildDotnetFixture({
    project,
    outputDirectory,
    intermediateDirectory,
    outputAssemblyName: "ConstraintProviderFixture.dll",
    projectDirectory: join(repoRoot, "test/fixtures/dotnet-provider/constraints"),
  });
}
