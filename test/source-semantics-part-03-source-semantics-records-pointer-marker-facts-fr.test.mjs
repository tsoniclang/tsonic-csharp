import { test, assert, TstsProviderContractVersion, argumentPassingFactKey, attributeFactKey, createCompilerSessionFromFiles, defaultValueFactKey, fieldFactKey, flowStateFactKey, functionPointerFactKey, formatDiagnostics, pointerFactKey, runtimeCarrierFactKey, selectedTargetSignatureFactKey, sourcePrimitiveFactKey, structFactKey, targetConversionFactKey, targetOperationFactKey, createCsharpTargetSemanticsExtension, createCsharpSourceSemanticsExtension, csharpJsSourceProfileOwnerId, csharpJsSurfaceSourceProfileContributions, csharpSourceProfileContributions, csharpSourceProfileOwnerId, createTsonicCoreSourceExtension, providerExportDeclarationsForSourceModule, tsonicCoreSourceSemanticsModules, csharpArrayBoundaryFactKey, csharpObjectShapeFactKey, csharpAttributeApplicationFactKey, csharpTargetOperationFactKey, csharpTargetConversionOperationFactKey, csharpSourceSemanticsModules, createCsharpSourceVirtualModulesProvider, collectFacts, collectFactsForKey, collectIdentifiersByText, collectNodesByKind, collectCallsByCalleeText, collectCallsByCalleeExpressionText, collectTypeReferencesByText, typeAliasTypeNode, calleeText, expressionText, typeReferenceText, argumentPassingFactForCall, primitiveSummary, packageJson, csharpTestExtensions, csharpProviderContext, csharpSourceProfileFiles, csharpJsSourceProfileFiles, createAttributeProviderExtension } from "./source-semantics.helpers.mjs";

test("source-semantics records pointer marker facts from neutral type aliases", () => {
  const sourceText = `
    import type { ptr, fnptr } from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";

    type IntPtr = ptr<int32>;
    type Binary = fnptr<[int32, int32], int32>;
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/node_modules/@tsonic/core/package.json", packageJson("@tsonic/core", {
        "./lang.js": "./lang.js",
        "./types.js": "./types.js",
      })],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const pointerFacts = collectFactsForKey(sourceFile, session.ast, extensionHost, pointerFactKey);
  const functionPointerFacts = collectFactsForKey(sourceFile, session.ast, extensionHost, functionPointerFactKey);

  assert.equal(pointerFacts.length, 2);
  assert.deepEqual(pointerFacts[0].fact, {
    pointee: pointerFacts[0].fact.pointee,
    mutability: "target-defined",
    unsafeRequired: true,
  });
  assert.equal(session.ast.kindName(pointerFacts[0].fact.pointee), "KindTypeReference");
  assert.equal(functionPointerFacts.length, 2);
  assert.equal(functionPointerFacts[0].fact.parameters.length, 2);
  assert.equal(session.ast.kindName(functionPointerFacts[0].fact.result), "KindTypeReference");
});
test("source-semantics records assertion target conversions as C# target facts", () => {
  const sourceText = `
    class Animal {}
    class Dog extends Animal {}

    export function downcast(animal: Animal): Dog {
      return animal as Dog;
    }
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const assertion = collectNodesByKind(sourceFile, session.ast, "KindAsExpression")[0];
  assert.ok(assertion);
  const conversion = extensionHost.facts.get(assertion, targetConversionFactKey);
  const csharpConversion = extensionHost.facts.get(assertion, csharpTargetConversionOperationFactKey);

  assert.equal(conversion?.convertedType?.kind, "target-named");
  assert.equal(conversion.convertedType.id, "Dog");
  assert.equal(conversion.operation?.operationKind, "operator");
  assert.equal(conversion.operation?.targetOperation, "cast");
  assert.equal(csharpConversion?.kind, "cast");
  assert.equal(csharpConversion.targetType.kind, "target-named");
  assert.equal(csharpConversion.targetType.id, "Dog");
});
test("source-semantics records source primitive assertions as C# conversion method facts", () => {
  const sourceText = `
    import type { int32, uint8 } from "@tsonic/core/types.js";

    export function toByte(value: int32): uint8 {
      return value as uint8;
    }
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/node_modules/@tsonic/core/package.json", packageJson("@tsonic/core", {
        "./types.js": "./types.js",
      })],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const assertion = collectNodesByKind(sourceFile, session.ast, "KindAsExpression")[0];
  assert.ok(assertion);
  const conversion = extensionHost.facts.get(assertion, targetConversionFactKey);
  const csharpConversion = extensionHost.facts.get(assertion, csharpTargetConversionOperationFactKey);

  assert.equal(conversion?.convertedType?.kind, "source-primitive");
  assert.equal(conversion.convertedType.name, "uint8");
  assert.equal(conversion.operation?.operationKind, "method");
  assert.equal(conversion.operation?.operationId, "System.Convert.ToByte");
  assert.equal(csharpConversion?.kind, "member");
  assert.equal(csharpConversion.memberName, "ToByte");
  assert.equal(csharpConversion.declaringType.id, "System.Convert");
});
test("source-semantics rejects any assertion conversions without explicit target facts", () => {
  const sourceText = `
    import type { int32 } from "@tsonic/core/types.js";

    export function unsafeCast(value: any): int32 {
      return value as int32;
    }
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/node_modules/@tsonic/core/package.json", packageJson("@tsonic/core", {
        "./types.js": "./types.js",
      })],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(
    formatDiagnostics(diagnostics),
    "/src/index.ts(5,14): error TS9100122: [TSEXT9100122] C# assertion conversion cannot cross a TypeScript any boundary without finalized target conversion facts.\n",
  );

  const extensionHost = session.finalizeExtensions();
  const assertion = collectNodesByKind(sourceFile, session.ast, "KindAsExpression")[0];
  assert.ok(assertion);

  assert.equal(extensionHost.facts.get(assertion, targetConversionFactKey), undefined);
  assert.equal(extensionHost.facts.get(assertion, csharpTargetConversionOperationFactKey), undefined);
  const anyAssertionDiagnostics = extensionHost.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_ANY_ASSERTION_CONVERSION_UNSUPPORTED"
  );
  assert.equal(anyAssertionDiagnostics.length, 1);
  assert.match(anyAssertionDiagnostics[0].message, /TypeScript any boundary/);
});
test("source-semantics records compat any assertion conversions as closed target facts", () => {
  const sourceText = `
    import type { int32 } from "@tsonic/core/types.js";

    export function typed(value: any): int32 {
      return value as int32;
    }
  `;
  const context = csharpProviderContext({ typescriptCompatibility: "compat" });
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/node_modules/@tsonic/core/package.json", packageJson("@tsonic/core", {
        "./types.js": "./types.js",
      })],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(context),
        createCsharpTargetSemanticsExtension(context),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const assertion = collectNodesByKind(sourceFile, session.ast, "KindAsExpression")[0];
  assert.ok(assertion);
  const conversion = extensionHost.facts.get(assertion, targetConversionFactKey);
  const csharpConversion = extensionHost.facts.get(assertion, csharpTargetConversionOperationFactKey);

  assert.equal(extensionHost.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_ANY_ASSERTION_CONVERSION_UNSUPPORTED"
  ).length, 0);
  assert.equal(conversion?.convertedType?.kind, "source-primitive");
  assert.equal(conversion.convertedType.name, "int32");
  assert.equal(conversion.operation?.operationKind, "method");
  assert.match(conversion.operation?.operationId, /^tsonic\.csharp\.compat\.any\.typed-boundary-cast:/u);
  assert.equal(csharpConversion?.kind, "member");
  assert.equal(csharpConversion.memberName, "CastCompat");
  assert.equal(csharpConversion.static, true);
  assert.equal(csharpConversion.declaringType.id, "Tsonic.CSharp.Js.TsValue");
  assert.deepEqual(csharpConversion.typeArguments, [{ kind: "source-primitive", name: "int32" }]);
});
test("source-semantics treats compat any-to-any assertions as identity", () => {
  const sourceText = `
    export function same(value: any): any {
      return value as any;
    }
  `;
  const context = csharpProviderContext({ typescriptCompatibility: "compat" });
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(context),
        createCsharpTargetSemanticsExtension(context),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const assertion = collectNodesByKind(sourceFile, session.ast, "KindAsExpression")[0];
  assert.ok(assertion);

  assert.equal(extensionHost.facts.get(assertion, targetConversionFactKey), undefined);
  assert.equal(extensionHost.facts.get(assertion, csharpTargetConversionOperationFactKey), undefined);
  assert.equal(extensionHost.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_ANY_ASSERTION_CONVERSION_UNSUPPORTED"
  ).length, 0);
});
test("source-semantics propagates object-shape callable carriers through destructuring", () => {
  const sourceText = `
    export interface Named {
      name: string;
      run(value: number): number;
    }

    export function invoke(named: Named): number {
      const { run } = named;
      return run(2);
    }
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const callRun = collectIdentifiersByText(sourceFile, session.ast, "run")
    .find((node) => session.ast.kindName(session.ast.parent(node)) === "KindCallExpression");
  assert.ok(callRun);
  const carrier = extensionHost.facts.get(callRun, runtimeCarrierFactKey)?.carrier;

  assert.equal(carrier?.kind, "target-named");
  assert.equal(carrier.id, "System.Func`2");
  assert.deepEqual(carrier.typeArguments?.map((argument) => argument.kind === "source-primitive" ? argument.name : argument.id), ["float64", "float64"]);
});
test("source-semantics preserves C# source-primitive carriers through conditional expressions", () => {
  const sourceText = `
    import type { bool, int } from "@tsonic/csharp/types.js";

    export function choose(flag: bool, left: int, right: int): int {
      const selected = flag ? left : right;
      return selected;
    }
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const conditional = collectNodesByKind(sourceFile, session.ast, "KindConditionalExpression")[0];
  const selectedName = collectIdentifiersByText(sourceFile, session.ast, "selected")
    .find((node) => session.ast.kindName(session.ast.parent(node)) === "KindVariableDeclaration");
  assert.ok(conditional);
  assert.ok(selectedName);

  assert.deepEqual(extensionHost.facts.get(conditional, runtimeCarrierFactKey)?.carrier, {
    kind: "source-primitive",
    name: "int32",
  });
  assert.deepEqual(extensionHost.facts.get(selectedName, runtimeCarrierFactKey)?.carrier, {
    kind: "source-primitive",
    name: "int32",
  });
});
test("source-semantics prefers explicit C# array aliases over numeric literal semantic carriers", () => {
  const sourceText = `
    import type { int } from "@tsonic/csharp/types.js";

    export function alias(): int[] {
      const values: int[] = [0, 0];
      const selected = values;
      return selected;
    }
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const selectedName = collectIdentifiersByText(sourceFile, session.ast, "selected")
    .find((node) => session.ast.kindName(session.ast.parent(node)) === "KindVariableDeclaration");
  assert.ok(selectedName);

  assert.deepEqual(extensionHost.facts.get(selectedName, runtimeCarrierFactKey)?.carrier, {
    kind: "array",
    element: {
      kind: "source-primitive",
      name: "int32",
    },
  });
});
test("source-semantics records Promise/Task await result carrier facts", () => {
  const sourceText = `
    export async function tick(): Promise<void> {
      return;
    }

    export async function run(): Promise<string> {
      await tick();
      return "done";
    }
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ...csharpSourceProfileFiles().map((file) => [file.path, file.text]),
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const tickCall = collectCallsByCalleeText(sourceFile, session.ast, "tick")[0];
  const awaitExpression = collectNodesByKind(sourceFile, session.ast, "KindAwaitExpression")[0];
  const returnLiteral = collectNodesByKind(sourceFile, session.ast, "KindStringLiteral")
    .find((node) => session.ast.text(node) === "done");

  assert.ok(tickCall);
  assert.ok(awaitExpression);
  assert.ok(returnLiteral);

  const tickCallCarrier = extensionHost.facts.get(tickCall, runtimeCarrierFactKey)?.carrier;
  const awaitResultCarrier = extensionHost.facts.get(awaitExpression, runtimeCarrierFactKey)?.carrier;
  const returnLiteralCarrier = extensionHost.facts.get(returnLiteral, runtimeCarrierFactKey)?.carrier;

  assert.equal(tickCallCarrier?.id, "System.Threading.Tasks.Task");
  assert.equal(tickCallCarrier?.csharpTaskResultType?.id, "System.Void");
  assert.equal(awaitResultCarrier?.id, "System.Void");
  assert.equal(returnLiteralCarrier?.id, "System.String");
});
test("source-semantics refines awaited source-primitive aliases from Promise/Task result facts", () => {
  const sourceText = `
    import type { int32 } from "@tsonic/core/types.js";

    export async function identity(value: Promise<int32>): Promise<int32> {
      return await value;
    }
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ...csharpSourceProfileFiles().map((file) => [file.path, file.text]),
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
      strict: true,
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const awaitExpression = collectNodesByKind(sourceFile, session.ast, "KindAwaitExpression")[0];
  assert.ok(awaitExpression);
  const awaitResultCarrier = extensionHost.facts.get(awaitExpression, runtimeCarrierFactKey)?.carrier;

  assert.equal(awaitResultCarrier?.kind, "source-primitive");
  assert.equal(awaitResultCarrier.name, "int32");
});
test("source-semantics records Promise/Task result carriers with async object-literal return shapes", () => {
  const sourceText = `
    export interface AsyncBox {
      value: number;
    }

    export async function make(): Promise<AsyncBox> {
      return { value: 1 };
    }
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ...csharpSourceProfileFiles().map((file) => [file.path, file.text]),
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
      strict: true,
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  assert.deepEqual(extensionHost.diagnostics.all(), []);

  const promiseReference = collectTypeReferencesByText(sourceFile, session.ast, "Promise")[0];
  const objectLiteral = collectNodesByKind(sourceFile, session.ast, "KindObjectLiteralExpression")[0];
  assert.ok(promiseReference);
  assert.ok(objectLiteral);

  const promiseCarrier = extensionHost.facts.get(promiseReference, runtimeCarrierFactKey)?.carrier;
  const objectLiteralCarrier = extensionHost.facts.get(objectLiteral, runtimeCarrierFactKey)?.carrier;
  const objectLiteralShape = extensionHost.facts.get(objectLiteral, csharpObjectShapeFactKey);

  assert.equal(promiseCarrier?.id, "System.Threading.Tasks.Task`1");
  assert.equal(promiseCarrier.csharpTaskResultType.id, "AsyncBox");
  assert.equal(objectLiteralCarrier?.id, objectLiteralShape?.targetType.id);
  assert.deepEqual(objectLiteralShape?.members.map((member) => [member.sourceName, member.memberKind]), [["value", "property"]]);
});
test("source-semantics propagates object-shape callable carriers through parameter destructuring", () => {
  const sourceText = `
    export interface Named {
      name: string;
      run(value: number): number;
    }

    export function invoke({ run }: Named): number {
      return run(2);
    }
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const callRun = collectIdentifiersByText(sourceFile, session.ast, "run")
    .find((node) => session.ast.kindName(session.ast.parent(node)) === "KindCallExpression");
  assert.ok(callRun);
  const carrier = extensionHost.facts.get(callRun, runtimeCarrierFactKey)?.carrier;

  assert.equal(carrier?.kind, "target-named");
  assert.equal(carrier.id, "System.Func`2");
  assert.deepEqual(carrier.typeArguments?.map((argument) => argument.kind === "source-primitive" ? argument.name : argument.id), ["float64", "float64"]);
});
test("source-semantics records object-shape facts for destructured object bindings before later member access", () => {
  const sourceText = `
    export interface Outer {
      child: {
        label: string;
        value: number;
      };
    }

    export function label(input: Outer): string {
      const { child } = input;
      return child.label;
    }
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const childReceiver = collectIdentifiersByText(sourceFile, session.ast, "child")
    .find((node) => session.ast.kindName(session.ast.parent(node)) === "KindPropertyAccessExpression");
  assert.ok(childReceiver);
  const childShape = extensionHost.facts.get(childReceiver, csharpObjectShapeFactKey);
  const propertyAccess = session.ast.parent(childReceiver);
  const operation = extensionHost.facts.get(propertyAccess, targetOperationFactKey);
  const csharpOperation = extensionHost.facts.get(propertyAccess, csharpTargetOperationFactKey);

  assert.equal(childShape?.members.some((member) => member.sourceName === "label"), true);
  assert.equal(operation?.operationKind, "property");
  assert.equal(operation.targetOperation, "label");
  assert.equal(csharpOperation?.memberName, "label");
});
