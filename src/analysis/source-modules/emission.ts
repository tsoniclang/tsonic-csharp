import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpClassFactory, CsharpClassFactoryIndex } from "../../target-model/records/class-factories.js";
import type { CsharpSourceFileRecords } from "../../target-model/records/source-files.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpAdmittedIteration } from "../../target-model/records/selection.js";
import { createCsharpSourceFileEmissionRecords } from "../program/records/source-file-emission.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpModuleCallableEmission } from "../../target-model/records/source-file-emission.js";
import type { CsharpModuleInitializationIndex } from "../../target-model/records/module-initialization.js";
import type { CsharpExpectedTypeClassifications } from "../../target-model/records/expected-types.js";
import type { CsharpCallableDeclarationRecords } from "../../target-model/records/callable-emission.js";
import type { CsharpNamePlan } from "../../target-model/names/model.js";
import { getCsharpLambdaSignature, getCsharpTaskResultTargetType, isCsharpVoidTargetType } from "../../target-model/types/index.js";

const moduleStatements = new Set([
  "KindImportDeclaration", "KindTypeAliasDeclaration", "KindExportDeclaration", "KindExportAssignment",
  "KindInterfaceDeclaration", "KindEnumDeclaration", "KindFunctionDeclaration", "KindClassDeclaration",
  "KindVariableStatement", "KindExpressionStatement", "KindIfStatement", "KindWhileStatement", "KindDoStatement",
  "KindForStatement", "KindForOfStatement", "KindReturnStatement", "KindThrowStatement", "KindSwitchStatement",
  "KindTryStatement", "KindDebuggerStatement", "KindLabeledStatement",
]);

export function analyzeCsharpSourceFileEmission(input: {
  readonly source: TargetSourceProgram;
  readonly identities: CsharpSourceFileRecords;
  readonly factories: CsharpClassFactoryIndex;
  readonly evidence: CsharpSourceEvidenceIndex;
  readonly operations: CsharpTargetOperationClassifications<CsharpAdmittedIteration>;
  readonly moduleInitialization: CsharpModuleInitializationIndex;
  readonly expectedTypes: CsharpExpectedTypeClassifications;
  readonly declarations: CsharpCallableDeclarationRecords;
  readonly names: CsharpNamePlan;
}) {
  const factories = new Map<SourceFile, readonly CsharpClassFactory[]>();
  const callables = new Map<Node, CsharpModuleCallableEmission>();
  const issues: TargetDiagnostic[] = [];
  const refuse = (node: Node, message: string): void => {
    issues.push(Object.freeze({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message }));
  };
  for (const file of input.source.sourceFiles) {
    factories.set(file, Object.freeze(input.factories.factories.filter(factory => factory.sourceFile === file)));
    if (file.IsDeclarationFile || input.identities.providerSourceFile.get(file) === true) continue;
    for (const statement of input.source.ast.statements(file)) {
      if (statement === undefined || input.evidence.compileTimeMetadata.get(statement) || input.operations.erasedStatement.get(statement)) continue;
      if (!moduleStatements.has(input.source.ast.kindName(statement))) {
        refuse(statement, "Top-level statement is outside the current C# planning surface.");
        continue;
      }
      if (input.source.ast.is.IsVariableStatement(statement)) {
        const list = input.source.ast.as.AsVariableStatement(statement)?.DeclarationList;
        if (list === undefined) refuse(statement, "Top-level variable statement requires a TSTS variable declaration list.");
        else if (input.source.ast.variableDeclarationKind(list) === undefined)
          refuse(statement, "Top-level variable statement requires an exact TSTS variable declaration kind.");
        if (list !== undefined) for (const node of input.source.ast.children(list)) {
          if (node === undefined || !input.source.ast.is.IsVariableDeclaration(node) || input.evidence.compileTimeMetadata.get(node)) continue;
          const visibility = input.moduleInitialization.callableVisibility.get(node);
          if (visibility === undefined) continue;
          const initializer = input.source.ast.as.AsVariableDeclaration(node)?.Initializer;
          const carrier = initializer === undefined ? undefined : input.expectedTypes.callableTarget.get(initializer);
          const form = initializer === undefined ? undefined : input.source.ast.is.IsArrowFunction(initializer) ? "arrow"
            : input.source.ast.is.IsFunctionExpression(initializer) ? "function" : undefined;
          const signature = getCsharpLambdaSignature(carrier);
          if (initializer === undefined || carrier === undefined || form === undefined || signature?.returnType === undefined) {
            refuse(node, "Direct callable planning requires its sealed implementation signature.");
            continue;
          }
          const declaration = input.declarations.callableDeclaration.get(initializer);
          if (declaration === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted module callable requires its finalized declaration contract.", node);
          const name = input.names.resolve(input.source.ast.name(node));
          if (name.kind !== "resolved") failTargetAnalysisInvariant("tsonic-csharp", "An admitted module callable requires its sealed native binding name.", node);
          const result = declaration.async ? getCsharpTaskResultTargetType(signature.returnType) : signature.returnType;
          if (result === undefined) {
            refuse(node, "Direct callable planning requires its sealed lambda signature and body.");
            continue;
          }
          callables.set(node, Object.freeze({ declaration: node, initializer, name: name.name, visibility, carrier,
            parameters: Object.freeze(signature.parameters), returnCarrier: signature.returnType,
            returnMode: isCsharpVoidTargetType(result) ? "void" : "value", async: declaration.async, form }));
        }
      }
      if (!input.source.ast.is.IsExportAssignment(statement)) continue;
      const assignment = input.source.ast.as.AsExportAssignment(statement);
      if (assignment?.IsExportEquals) refuse(statement, "Export equals requires finalized TSTS CommonJS module-export facts before C# emission.");
      else if (assignment?.Expression === undefined) refuse(statement, "Default export assignment must have an expression.");
    }
  }
  return Object.freeze({ records: createCsharpSourceFileEmissionRecords(factories, callables), issues: Object.freeze(issues) });
}
