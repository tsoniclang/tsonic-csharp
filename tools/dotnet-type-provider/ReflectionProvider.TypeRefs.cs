using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    object? TypeRef(Type type)
    {
        type = UnwrapByRef(type);
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
            return new { kind = "type-parameter", name = type.Name };
        }
        if (type.IsArray)
        {
            var elementType = TypeRef(type.GetElementType()!);
            return elementType is null
                ? null
                : new { kind = "array", elementType, rank = type.GetArrayRank() == 1 ? null : (int?)type.GetArrayRank() };
        }
        if (IsNullableShape(type, out var nullableElement))
        {
            var elementType = TypeRef(nullableElement);
            return elementType is null
                ? null
                : new { kind = "nullable", elementType };
        }
        if (type.IsPointer)
        {
            return null;
        }
        var definition = type.IsGenericType ? type.GetGenericTypeDefinition() : type;
        var typeArguments = type.IsGenericType && !type.IsGenericTypeDefinition
            ? type.GetGenericArguments().Select(TypeRef).ToArray()
            : Array.Empty<object?>();
        if (typeArguments.Any(argument => argument is null))
        {
            return null;
        }

        var sourceShape = SourceShape(type);
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
        if (type.IsPointer)
        {
            return $"Pointer type '{TypeMetadataName(type)}' requires an explicit provider pointer type model before it can be exposed safely.";
        }
        if (type.IsArray)
        {
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

    object? SourceShape(Type type)
    {
        if (IsDelegate(type))
        {
            var delegateShape = DelegateSourceShape(type);
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
            var element = SourceShape(type.GetElementType()!);
            return element is null ? null : new { kind = "array", elementType = element };
        }
        if (type.IsGenericParameter)
        {
            return new { kind = "type-parameter", name = type.Name };
        }
        if (IsNullableShape(type, out var nullableElement))
        {
            var element = SourceShape(nullableElement);
            return element is null
                ? null
                : new { kind = "union", types = new[] { element, NullLiteralTypeRef() } };
        }
        if (TryValueTupleElementTypes(type, out var tupleElements))
        {
            var elements = tupleElements.Select(SourceShape).ToArray();
            return elements.Any(element => element is null)
                ? null
                : new { kind = "tuple", elements };
        }
        if (IsKeyValuePairShape(type, out var keyType, out var valueType))
        {
            var key = SourceShape(keyType);
            var value = SourceShape(valueType);
            return key is null || value is null
                ? null
                : new { kind = "tuple", elements = new[] { key, value } };
        }
        if (IsEnumerableShape(type, out var enumerableElement))
        {
            var element = SourceShape(enumerableElement);
            return element is null ? null : new { kind = "array", elementType = element };
        }
        var referenceDefinition = type.IsGenericType ? type.GetGenericTypeDefinition() : type;
        if (providerSourceReferencesByTargetId.TryGetValue(TargetId(referenceDefinition), out var sourceReference))
        {
            var args = type.IsGenericType
                ? type.GetGenericArguments().Select(SourceShape).ToArray()
                : Array.Empty<object>();
            if (args.Any(argument => argument is null))
            {
                return null;
            }
            return new
            {
                kind = "provider-ref",
                name = sourceReference.Name,
                moduleSpecifier = sourceReference.ModuleSpecifier == activeModuleSpecifier ? null : sourceReference.ModuleSpecifier,
                typeArguments = args.Length == 0 ? null : args,
            };
        }
        return null;
    }

    static object NullLiteralTypeRef()
    {
        return new LiteralTypeRef(null);
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
        var candidates = loadedTypes
            .Where(type => type.Namespace is not null)
            .GroupBy(type => $"{type.Namespace}\0{SourceTypeName(type)}", StringComparer.Ordinal)
            .Where(group => group.Count() == 1)
            .Select(group => group.First())
            .ToArray();
        var references = candidates
            .Where(type => !IsDelegate(type))
            .ToDictionary(
                type => TargetId(type),
                ToSourceReference,
                StringComparer.Ordinal);
        providerSourceReferencesByTargetId = references;

        var pendingDelegates = candidates.Where(IsDelegate).ToList();
        var added = true;
        while (added)
        {
            added = false;
            foreach (var type in pendingDelegates.ToArray())
            {
                if (DelegateSourceShape(type) is null)
                {
                    continue;
                }
                references[TargetId(type)] = ToSourceReference(type);
                pendingDelegates.Remove(type);
                added = true;
            }
        }
        return references;
    }

    SourceReference ToSourceReference(Type type)
    {
        return new SourceReference(SourceTypeName(type), ModuleSpecifierForNamespace(type.Namespace!));
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

    object? DelegateSourceShape(Type type)
    {
        var invoke = type.GetMethod("Invoke");
        if (invoke is null)
        {
            return null;
        }
        var parameters = Parameters(invoke.GetParameters());
        var returnType = TypeRef(invoke.ReturnType);
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
}
