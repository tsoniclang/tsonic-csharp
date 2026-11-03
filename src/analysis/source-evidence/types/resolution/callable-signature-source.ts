import type { AstReader, Type } from "@tsonic/tsts";
import type { SourceCallableTypeEvidence, SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpCallableSignatureParameterSource,
  CsharpCallableSignatureSource, CsharpCallableDeclarationEvidence,
  CsharpCallableTypeSource } from "../../../../target-model/records/types/callable-source.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { formCsharpCallableDeclaration } from "./callable-type-parameters.js";

export function formCsharpCallableTypeSource(
  ast: AstReader,
  type: Type,
  queries: SourceFileSemantics,
): CsharpCallableTypeSource {
  const callable = queries.types.callable(type);
  if (callable === undefined || queries.types.propertyInfos(type).length !== 0 ||
    queries.types.indexInfos(type).length !== 0 || queries.types.constructSignatures(type).length !== 0) {
    return Object.freeze({ kind: "not-callable", type, queries });
  }
  return Object.freeze({ kind: "callable", type, queries,
    signature: formCsharpCallableSignatureSource(ast, callable, queries,
      formCsharpCallableDeclaration(callable.result.declaration, queries.sourceFile, ast)),
  });
}

export function formCsharpCallableSignatureSource(
  ast: AstReader,
  callable: SourceCallableTypeEvidence,
  queries: SourceFileSemantics,
  declaration: CsharpCallableDeclarationEvidence | undefined,
): CsharpCallableSignatureSource {
  if (declaration !== undefined && (declaration.declaration !== callable.result.declaration ||
      declaration.sourceFile !== queries.sourceFile)) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "Callable signature Source requires its exact checked declaration input.", callable.result.declaration);
  }
  const parameters: CsharpCallableSignatureParameterSource[] = [];
  const expanded = new Set<SourceCallableTypeEvidence["parameters"][number]["sourceSymbol"]>();
  for (const [index, selected] of callable.parameters.entries()) {
    if (expanded.has(selected.sourceSymbol)) continue;
    let parameter = selected;
    const group = parameter.sourceSymbol === undefined ? []
      : callable.parameters.filter(candidate => candidate.sourceSymbol === parameter.sourceSymbol);
    if (group.length > 0) {
      const declaration = queries.declarations.primarySymbolDeclaration(parameter.sourceSymbol);
      const rest = declaration !== undefined && ast.is.IsParameterDeclaration(declaration) &&
        ast.as.AsParameterDeclaration(declaration)?.DotDotDotToken !== undefined;
      const syntax = declaration === undefined ? undefined : ast.typeNode(declaration);
      const sourceType = !rest || declaration === undefined ? undefined : syntax === undefined
        ? queries.declarations.declaredValueType(declaration) : queries.types.authoredType(syntax);
      if (sourceType !== undefined && queries.types.isTuple(sourceType) &&
        queries.types.tupleElementInfos(sourceType).length === group.length) {
        expanded.add(parameter.sourceSymbol);
        parameter = { ...parameter, declaration: declaration!, type: sourceType, parameterKind: "rest", omissionKind: "rest" };
      }
    }
    parameters.push(Object.freeze({ index, selected, parameter,
      tupleElements: parameter.parameterKind === "rest" ? queries.types.tupleElementInfos(parameter.type) : undefined,
    }));
  }
  return Object.freeze({ callable, queries, parameters: Object.freeze(parameters), declaration });
}
