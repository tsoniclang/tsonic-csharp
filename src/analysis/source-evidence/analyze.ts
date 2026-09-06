import type {
  Node,
  ResolvedSourceGeneratorInfo,
  ResolvedSourceWellKnownSymbolInfo,
  ResolvedSourceYieldInfo,
  SourceFile,
  Type,
  Signature,
} from "@tsonic/tsts";
import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  TargetSourceProgram,
} from "@tsonic/target-api/source";
import type {
  CsharpTypePolicy,
} from "../../policy/types/index.js";
import {
  combineCsharpTargetUnionMembers,
  isCsharpJsValueTargetType,
  isTypeParameterTargetRef,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../policy/types/index.js";
import {
  csharpTargetTypeComponents,
} from "../../policy/types/model/target-type-components.js";
import type { CsharpPolicyContext } from "../../policy/context.js";
import type {
  TargetTypeRef,
} from "../../target-model/types/model.js";
import type {
  CsharpSemanticTypeClassification,
  CsharpContextualTupleClassification,
  CsharpSourceEvidenceIndex,
} from "./model.js";
import {
  resolveCsharpTypeParameterConstraints,
} from "../../policy/constraints/index.js";
import type {
  CsharpTypeParameterConstraintResolution,
} from "../../policy/constraints/index.js";
import {
  selectCsharpFlowReadConversion,
} from "../../policy/conversions/index.js";
import {
  selectCsharpSourceArgument,
} from "../../policy/members/index.js";
import {
  readCsharpSourceDefaultValue,
  readCsharpSourceField,
  readCsharpSourceStruct,
} from "../../policy/types/index.js";

const missing = Symbol("csharp.source-evidence.missing");
import { createTsonicMemoryMetadataIndex } from "@tsonic/source-core/facts";
type Cached<Value> = Value | typeof missing;

export function analyzeCsharpSourceEvidence(
  source: TargetSourceProgram,
  sourceFiles: readonly SourceFile[],
  types: CsharpTypePolicy,
  policy: CsharpPolicyContext,
): CsharpSourceEvidenceIndex {
  const memoryMetadata = createTsonicMemoryMetadataIndex(source);
  const compileTimeMetadata = new WeakSet<Node>();
  const memoryMetadataIssues: { readonly node: Node; readonly code: string; readonly message: string }[] = [];
  const expressionTypes = new WeakMap<Node, Cached<Type>>();
  const nodeTargetTypes = new WeakMap<Node, Cached<TargetTypeRef>>();
  const storageTargetTypes = new WeakMap<Node, Cached<TargetTypeRef>>();
  const readStorageTargetTypes = new WeakMap<Node, Cached<TargetTypeRef>>();
  const contextualTypes = new WeakMap<Node, Cached<Type>>();
  const contextualTargetTypes = new WeakMap<Node, Cached<TargetTypeRef>>();
  const constants = new WeakMap<Node, { readonly value: unknown }>();
  const refinements = new WeakMap<Node, import("./model.js").CsharpValueRefinementClassification>();
  const generators = new WeakMap<Node, Cached<ResolvedSourceGeneratorInfo>>();
  const generatorTargetTypes = new WeakMap<Node, Cached<TargetTypeRef>>();
  const yields = new WeakMap<Node, Cached<ResolvedSourceYieldInfo>>();
  const yieldTargetTypes = new WeakMap<Node, Cached<TargetTypeRef>>();
  const wellKnownSymbols = new WeakMap<
    Node,
    Cached<ResolvedSourceWellKnownSymbolInfo>
  >();
  const inferredReturns = new WeakMap<Node, Cached<TargetTypeRef>>();
  const arguments_ = new WeakMap<
    Node,
    import("./model.js").CsharpSourceArgumentClassification
  >();
  const defaultValues = new WeakMap<
    Node,
    import("../../policy/types/index.js").CsharpSourceDefaultValue
  >();
  const sourceFields = new WeakMap<
    Node,
    import("../../policy/types/index.js").CsharpSourceField
  >();
  const sourceStructs = new WeakMap<
    Node,
    import("../../policy/types/index.js").CsharpSourceStruct
  >();
  const providerVirtualDeclarations = new WeakSet<Node>();
  const semanticTypes = new WeakMap<Type, Map<SourceFile, CsharpSemanticTypeClassification>>();
  const signatureDeclarations = new WeakMap<Signature, Cached<Node>>();
  const contextualTuples = new WeakMap<Node, CsharpContextualTupleClassification>();
  const typeParameterConstraints = new WeakMap<
    Node,
    CsharpTypeParameterConstraintResolution
  >();
  const sourceOwnedProjectShapes = new WeakMap<Node, boolean>();
  const targetTypes = new Map<string, TargetTypeRef>();

  const recordTargetType = (
    type: TargetTypeRef | undefined,
  ): TargetTypeRef | undefined => {
    if (type === undefined) {
      return undefined;
    }
    const key = targetTypeRefKey(type);
    if (targetTypes.has(key)) {
      return type;
    }
    targetTypes.set(key, type);
    for (const component of csharpTargetTypeComponents(type)) {
      recordTargetType(component);
    }
    return type;
  };

  const classifyType = (
    type: Type,
    sourceFile: SourceFile,
  ): CsharpSemanticTypeClassification => {
    let bySourceFile = semanticTypes.get(type);
    const cached = bySourceFile?.get(sourceFile);
    if (cached !== undefined) {
      return cached;
    }
    const semantics = source.semantics.forFile(sourceFile);
    const intrinsic: CsharpSemanticTypeClassification["intrinsic"] =
      semantics.types.isAny(type)
        ? "any"
        : semantics.types.isUnknown(type)
          ? "unknown"
          : semantics.types.isBooleanLike(type)
            ? "boolean"
            : semantics.types.isNumberLike(type)
              ? "number"
              : semantics.types.isStringLike(type)
                ? "string"
                : semantics.types.isBigIntLike(type)
                  ? "bigint"
                  : semantics.types.isVoidLike(type)
                    ? "void"
                    : "other";
    const targetType = recordTargetType(types.resolveType(type, sourceFile));
    const symbol = semantics.declarations.typeSymbol(type);
    const typeParameterName = symbol !== undefined &&
        semantics.declarations.symbolDeclarations(symbol).some((declaration) =>
          source.ast.is.IsTypeParameterDeclaration(declaration))
      ? semantics.declarations.symbolName(symbol)
      : undefined;
    const classification = Object.freeze({
      intrinsic,
      nullish: semantics.types.isNullish(type),
      ...(targetType === undefined ? {} : { targetType }),
      ...(typeParameterName === undefined ? {} : { typeParameterName }),
    });
    bySourceFile ??= new Map();
    bySourceFile.set(sourceFile, classification);
    semanticTypes.set(type, bySourceFile);
    return classification;
  };

  for (const sourceFile of sourceFiles) {
    visit(sourceFile, sourceFile);
  }

  function visit(node: Node, sourceFile: SourceFile): void {
    const declaration = memoryMetadata.declaration(node);
    if (declaration !== undefined || memoryMetadata.isCompileTimeExpression(node)) {
      compileTimeMetadata.add(node);
      for (const issue of declaration?.issues ?? []) memoryMetadataIssues.push(Object.freeze({
        node: issue.node, code: "CSHARP_MEMORY_METADATA_RUNTIME_ESCAPE", message: issue.reason,
      }));
      return;
    }
    if (
      node === sourceFile ||
      source.ast.is.IsImportDeclaration(node) ||
      source.ast.is.IsImportClause(node) ||
      source.ast.kindName(node) === "KindEndOfFile"
    ) {
      source.ast.forEachChild(node, (child) => {
        if (child !== undefined) {
          visit(child, sourceFile);
        }
      });
      return;
    }
    const semantics = source.semantics.forFile(sourceFile);
    arguments_.set(
      node,
      freezeSourceArgumentClassification(
        selectCsharpSourceArgument(source.sourceFacts, node),
      ),
    );
    const defaultValue = readCsharpSourceDefaultValue(source.sourceFacts, node);
    if (defaultValue !== undefined) defaultValues.set(node, defaultValue);
    const sourceField = readCsharpSourceField(source.sourceFacts, [node]);
    if (sourceField !== undefined) sourceFields.set(node, sourceField);
    const sourceStruct = readCsharpSourceStruct(source.sourceFacts, node);
    if (sourceStruct !== undefined) sourceStructs.set(node, sourceStruct);
    if (
      source.sourceFacts?.getFact(node, providerVirtualDeclarationFactKey) !==
        undefined
    ) {
      providerVirtualDeclarations.add(node);
    }
    nodeTargetTypes.set(
      node,
      recordTargetType(types.resolveNode(node, sourceFile)) ?? missing,
    );
    const nodeTargetType = cachedValue(nodeTargetTypes.get(node));
    sourceOwnedProjectShapes.set(
      node,
      !isCsharpJsValueTargetType(nodeTargetType) &&
        (
          isTypeParameterTargetRef(nodeTargetType) ||
          source.navigation.isProjectShape(node)
        ),
    );
    storageTargetTypes.set(
      node,
      recordTargetType(types.resolveStorage(node, sourceFile)) ?? missing,
    );
    readStorageTargetTypes.set(
      node,
      recordTargetType(types.resolveReadStorage(node, sourceFile)) ?? missing,
    );
    const expressionType = semantics.types.expressionType(node);
    expressionTypes.set(node, expressionType ?? missing);
    if (expressionType !== undefined) {
      classifyType(expressionType, sourceFile);
    }
    const contextualType = semantics.types.contextualType(node);
    contextualTypes.set(node, contextualType ?? missing);
    contextualTargetTypes.set(
      node,
      contextualType === undefined
        ? missing
        : classifyType(contextualType, sourceFile).targetType ?? missing,
    );
    const constantValue = semantics.types.constantValue(node);
    if (constantValue !== undefined) {
      constants.set(node, Object.freeze({ value: constantValue }));
    }
    const refinement = isCsharpFlowReadEvidenceNode(source.ast, node)
      ? source.semantics.selectValueTypeRefinement(node)
      : { kind: "not-project-reference" as const };
    if (refinement.kind === "resolved") {
      classifyType(refinement.selectedType, sourceFile);
      if (refinement.refinement.kind === "members") {
        refinement.refinement.types.forEach((member) =>
          classifyType(member, sourceFile));
      }
    }
    const selectedTargetType = refinement.kind === "resolved"
      ? recordTargetType(
          refinement.refinement.kind === "unrelated"
            ? types.resolveType(refinement.selectedType, sourceFile)
            : types.resolveSelectedValue(
                node,
                refinement.selectedType,
                sourceFile,
              ),
        )
      : undefined;
    const memberTargetTypes = refinement.kind === "resolved" &&
        refinement.refinement.kind === "members"
      ? refinement.refinement.types.map((member) =>
          recordTargetType(types.resolveType(member, sourceFile)))
      : undefined;
    const readStorageTargetType = cachedValue(readStorageTargetTypes.get(node));
    const declaredTargetType = refinement.kind === "resolved" &&
        refinement.refinement.kind === "unrelated"
      ? recordTargetType(types.resolveType(refinement.declaredType, sourceFile))
      : undefined;
    const unrelatedSourceTypesShareTargetRepresentation =
      refinement.kind === "resolved" &&
      refinement.refinement.kind === "unrelated" &&
      declaredTargetType !== undefined &&
      selectedTargetType !== undefined &&
      targetTypeRefEquals(declaredTargetType, selectedTargetType);
    const flowReadTargetType = unrelatedSourceTypesShareTargetRepresentation &&
        readStorageTargetType !== undefined
      ? readStorageTargetType
      : selectedTargetType !== undefined &&
          readStorageTargetType !== undefined &&
          !targetTypeRefEquals(readStorageTargetType, selectedTargetType)
        ? selectedTargetType
        : memberTargetTypes === undefined ||
            memberTargetTypes.some((member) => member === undefined)
          ? selectedTargetType
          : recordTargetType(combineCsharpTargetUnionMembers(
              memberTargetTypes as readonly TargetTypeRef[],
            ));
    const flowReadConversion = flowReadTargetType === undefined ||
        readStorageTargetType === undefined
      ? undefined
      : selectCsharpFlowReadConversion(
          policy,
          readStorageTargetType,
          flowReadTargetType,
        );
    refinements.set(node, Object.freeze({
      source: refinement,
      ...(selectedTargetType === undefined ? {} : { selectedTargetType }),
      ...(memberTargetTypes === undefined
        ? {}
        : { memberTargetTypes: Object.freeze(memberTargetTypes) }),
      ...(flowReadConversion === undefined ? {} : { flowReadConversion }),
      ...(flowReadTargetType === undefined ? {} : { flowReadTargetType }),
    }));
    const generator = semantics.operations.generator(node);
    generators.set(node, generator ?? missing);
    generatorTargetTypes.set(
      node,
      generator === undefined
        ? missing
        : recordTargetType(types.resolveSelectedType(
            source.ast.typeNode(generator.declaration),
            generator.sourceReturnType,
            sourceFile,
          )) ?? missing,
    );
    const yieldEvidence = semantics.operations.yield(node);
    yields.set(node, yieldEvidence ?? missing);
    yieldTargetTypes.set(
      node,
      yieldEvidence === undefined
        ? missing
        : recordTargetType(types.resolveSelectedValue(
            yieldEvidence.operand?.expression ?? node,
            yieldEvidence.operand?.type ?? yieldEvidence.sourceYieldType,
            sourceFile,
          )) ?? missing,
    );
    const wellKnownSymbol = semantics.operations.wellKnownSymbol(node);
    wellKnownSymbols.set(node, wellKnownSymbol ?? missing);
    const call = semantics.operations.call(node);
    if (call !== undefined) {
      signatureDeclarations.set(
        call.selectedSignature,
        semantics.declarations.signatureDeclaration(call.selectedSignature) ?? missing,
      );
    }
    if (source.ast.is.IsArrayLiteralExpression(node)) {
      const elementCount = source.ast.elements(node).length;
      const contextual = semantics.types.contextualTupleSelection(
        node,
        elementCount,
      );
      contextualTuples.set(
        node,
        contextual.kind === "unavailable"
          ? Object.freeze({ kind: "unavailable" })
          : Object.freeze({
              kind: "selected",
              elementTypes: Object.freeze(contextual.elements.map((element) =>
                recordTargetType(types.resolveSelectedType(
                  element.declaration === undefined
                    ? undefined
                    : source.ast.typeNode(element.declaration),
                  element.type,
                  sourceFile,
                )))),
              optionalElementIndexes: Object.freeze(contextual.elements.flatMap(
                (element, index) => element.elementKind === "optional" ? [index] : [],
              )),
              omittedOptionalElementIndexes: Object.freeze([
                ...contextual.omittedOptionalElementIndexes,
              ]),
            }),
      );
    }
    inferredReturns.set(
      node,
      recordTargetType(
        inferCallableReturnType(node, sourceFile, source, types),
      ) ?? missing,
    );
    if (source.ast.is.IsTypeParameterDeclaration(node)) {
      const name = source.ast.name(node);
      if (name !== undefined) {
        typeParameterConstraints.set(
          node,
          resolveCsharpTypeParameterConstraints(
            node,
            source.ast.text(name),
            sourceFile,
            { ast: source.ast, types },
          ),
        );
      }
    }
    source.ast.forEachChild(node, (child) => {
      if (child !== undefined) {
        visit(child, sourceFile);
      }
    });
  }

  const index: CsharpSourceEvidenceIndex = {
    memoryMetadataIssues: Object.freeze(memoryMetadataIssues),
    isCompileTimeMetadata: node => compileTimeMetadata.has(node),
    targetTypes: Object.freeze([...targetTypes.values()]),
    nodeTargetType(node) {
      return cachedValue(nodeTargetTypes.get(node));
    },
    storageTargetType(node) {
      return cachedValue(storageTargetTypes.get(node));
    },
    readStorageTargetType(node) {
      return cachedValue(readStorageTargetTypes.get(node));
    },
    expressionType(node) {
      return cachedValue(expressionTypes.get(node));
    },
    contextualType(node) {
      return cachedValue(contextualTypes.get(node));
    },
    contextualTargetType(node) {
      return cachedValue(contextualTargetTypes.get(node));
    },
    targetType(type, sourceFile) {
      return semanticTypes.get(type)?.get(sourceFile)?.targetType;
    },
    semanticType(type, sourceFile) {
      return semanticTypes.get(type)?.get(sourceFile);
    },
    signatureDeclaration(signature) {
      return cachedValue(signatureDeclarations.get(signature));
    },
    contextualTuple(node) {
      return contextualTuples.get(node);
    },
    constantValue(node) {
      return constants.get(node);
    },
    valueRefinement(node) {
      return refinements.get(node);
    },
    generator(node) {
      return cachedValue(generators.get(node));
    },
    generatorTargetType(node) {
      return cachedValue(generatorTargetTypes.get(node));
    },
    yield(node) {
      return cachedValue(yields.get(node));
    },
    yieldTargetType(node) {
      return cachedValue(yieldTargetTypes.get(node));
    },
    wellKnownSymbol(node) {
      return cachedValue(wellKnownSymbols.get(node));
    },
    inferredCallableReturnType(node) {
      return cachedValue(inferredReturns.get(node));
    },
    argument(node) {
      return arguments_.get(node);
    },
    defaultValue(node) {
      return defaultValues.get(node);
    },
    sourceField(subjects) {
      for (const subject of subjects) {
        if (subject === undefined) continue;
        const field = sourceFields.get(subject);
        if (field !== undefined) return field;
      }
      return undefined;
    },
    sourceStruct(node) {
      return sourceStructs.get(node);
    },
    providerVirtualDeclaration(node) {
      return providerVirtualDeclarations.has(node);
    },
    typeParameterConstraints(node) {
      return typeParameterConstraints.get(node);
    },
    sourceOwnedProjectShape(node) {
      return sourceOwnedProjectShapes.get(node);
    },
  };
  return Object.freeze(index);
}

function isCsharpFlowReadEvidenceNode(
  ast: import("@tsonic/tsts").AstReader,
  node: Node,
): boolean {
  return ast.is.IsIdentifier(node) ||
    ast.is.IsPropertyAccessExpression(node) ||
    ast.is.IsElementAccessExpression(node);
}

function inferCallableReturnType(
  declaration: Node,
  sourceFile: SourceFile,
  source: TargetSourceProgram,
  types: CsharpTypePolicy,
): TargetTypeRef | undefined {
  const semantics = source.semantics.forFile(sourceFile);
  const declarationType = semantics.types.expressionType(declaration);
  if (declarationType === undefined) {
    return undefined;
  }
  const signatures = semantics.types.callSignatures(declarationType)
    .filter((signature) =>
      semantics.declarations.signatureDeclaration(signature) === declaration);
  return signatures.length === 1
    ? types.resolveType(semantics.types.returnType(signatures[0]!), sourceFile)
    : undefined;
}

function cachedValue<Value>(value: Cached<Value> | undefined): Value | undefined {
  return value === undefined || value === missing ? undefined : value;
}

function freezeSourceArgumentClassification(
  value: import("./model.js").CsharpSourceArgumentClassification,
): import("./model.js").CsharpSourceArgumentClassification {
  return value.kind === "resolved"
    ? Object.freeze({
        kind: "resolved",
        argument: Object.freeze({
          passingMode: value.argument.passingMode,
          storageExpression: value.argument.storageExpression,
        }),
      })
    : Object.freeze({
        kind: "rejected",
        reason: value.reason,
      });
}
