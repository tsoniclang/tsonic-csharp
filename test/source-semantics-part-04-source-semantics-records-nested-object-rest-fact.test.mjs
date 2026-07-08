import { test, assert, TstsProviderContractVersion, argumentPassingFactKey, attributeFactKey, createCompilerSessionFromFiles, defaultValueFactKey, fieldFactKey, flowStateFactKey, functionPointerFactKey, formatDiagnostics, pointerFactKey, runtimeCarrierFactKey, selectedTargetSignatureFactKey, sourcePrimitiveFactKey, structFactKey, targetConversionFactKey, targetOperationFactKey, createCsharpTargetSemanticsExtension, createCsharpSourceSemanticsExtension, csharpJsSourceProfileOwnerId, csharpJsSurfaceSourceProfileContributions, csharpSourceProfileContributions, csharpSourceProfileOwnerId, createTsonicCoreSourceExtension, providerExportDeclarationsForSourceModule, tsonicCoreSourceSemanticsModules, csharpArrayBoundaryFactKey, csharpObjectShapeFactKey, csharpAttributeApplicationFactKey, csharpTargetOperationFactKey, csharpTargetConversionOperationFactKey, csharpSourceSemanticsModules, createCsharpSourceVirtualModulesProvider, collectFacts, collectFactsForKey, collectIdentifiersByText, collectNodesByKind, collectCallsByCalleeText, collectCallsByCalleeExpressionText, collectTypeReferencesByText, typeAliasTypeNode, calleeText, expressionText, typeReferenceText, argumentPassingFactForCall, primitiveSummary, packageJson, csharpTestExtensions, csharpProviderContext, csharpSourceProfileFiles, csharpJsSourceProfileFiles, createAttributeProviderExtension } from "./source-semantics.helpers.mjs";

test("source-semantics records nested object rest facts from TSTS-checked rest binding types", () => {
  const sourceText = `
    export type Address = {
      city: string;
      zip: string;
      country: string;
    };

    export type User = {
      name: string;
      address: Address;
    };

    export function describe(input: User): string {
      const { address: { city, ...restAddress } } = input;
      return city + restAddress.zip + restAddress.country;
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
  const restBindingName = collectIdentifiersByText(sourceFile, session.ast, "restAddress")
    .find((node) => session.ast.kindName(session.ast.parent(node)) === "KindBindingElement");
  assert.ok(restBindingName);
  const restShape = extensionHost.facts.get(restBindingName, csharpObjectShapeFactKey);
  const runtimeCarrier = extensionHost.facts.get(restBindingName, runtimeCarrierFactKey)?.carrier;

  assert.deepEqual(restShape?.members.map((member) => member.sourceName).sort(), ["country", "zip"]);
  assert.equal(restShape?.members.some((member) => member.sourceName === "city"), false);
  assert.equal(runtimeCarrier?.kind, "target-named");
  assert.equal(runtimeCarrier?.id, restShape?.targetType.id);
});
test("source-semantics records array boundary facts for destructured rest bindings before later length access", () => {
  const sourceText = `
    export function tailLength(values: number[]): number {
      const [, ...tail] = values;
      return tail.length;
    }
  `;
  const context = {
    ...csharpProviderContext(),
    selectedSurfaces: [{ id: "js" }],
  };
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ...csharpJsSourceProfileFiles().map((file) => [file.path, file.text]),
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
        createCsharpSourceSemanticsExtension(context),
        createCsharpTargetSemanticsExtension(context),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const tailBinding = collectIdentifiersByText(sourceFile, session.ast, "tail")
    .find((node) => session.ast.kindName(session.ast.parent(node)) === "KindBindingElement");
  assert.ok(tailBinding);
  const tailReceiver = collectIdentifiersByText(sourceFile, session.ast, "tail")
    .find((node) => session.ast.kindName(session.ast.parent(node)) === "KindPropertyAccessExpression");
  assert.ok(tailReceiver);
  const boundary = extensionHost.facts.get(tailBinding, csharpArrayBoundaryFactKey);
  const propertyAccess = session.ast.parent(tailReceiver);
  const operation = extensionHost.facts.get(propertyAccess, targetOperationFactKey);
  const csharpOperation = extensionHost.facts.get(propertyAccess, csharpTargetOperationFactKey);

  assert.equal(boundary?.publicShape, "IReadOnlyList<T>");
  assert.equal(boundary.coreCarrierLane, "native-read-indexable");
  assert.equal(operation?.operationKind, "property");
  assert.equal(operation.targetOperation, "length");
  assert.equal(csharpOperation?.memberName, "Count");
});