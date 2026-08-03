using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    object? TypeRef(
        Type type,
        bool requireDelegateSourceShape = true,
        GenericParameterContext? genericParameters = null,
        NullabilityInfo? typeNullability = null,
        NullableMetadata? typeNullabilityMetadata = null,
        GenericNullabilityContext? genericNullability = null,
        bool includeTopLevelReferenceNullability = true)
    {
        genericParameters ??= GenericParameterContext.Empty;
        genericNullability ??= GenericNullabilityContext.Empty;
        type = UnwrapByRef(type);
        typeNullability = genericNullability.Resolve(type, typeNullability);
        typeNullabilityMetadata = genericNullability.ResolveMetadata(type, typeNullabilityMetadata);
        if (IsDelegate(type) && delegateSourceShapeInProgress.Contains(TargetId(type)))
        {
            return null;
        }
        if (IsRuntimeType(type, typeof(void)))
        {
            return new { kind = "void" };
        }
        var primitive = SourcePrimitiveName(type);
        if (primitive is not null)
        {
            return new { kind = "source-primitive", name = primitive };
        }
        if (IsRuntimeType(type, typeof(string)))
        {
            return ReferenceNullabilityTypeRef(type, typeNullability, typeNullabilityMetadata, new { kind = "string" }, includeTopLevelReferenceNullability);
        }
        if (IsRuntimeType(type, typeof(object)))
        {
            return ReferenceNullabilityTypeRef(type, typeNullability, typeNullabilityMetadata, new { kind = "object" }, includeTopLevelReferenceNullability);
        }
        if (type.IsGenericParameter)
        {
            if (genericParameters.TryGetSubstitution(type, out var substitution) && substitution != type)
            {
                return TypeRef(
                    substitution,
                    requireDelegateSourceShape,
                    genericParameters,
                    typeNullability,
                    typeNullabilityMetadata,
                    genericNullability,
                    includeTopLevelReferenceNullability);
            }
            if (genericParameters.IsOmitted(type))
            {
                return null;
            }
            return ReferenceNullabilityTypeRef(
                type,
                typeNullability,
                typeNullabilityMetadata,
                new { kind = "type-parameter", name = genericParameters.SourceName(type) },
                includeTopLevelReferenceNullability);
        }
        if (type.IsArray)
        {
            if (!type.IsSZArray)
            {
                return null;
            }
            var elementType = TypeRef(
                type.GetElementType()!,
                requireDelegateSourceShape,
                genericParameters,
                typeNullability?.ElementType,
                typeNullabilityMetadata?.ElementType,
                genericNullability);
            return elementType is null
                ? null
                : ReferenceNullabilityTypeRef(
                    type,
                    typeNullability,
                    typeNullabilityMetadata,
                    new { kind = "array", elementType },
                    includeTopLevelReferenceNullability);
        }
        if (IsNullableShape(type, out var nullableElement))
        {
            var elementType = TypeRef(
                nullableElement,
                requireDelegateSourceShape,
                genericParameters,
                GenericArgumentNullability(typeNullability, 0),
                GenericArgumentNullabilityMetadata(typeNullabilityMetadata, 0),
                genericNullability);
            return elementType is null
                ? null
                : new { kind = "nullable", elementType };
        }
        if (type.IsPointer)
        {
            return null;
        }
        var definition = type.IsGenericType ? type.GetGenericTypeDefinition() : type;
        var typeArguments = type.IsGenericType
            ? type.GetGenericArguments().Select((typeArgument, index) => TypeRef(
                typeArgument,
                requireDelegateSourceShape,
                genericParameters,
                GenericArgumentNullability(typeNullability, index),
                GenericArgumentNullabilityMetadata(typeNullabilityMetadata, index),
                genericNullability)).ToArray()
            : Array.Empty<object?>();
        if (typeArguments.Any(argument => argument is null))
        {
            return null;
        }

        var sourceShape = SourceShape(type, genericParameters, typeNullability, typeNullabilityMetadata, genericNullability);
        if (IsDelegate(type) && sourceShape is null && requireDelegateSourceShape)
        {
            return null;
        }
        var namedType = new
        {
            kind = "named",
            targetId = TargetId(definition),
            metadataName = MetadataName(definition),
            displayName = DisplayName(definition),
            renderShape = RenderShape(definition),
            typeArguments = typeArguments.Length == 0 ? null : typeArguments,
            sourceShape,
            implicitArrayInput = IsEnumerableShape(type, out _) ? true : (bool?)null,
        };
        return ReferenceNullabilityTypeRef(type, typeNullability, typeNullabilityMetadata, namedType, includeTopLevelReferenceNullability);
    }

    string TypeRefFailureReason(Type type)
    {
        type = UnwrapByRef(type);
        if (IsDelegate(type))
        {
            var targetId = TargetId(type);
            return delegateSourceShapeInProgress.Contains(targetId)
                ? $"Recursive delegate type '{TypeMetadataName(type)}' cannot be represented as a closed source function shape."
                : delegateSourceShapeUnsupportedReasons.TryGetValue(targetId, out var reason)
                    ? reason
                    : $"Delegate type '{TypeMetadataName(type)}' cannot be represented as a closed source function shape.";
        }
        if (type.IsPointer)
        {
            return $"Pointer type '{TypeMetadataName(type)}' requires an explicit provider pointer type model before it can be exposed safely.";
        }
        if (type.IsArray)
        {
            if (!type.IsSZArray)
            {
                return $"ranked CLR array type '{TypeMetadataName(type)}' requires an explicit provider ranked-array source model before it can be exposed safely.";
            }
            var elementType = type.GetElementType()!;
            return $"Array element type '{TypeMetadataName(elementType)}' is not representable. {TypeRefFailureReason(elementType)}";
        }
        if (IsNullableShape(type, out var nullableElement))
        {
            return $"Nullable element type '{TypeMetadataName(nullableElement)}' is not representable. {TypeRefFailureReason(nullableElement)}";
        }
        if (type.IsGenericType && !type.IsGenericTypeDefinition)
        {
            var unsupportedArgument = type.GetGenericArguments()
                .FirstOrDefault(argument => TypeRef(argument) is null);
            if (unsupportedArgument is not null)
            {
                return $"Generic type argument '{TypeMetadataName(unsupportedArgument)}' is not representable. {TypeRefFailureReason(unsupportedArgument)}";
            }
        }
        return $"Type '{TypeMetadataName(type)}' is outside the supported provider type-ref model.";
    }

    object? SourceShape(
        Type type,
        GenericParameterContext? genericParameters = null,
        NullabilityInfo? typeNullability = null,
        NullableMetadata? typeNullabilityMetadata = null,
        GenericNullabilityContext? genericNullability = null)
    {
        genericParameters ??= GenericParameterContext.Empty;
        genericNullability ??= GenericNullabilityContext.Empty;
        type = UnwrapByRef(type);
        typeNullability = genericNullability.Resolve(type, typeNullability);
        typeNullabilityMetadata = genericNullability.ResolveMetadata(type, typeNullabilityMetadata);
        if (IsDelegate(type))
        {
            var delegateShape = DelegateSourceShape(type, genericParameters, typeNullability, typeNullabilityMetadata, genericNullability);
            if (delegateShape is not null)
            {
                return delegateShape;
            }
        }
        var providerProjection = ProviderSourceProjectionShape(
            type,
            genericParameters,
            typeNullability,
            typeNullabilityMetadata,
            genericNullability);
        if (providerProjection is not null)
        {
            return providerProjection;
        }
        if (IsRuntimeType(type, typeof(string)))
        {
            return new { kind = "string" };
        }
        if (IsRuntimeType(type, typeof(object)))
        {
            return new { kind = "object" };
        }
        var primitive = SourcePrimitiveName(type);
        if (primitive is not null)
        {
            return new { kind = "source-primitive", name = primitive };
        }
        if (type.IsArray)
        {
            if (!type.IsSZArray)
            {
                return null;
            }
            var element = SourceShape(
                type.GetElementType()!,
                genericParameters,
                typeNullability?.ElementType,
                typeNullabilityMetadata?.ElementType,
                genericNullability);
            return element is null ? null : new { kind = "array", elementType = element };
        }
        if (type.IsGenericParameter)
        {
            if (genericParameters.TryGetSubstitution(type, out var substitution) && substitution != type)
            {
                return SourceShape(substitution, genericParameters, typeNullability, typeNullabilityMetadata, genericNullability);
            }
            return genericParameters.IsOmitted(type)
                ? null
                : new { kind = "type-parameter", name = genericParameters.SourceName(type) };
        }
        if (IsNullableShape(type, out var nullableElement))
        {
            var element = SourceShape(
                nullableElement,
                genericParameters,
                GenericArgumentNullability(typeNullability, 0),
                GenericArgumentNullabilityMetadata(typeNullabilityMetadata, 0),
                genericNullability);
            return element is null
                ? null
                : new { kind = "union", types = new[] { element, NullLiteralTypeRef() } };
        }
        if (TryValueTupleElementTypes(type, out var tupleElements))
        {
            var elements = tupleElements.Select((element, index) => SourceShape(
                element,
                genericParameters,
                GenericArgumentNullability(typeNullability, index),
                GenericArgumentNullabilityMetadata(typeNullabilityMetadata, index),
                genericNullability)).ToArray();
            return elements.Any(element => element is null)
                ? null
                : new { kind = "tuple", elements };
        }
        if (IsKeyValuePairShape(type, out var keyType, out var valueType))
        {
            var key = SourceShape(keyType, genericParameters, GenericArgumentNullability(typeNullability, 0), GenericArgumentNullabilityMetadata(typeNullabilityMetadata, 0), genericNullability);
            var value = SourceShape(valueType, genericParameters, GenericArgumentNullability(typeNullability, 1), GenericArgumentNullabilityMetadata(typeNullabilityMetadata, 1), genericNullability);
            return key is null || value is null
                ? null
                : new { kind = "tuple", elements = new[] { key, value } };
        }
        if (IsEnumerableShape(type, out var enumerableElement))
        {
            var element = SourceShape(enumerableElement, genericParameters, GenericArgumentNullability(typeNullability, 0), GenericArgumentNullabilityMetadata(typeNullabilityMetadata, 0), genericNullability);
            return element is null ? null : new { kind = "array", elementType = element };
        }
        var referenceDefinition = type.IsGenericType ? type.GetGenericTypeDefinition() : type;
        if (providerSourceReferencesByTargetId.TryGetValue(TargetId(referenceDefinition), out var sourceReference))
        {
            var args = type.IsGenericType
                ? type.GetGenericArguments().Select((argument, index) => SourceShape(
                    argument,
                    genericParameters,
                    GenericArgumentNullability(typeNullability, index),
                    GenericArgumentNullabilityMetadata(typeNullabilityMetadata, index),
                    genericNullability)).ToArray()
                : Array.Empty<object>();
            if (args.Any(argument => argument is null))
            {
                return null;
            }
            return new
            {
                kind = "provider-ref",
                moduleSpecifier = sourceReference.ModuleSpecifier,
                exportName = sourceReference.TypeFamilyExportName ?? sourceReference.Name,
                typeArguments = args.Length == 0 ? null : args,
            };
        }
        return null;
    }

    static object NullLiteralTypeRef()
    {
        return new LiteralTypeRef(null);
    }

    static object UndefinedTypeRef()
    {
        return new { kind = "undefined" };
    }

    static object SourceUndefinedUnionTypeRef(object type)
    {
        return new { kind = "union", types = new object[] { type, UndefinedTypeRef() } };
    }

    object? NullableParameterSourceTypeRef(
        Type parameterType,
        bool isParamsArray,
        NullabilityInfo parameterNullability,
        NullableMetadata parameterNullabilityMetadata,
        GenericParameterContext? genericParameters = null,
        GenericNullabilityContext? genericNullability = null)
    {
        if (isParamsArray)
        {
            return NullableParamsArrayParameterSourceTypeRef(
                parameterType,
                parameterNullability,
                parameterNullabilityMetadata,
                genericParameters,
                genericNullability);
        }
        if (
            IsRuntimeType(UnwrapByRef(parameterType), typeof(object)) &&
            ParameterAllowsSourceUndefined(parameterType, parameterNullability, parameterNullabilityMetadata)
        )
        {
            return new { kind = "unknown" };
        }
        if (!ParameterAllowsSourceUndefined(parameterType, parameterNullability, parameterNullabilityMetadata))
        {
            return null;
        }
        var type = TypeRef(
            parameterType,
            genericParameters: genericParameters,
            typeNullability: parameterNullability,
            typeNullabilityMetadata: parameterNullabilityMetadata,
            genericNullability: genericNullability,
            includeTopLevelReferenceNullability: false);
        return type is null ? null : SourceUndefinedUnionTypeRef(type);
    }

    object? NullableParamsArrayParameterSourceTypeRef(
        Type parameterType,
        NullabilityInfo parameterNullability,
        NullableMetadata parameterNullabilityMetadata,
        GenericParameterContext? genericParameters = null,
        GenericNullabilityContext? genericNullability = null)
    {
        var elementType = parameterType.GetElementType();
        var elementNullability = elementType is null
            ? null
            : (genericNullability ?? GenericNullabilityContext.Empty).Resolve(elementType, parameterNullability.ElementType);
        var elementNullabilityMetadata = elementType is null
            ? null
            : (genericNullability ?? GenericNullabilityContext.Empty).ResolveMetadata(elementType, parameterNullabilityMetadata.ElementType);
        if (elementType is null || elementNullability is null || elementNullabilityMetadata is null)
        {
            return null;
        }
        if (IsRuntimeType(elementType, typeof(object)))
        {
            return new { kind = "array", elementType = new { kind = "unknown" } };
        }
        var sourceElementType = TypeRef(
            elementType,
            genericParameters: genericParameters,
            typeNullability: elementNullability,
            typeNullabilityMetadata: elementNullabilityMetadata,
            genericNullability: genericNullability,
            includeTopLevelReferenceNullability: false);
        return sourceElementType is null
            ? null
            : new
            {
                kind = "array",
                elementType = AllowsSourceUndefined(
                    elementType,
                    elementNullability,
                    elementNullabilityMetadata)
                        ? SourceUndefinedUnionTypeRef(sourceElementType)
                        : sourceElementType,
            };
    }

    static bool ParameterAllowsSourceUndefined(
        Type parameterType,
        NullabilityInfo parameterNullability,
        NullableMetadata parameterNullabilityMetadata)
    {
        parameterType = UnwrapByRef(parameterType);
        if (parameterType.IsValueType)
        {
            return false;
        }
        return AllowsSourceUndefined(parameterType, parameterNullability, parameterNullabilityMetadata);
    }

    static bool AllowsSourceUndefined(
        Type type,
        NullabilityInfo nullabilityInfo,
        NullableMetadata? nullabilityMetadata)
    {
        if (type.IsGenericParameter)
        {
            return nullabilityMetadata?.AllowsSourceUndefined == true;
        }
        return nullabilityInfo.ReadState == NullabilityState.Nullable ||
            nullabilityInfo.WriteState == NullabilityState.Nullable;
    }

    static object ReferenceNullabilityTypeRef(
        Type type,
        NullabilityInfo? typeNullability,
        NullableMetadata? typeNullabilityMetadata,
        object typeRef,
        bool includeTopLevelReferenceNullability)
    {
        return includeTopLevelReferenceNullability &&
            !type.IsValueType &&
            typeNullability is not null &&
            AllowsSourceUndefined(type, typeNullability, typeNullabilityMetadata)
                ? new { kind = "nullable-reference", elementType = typeRef }
                : typeRef;
    }

    sealed class LiteralTypeRef
    {
        public string kind => "literal";

        [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
        public object? value { get; }

        public LiteralTypeRef(object? value)
        {
            this.value = value;
        }
    }

    Dictionary<string, SourceReference> SourceReferencesByTargetId(IEnumerable<Type> loadedTypes)
    {
        var candidates = SourceReferenceCandidates(loadedTypes
            .Where(type => type.Namespace is not null)
            .Where(type => SourcePackageForType(type) is not null)
            .Where(type => !HasProviderOwnedSourceProjection(type)))
            .ToArray();
        var references = candidates
            .Where(candidate => !IsDelegate(candidate.Type))
            .ToDictionary(
                candidate => TargetId(candidate.Type),
                candidate => candidate.Reference,
                StringComparer.Ordinal);
        providerSourceReferencesByTargetId = references;

        var pendingDelegates = candidates.Where(candidate => IsDelegate(candidate.Type)).ToList();
        var added = true;
        while (added)
        {
            added = false;
            foreach (var candidate in pendingDelegates.ToArray())
            {
                if (DelegateSourceShape(candidate.Type) is null)
                {
                    continue;
                }
                references[TargetId(candidate.Type)] = candidate.Reference;
                pendingDelegates.Remove(candidate);
                added = true;
            }
        }
        return references;
    }

    static bool HasProviderOwnedSourceProjection(Type type)
    {
        return IsRuntimeType(type, typeof(Array));
    }

    IEnumerable<SourceReferenceCandidate> SourceReferenceCandidates(IEnumerable<Type> types)
    {
        foreach (var namespaceGroup in types.GroupBy(type => $"{ModuleSpecifierForTypeNamespace(type)}\0{SourceTypeBaseName(type)}", StringComparer.Ordinal))
        {
            var groupTypes = namespaceGroup.ToArray();
            var familyExportName = SourceTypeBaseName(groupTypes[0]);
            var useTypeFamily = CanRepresentProviderTypeFamily(groupTypes);
            var disambiguateByArity = groupTypes.Length > 1;
            var candidateGroups = groupTypes
                .Select(type => new SourceReferenceCandidate(
                    type,
                    new SourceReference(
                        SourceTypeName(type, disambiguateByArity),
                        ModuleSpecifierForTypeNamespace(type)!,
                        useTypeFamily ? familyExportName : null,
                        useTypeFamily ? GenericTypeNameArity(type) : null)))
                .GroupBy(candidate => candidate.Reference.Name, StringComparer.Ordinal)
                .ToArray();
            foreach (var candidateGroup in candidateGroups.Where(group => group.Count() == 1))
            {
                yield return candidateGroup.First();
            }
            foreach (var candidateGroup in candidateGroups.Where(group => group.Count() > 1))
            {
                foreach (var qualifiedCandidateGroup in candidateGroup
                    .Where(candidate => candidate.Type.IsNested)
                    .Select(candidate => new SourceReferenceCandidate(
                        candidate.Type,
                        new SourceReference(
                            QualifiedNestedSourceTypeName(candidate.Type, disambiguateByArity),
                            candidate.Reference.ModuleSpecifier,
                            useTypeFamily ? familyExportName : null,
                            useTypeFamily ? GenericTypeNameArity(candidate.Type) : null)))
                    .GroupBy(candidate => candidate.Reference.Name, StringComparer.Ordinal)
                    .Where(group => group.Count() == 1))
                {
                    yield return qualifiedCandidateGroup.First();
                }
            }
        }
    }

    string ProviderSourceTypeName(Type type)
    {
        return providerSourceReferencesByTargetId.TryGetValue(TargetId(type), out var reference)
            ? reference.Name
            : SourceTypeName(type);
    }

    string ProviderSourceExportName(Type type)
    {
        return providerSourceReferencesByTargetId.TryGetValue(TargetId(type), out var reference) &&
            !string.IsNullOrEmpty(reference.TypeFamilyExportName)
            ? reference.TypeFamilyExportName
            : ProviderSourceTypeName(type);
    }

    (string ExportName, int TypeArgumentCount)? ProviderSourceTypeFamily(Type type)
    {
        if (!providerSourceReferencesByTargetId.TryGetValue(TargetId(type), out var reference) ||
            string.IsNullOrEmpty(reference.TypeFamilyExportName) ||
            reference.TypeFamilyTypeArgumentCount is null)
        {
            return null;
        }
        return (reference.TypeFamilyExportName, reference.TypeFamilyTypeArgumentCount.Value);
    }

    object? ProviderSourceTypeFamilyObject(Type type)
    {
        var family = ProviderSourceTypeFamily(type);
        return family is null
            ? null
            : new
            {
                exportName = family.Value.ExportName,
                typeArgumentCount = family.Value.TypeArgumentCount,
            };
    }

    static bool CanRepresentProviderTypeFamily(IReadOnlyCollection<Type> types)
    {
        if (types.Count < 2)
        {
            return false;
        }
        var arities = new HashSet<int>();
        foreach (var type in types)
        {
            if (!arities.Add(GenericTypeNameArity(type)))
            {
                return false;
            }
        }
        var ordered = arities.OrderBy(arity => arity).ToArray();
        for (var arity = ordered[0]; arity <= ordered[^1]; arity++)
        {
            if (!arities.Contains(arity))
            {
                return false;
            }
        }
        return true;
    }

    string ModuleSpecifierForNamespace(string namespaceName)
    {
        return $"{moduleSpecifierPrefix}{namespaceName}.js";
    }

    string? ModuleSpecifierForTypeNamespace(Type type)
    {
        var sourcePackage = SourcePackageForType(type);
        if (sourcePackage is null || type.Namespace is null)
        {
            return null;
        }
        var prefix = StringComparer.Ordinal.Equals(sourcePackage, request.SourcePackage)
            ? moduleSpecifierPrefix
            : $"{sourcePackage}/";
        return $"{prefix}{type.Namespace}.js";
    }

    string? SourcePackageForType(Type type)
    {
        var location = type.Assembly.Location;
        var runtimeDirectory = Path.GetDirectoryName(typeof(object).Assembly.Location);
        if (!string.IsNullOrEmpty(location) && runtimeDirectory is not null && StringComparer.Ordinal.Equals(Path.GetDirectoryName(Path.GetFullPath(location)), Path.GetFullPath(runtimeDirectory)))
        {
            return "@tsonic/dotnet";
        }
        var assemblyName = type.Assembly.GetName().Name;
        if (assemblyName is not null && sourcePackageByAssemblyName.TryGetValue(assemblyName, out var sourcePackage))
        {
            return sourcePackage;
        }
        return sourcePackageByAssemblyName.Count == 0 ? request.SourcePackage : null;
    }

    string GetModuleSpecifierPrefix()
    {
        var suffix = $"{activeNamespaceName}.js";
        if (!activeModuleSpecifier.EndsWith(suffix, StringComparison.Ordinal))
        {
            throw new InvalidOperationException($"Module specifier '{activeModuleSpecifier}' does not end with namespace suffix '{suffix}'.");
        }
        return activeModuleSpecifier[..^suffix.Length];
    }

    object? ExportSourceShape(Type type)
    {
        return IsDelegate(type) ? DelegateSourceShape(type) : null;
    }

    object? DelegateSourceShape(
        Type type,
        GenericParameterContext? genericParameters = null,
        NullabilityInfo? typeNullability = null,
        NullableMetadata? typeNullabilityMetadata = null,
        GenericNullabilityContext? genericNullability = null)
    {
        genericParameters ??= GenericParameterContext.Empty;
        genericNullability ??= GenericNullabilityContext.Empty;
        var targetId = TargetId(type);
        if (delegateSourceShapeInProgress.Contains(targetId))
        {
            return null;
        }
        delegateSourceShapeInProgress.Add(targetId);
        try
        {
            if (UnsupportedDelegateSourceShapeReason(type) is not null)
            {
                return null;
            }
            var definition = type.IsGenericType ? type.GetGenericTypeDefinition() : type;
            if (type.IsConstructedGenericType)
            {
                genericParameters = genericParameters.WithConstructedTypeArguments(definition, type);
                genericNullability = genericNullability.WithConstructedTypeArguments(
                    definition,
                    type,
                    typeNullability,
                    typeNullabilityMetadata);
            }
            var invoke = definition.GetMethod("Invoke");
            if (invoke is null)
            {
                return null;
            }
            var parameters = Parameters(
                invoke.GetParameters(),
                genericParameters: genericParameters,
                genericNullability: genericNullability);
            var returnNullability = genericNullability.Resolve(invoke.ReturnType, nullability.Create(invoke.ReturnParameter));
            var returnNullabilityMetadata = genericNullability.ResolveMetadata(
                invoke.ReturnType,
                NullableMetadata.ForParameter(invoke.ReturnParameter));
            var returnType = TypeRef(
                invoke.ReturnType,
                genericParameters: genericParameters,
                typeNullability: returnNullability,
                typeNullabilityMetadata: returnNullabilityMetadata,
                genericNullability: genericNullability);
            if (parameters is null || returnType is null)
            {
                return null;
            }
            return new
            {
                kind = "function",
                id = TypeTargetId(type),
                parameters,
                returnType,
            };
        }
        finally
        {
            delegateSourceShapeInProgress.Remove(targetId);
        }
    }

    static NullabilityInfo? GenericArgumentNullability(NullabilityInfo? typeNullability, int index)
    {
        return typeNullability is not null && index < typeNullability.GenericTypeArguments.Length
            ? typeNullability.GenericTypeArguments[index]
            : null;
    }

    static NullableMetadata? GenericArgumentNullabilityMetadata(NullableMetadata? typeNullabilityMetadata, int index)
    {
        return typeNullabilityMetadata is not null && index < typeNullabilityMetadata.GenericTypeArguments.Count
            ? typeNullabilityMetadata.GenericTypeArguments[index]
            : null;
    }

    sealed record SourceReferenceCandidate(Type Type, SourceReference Reference);
}
