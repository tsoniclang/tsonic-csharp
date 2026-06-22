import {
  AsObjectLiteralExpression,
  HasSourceKind,
  KindObjectLiteralExpression,
} from "./source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
} from "../roslyn/syntax.js";
import {
  isCsharpRecordDictionaryTargetType,
} from "../../source/csharp-source-semantics/dictionaries.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  invalidExpression,
} from "./invalid-expression.js";
import {
  getTargetTypeRefForNode,
} from "./runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";

export function tryPlanRecordDictionaryLiteralWithExpectedType(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  expectedTypeSubject: Node | undefined,
): CsharpExpression | undefined {
  if (!HasSourceKind(input.ast, node, KindObjectLiteralExpression)) {
    return undefined;
  }
  const dictionaryType = getExpectedRecordDictionaryTargetType(node, expectedTypeSubject, sourceFile, input);
  if (dictionaryType === undefined) {
    return undefined;
  }
  const properties = (AsObjectLiteralExpression(node)!.Properties?.Nodes ?? [])
    .filter((property): property is Node => property !== undefined);
  if (properties.length > 0) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Record dictionary object literal emission currently requires an empty object literal; add entries through provider-owned Dictionary indexer mutation."));
    return invalidExpression("non-empty Record dictionary object literal");
  }
  const type = csharpTypeFromTargetTypeRef(dictionaryType);
  if (type === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Record dictionary object literal emission requires a renderable provider-owned Dictionary target type."));
    return invalidExpression("unrenderable Record dictionary target type");
  }
  return {
    kind: "ObjectCreationExpression",
    type,
    arguments: [],
  };
}

function getExpectedRecordDictionaryTargetType(
  node: Node,
  expectedTypeSubject: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
) {
  const expectedType = getTargetTypeRefForNode(input, expectedTypeSubject, sourceFile);
  if (isCsharpRecordDictionaryTargetType(expectedType)) {
    return expectedType;
  }
  const contextualType = getTargetTypeRefForNode(input, node, sourceFile);
  return isCsharpRecordDictionaryTargetType(contextualType) ? contextualType : undefined;
}
