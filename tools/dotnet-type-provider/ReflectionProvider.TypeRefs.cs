using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    object? TypeRef(Type type, bool requireDelegateSourceShape = true, GenericParameterContext? genericParameters = null)
    {
        genericParameters ??= GenericParameterContext.Empty;
        type = UnwrapByRef(type);
        if (IsDelegate(type) && delegateSourceShapeInProgress.Contains(TargetId(type)))
        {
            return null;
        }
        if (type == typeof(void))
        {
            return new { kind = "void" };
        }
        var primitive = SourcePrimitiveName(type);
        if (primitive is not null)
        {
            return new { kind = "source-primitive", name = primitive };
        }
        if (type == typeof(string))
        {
            return new { kind = "string" };
        }
        if (type == typeof(object))
        {
            return new { kind = "object" };
        }
        if (type.IsGenericParameter)
        {
            if (genericParameters.TryGetSubstitution(type, out var substitution) && substitution != type)
            {
                return TypeRef(substitution, requireDelegateSourceShape, genericParameters);
            }
            return genericParameters.IsOmitted(type)
                ? null
                : new { kind = "type-parameter", name = genericParameters.SourceName(type) };
        }
        if (type.IsArray)
        {
            if (!type.IsSZArray)
            {
                return null;
            }
            var elementType = TypeRef(type.GetElementType()!, requireDelegateSourceShape, genericParameters);
            return elementType is null
                ? null
                : new { kind = "array", elementType };
        }
        if (IsNullableShape(type, out var nullableElement))
        {
            var elementType = TypeRef(nullableElement, requireDelegateSourceShape, genericParameters);
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
            ? type.GetGenericArguments().Select(typeArgument => TypeRef(typeArgument, requireDelegateSourceShape, genericParameters)).ToArray()
            : Array.Empty<object?>();
        if (typeArguments.Any(argument => argument is null))
        {
            return null;
        }

        var sourceShape = SourceShape(type, genericParameters);
        if (IsDelegate(type) && sourceShape is null && requireDelegateSourceShape)
        {
            return null;
        }
        return new
        {
            kind = "named",
            targetId = TargetId(definition),
            metadataName = MetadataName(definition),
            displayName = DisplayName(definition),
            renderShape = RenderShape(definition),
            typeArguments = typeArguments.Length == 0 ? null : typeArguments,
            sourceShape,
        };
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

    object? SourceShape(Type type, GenericParameterContext? genericParameters = null)
    {
        genericParameters ??= GenericParameterContext.Empty;
        if (IsDelegate(type))
        {
            var delegateShape = DelegateSourceShape(type, genericParameters);
            if (delegateShape is not null)
            {
                return delegateShape;
            }
        }
        if (type == typeof(string))
        {
            return new { kind = "string" };
        }
        if (type == typeof(object))
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
            var element = SourceShape(type.GetElementType()!, genericParameters);
            return element is null ? null : new { kind = "array", elementType = element };
        }
        if (type.IsGenericParameter)
        {
            if (genericParameters.TryGetSubstitution(type, out var substitution) && substitution != type)
            {
                return SourceShape(substitution, genericParameters);
            }
            return genericParameters.IsOmitted(type)
                ? null
                : new { kind = "type-parameter", name = genericParameters.SourceName(type) };
        }
        if (IsNullableShape(type, out var nullableElement))
        {
            var element = SourceShape(nullableElement, genericParameters);
            return element is null
                ? null
                : new { kind = "union", types = new[] { element, NullLiteralTypeRef() } };
        }
        if (TryValueTupleElementTypes(type, out var tupleElements))
        {
            var elements = tupleElements.Select(element => SourceShape(element, genericParameters)).ToArray();
            return elements.Any(element => element is null)
                ? null
                : new { kind = "tuple", elements };
        }
        if (IsKeyValuePairShape(type, out var keyType, out var valueType))
        {
            var key = SourceShape(keyType, genericParameters);
            var value = SourceShape(valueType, genericParameters);
            return key is null || value is null
                ? null
                : new { kind = "tuple", elements = new[] { key, value } };
        }
        if (IsEnumerableShape(type, out var enumerableElement))
        {
            var element = SourceShape(enumerableElement, genericParameters);
            return element is null ? null : new { kind = "array", elementType = element };
        }
        var referenceDefinition = type.IsGenericType ? type.GetGenericTypeDefinition() : type;
        if (providerSourceReferencesByTargetId.TryGetValue(TargetId(referenceDefinition), out var sourceReference))
        {
            var args = type.IsGenericType
                ? type.GetGenericArguments().Select(argument => SourceShape(argument, genericParameters)).ToArray()
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

    object? NullableParameterSourceTypeRef(ParameterInfo parameter, Type parameterType, bool isParamsArray, GenericParameterContext? genericParameters = null)
    {
        if (isParamsArray)
        {
            return NullableParamsArrayParameterSourceTypeRef(parameter, parameterType, genericParameters);
        }
        if (!ParameterAllowsSourceUndefined(parameter))
        {
            return null;
        }
        var type = TypeRef(parameterType, genericParameters: genericParameters);
        return type is null ? null : SourceUndefinedUnionTypeRef(type);
    }

    object? NullableParamsArrayParameterSourceTypeRef(ParameterInfo parameter, Type parameterType, GenericParameterContext? genericParameters = null)
    {
        var elementType = parameterType.GetElementType();
        if (elementType is null || !ParamsArrayElementAllowsSourceUndefined(parameter))
        {
            return null;
        }
        var sourceElementType = TypeRef(elementType, genericParameters: genericParameters);
        return sourceElementType is null
            ? null
            : new { kind = "array", elementType = SourceUndefinedUnionTypeRef(sourceElementType) };
    }

    bool ParameterAllowsSourceUndefined(ParameterInfo parameter)
    {
        var parameterType = UnwrapByRef(parameter.ParameterType);
        if (parameterType.IsValueType)
        {
            return false;
        }
        var nullabilityInfo = nullability.Create(parameter);
        return nullabilityInfo.ReadState == NullabilityState.Nullable ||
            nullabilityInfo.WriteState == NullabilityState.Nullable;
    }

    bool ParamsArrayElementAllowsSourceUndefined(ParameterInfo parameter)
    {
        var nullabilityInfo = nullability.Create(parameter);
        return nullabilityInfo.ElementType?.ReadState == NullabilityState.Nullable ||
            nullabilityInfo.ElementType?.WriteState == NullabilityState.Nullable;
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
        return type == typeof(Array);
    }

    IEnumerable<SourceReferenceCandidate> SourceReferenceCandidates(IEnumerable<Type> types)
    {
        foreach (var namespaceGroup in types.GroupBy(type => $"{type.Namespace}\0{SourceTypeBaseName(type)}", StringComparer.Ordinal))
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
                        ModuleSpecifierForNamespace(type.Namespace!),
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

    object? DelegateSourceShape(Type type, GenericParameterContext? genericParameters = null)
    {
        genericParameters ??= GenericParameterContext.Empty;
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
            var invoke = type.GetMethod("Invoke");
            if (invoke is null)
            {
                return null;
            }
            var parameters = Parameters(invoke.GetParameters(), genericParameters: genericParameters);
            var returnType = TypeRef(invoke.ReturnType, genericParameters: genericParameters);
            if (parameters is null || returnType is null)
            {
                return null;
            }
            return new
            {
                kind = "function",
                parameters,
                returnType,
            };
        }
        finally
        {
            delegateSourceShapeInProgress.Remove(targetId);
        }
    }

    sealed record SourceReferenceCandidate(Type Type, SourceReference Reference);
}
