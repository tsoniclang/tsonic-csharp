using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    Type[] SourceClosureTypes(Type[] allTypes, Type[] exportedTypes, ISet<string> sourceExportableTargetIds)
    {
        if (request.Exports.Count == 0 && request.TargetIds.Count == 0 && request.MetadataNames.Count == 0)
        {
            return [];
        }
        var allTypesByTargetId = allTypes.ToDictionary(TargetId, StringComparer.Ordinal);
        var exportedTargetIds = exportedTypes.Select(TargetId).ToHashSet(StringComparer.Ordinal);
        var closureTargetIds = new SortedSet<string>(StringComparer.Ordinal);
        var pendingTypes = new Queue<Type>(exportedTypes);
        var visitedTargetIds = exportedTypes.Select(TargetId).ToHashSet(StringComparer.Ordinal);
        while (pendingTypes.Count > 0)
        {
            var type = pendingTypes.Dequeue();
            foreach (var dependency in DirectSourceDependencies(type))
            {
                var normalized = NormalizeClosureType(dependency);
                if (normalized is null ||
                    normalized.Namespace != activeNamespaceName ||
                    exportedTargetIds.Contains(TargetId(normalized)) ||
                    !sourceExportableTargetIds.Contains(TargetId(normalized)) ||
                    !allTypesByTargetId.ContainsKey(TargetId(normalized)) ||
                    !visitedTargetIds.Add(TargetId(normalized)))
                {
                    continue;
                }
                closureTargetIds.Add(TargetId(normalized));
                if (normalized.IsNested)
                {
                    pendingTypes.Enqueue(normalized);
                }
            }
        }
        return closureTargetIds
            .Select(targetId => allTypesByTargetId[targetId])
            .Where(type => sourceExportableTargetIds.Contains(TargetId(type)))
            .ToArray();
    }

    object? ToClosureTypeExport(Type type)
    {
        return type.IsNested ? ToTypeExport(type) : ToShallowTypeExport(type);
    }

    object ToShallowTypeExport(Type type)
    {
        var typeParameters = TypeParameters(type);
        var sourceShape = ExportSourceShape(type);
        var attributes = AttributeFacts(type.GetCustomAttributesData(), "type", TargetId(type));
        return new
        {
            kind = "type",
            typeKind = TypeKind(type),
            sourceName = ProviderSourceTypeName(type),
            namespaceName = activeNamespaceName,
            targetId = TargetId(type),
            metadataName = MetadataName(type),
            assembly = AssemblyReference(type.Assembly),
            displayName = DisplayName(type),
            renderShape = RenderShape(type),
            attributes = attributes.Supported.Length == 0 ? null : attributes.Supported,
            unsupportedAttributes = attributes.Unsupported.Length == 0 ? null : attributes.Unsupported,
            typeParameters = typeParameters.Length == 0 ? null : typeParameters,
            sourceShape,
            throwable = typeof(Exception).IsAssignableFrom(type) ? true : (bool?)null,
        };
    }

    IEnumerable<Type> DirectSourceDependencies(Type type)
    {
        if (type.BaseType is not null && type.BaseType != typeof(object))
        {
            foreach (var dependency in SourceDependencyTypes(type.BaseType))
            {
                yield return dependency;
            }
        }
        foreach (var contract in type.GetInterfaces())
        {
            foreach (var dependency in SourceDependencyTypes(contract))
            {
                yield return dependency;
            }
        }
        foreach (var constructor in type.GetConstructors(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
        {
            foreach (var parameter in constructor.GetParameters())
            {
                foreach (var dependency in SourceDependencyTypes(parameter.ParameterType))
                {
                    yield return dependency;
                }
            }
        }
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
        {
            foreach (var dependency in SourceDependencyTypes(property.PropertyType))
            {
                yield return dependency;
            }
            foreach (var parameter in property.GetIndexParameters())
            {
                foreach (var dependency in SourceDependencyTypes(parameter.ParameterType))
                {
                    yield return dependency;
                }
            }
        }
        foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
        {
            foreach (var dependency in SourceDependencyTypes(field.FieldType))
            {
                yield return dependency;
            }
        }
        foreach (var eventInfo in type.GetEvents(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
        {
            if (eventInfo.EventHandlerType is not null)
            {
                foreach (var dependency in SourceDependencyTypes(eventInfo.EventHandlerType))
                {
                    yield return dependency;
                }
            }
        }
        foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
        {
            foreach (var dependency in SourceDependencyTypes(method.ReturnType))
            {
                yield return dependency;
            }
            foreach (var parameter in method.GetParameters())
            {
                foreach (var dependency in SourceDependencyTypes(parameter.ParameterType))
                {
                    yield return dependency;
                }
            }
            foreach (var methodParameter in method.GetGenericArguments())
            {
                foreach (var constraint in methodParameter.GetGenericParameterConstraints())
                {
                    foreach (var dependency in SourceDependencyTypes(constraint))
                    {
                        yield return dependency;
                    }
                }
            }
        }
        foreach (var typeParameter in type.GetGenericArguments().Where(parameter => parameter.IsGenericParameter))
        {
            foreach (var constraint in typeParameter.GetGenericParameterConstraints())
            {
                foreach (var dependency in SourceDependencyTypes(constraint))
                {
                    yield return dependency;
                }
            }
        }
    }

    static IEnumerable<Type> SourceDependencyTypes(Type type)
    {
        type = UnwrapByRef(type);
        if (type.IsPointer || type.IsGenericParameter || type == typeof(void))
        {
            yield break;
        }
        if (type.IsArray)
        {
            foreach (var dependency in SourceDependencyTypes(type.GetElementType()!))
            {
                yield return dependency;
            }
            yield break;
        }
        if (IsNullableShape(type, out var nullableElement))
        {
            foreach (var dependency in SourceDependencyTypes(nullableElement))
            {
                yield return dependency;
            }
            yield break;
        }
        if (type.IsGenericType && !type.IsGenericTypeDefinition)
        {
            yield return type.GetGenericTypeDefinition();
            foreach (var argument in type.GetGenericArguments())
            {
                foreach (var dependency in SourceDependencyTypes(argument))
                {
                    yield return dependency;
                }
            }
            yield break;
        }
        yield return type;
    }

    static Type? NormalizeClosureType(Type type)
    {
        type = UnwrapByRef(type);
        if (type.IsPointer || type.IsGenericParameter || type == typeof(void))
        {
            return null;
        }
        if (type.IsArray)
        {
            return NormalizeClosureType(type.GetElementType()!);
        }
        if (IsNullableShape(type, out var nullableElement))
        {
            return NormalizeClosureType(nullableElement);
        }
        return type.IsGenericType && !type.IsGenericTypeDefinition
            ? type.GetGenericTypeDefinition()
            : type;
    }
}
