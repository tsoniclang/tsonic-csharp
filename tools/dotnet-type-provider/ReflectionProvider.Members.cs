using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    IEnumerable<object> Members(Type type)
    {
        foreach (var group in Constructors(type).GroupBy(member => (string)member.GetType().GetProperty("metadataName")!.GetValue(member)!))
        {
            foreach (var member in group)
            {
                yield return member;
            }
        }

        foreach (var member in Properties(type))
        {
            yield return member;
        }

        foreach (var member in Fields(type))
        {
            yield return member;
        }

        foreach (var group in Methods(type).GroupBy(MethodGroupKey))
        {
            var first = group.First();
            var signatures = group.Select(method => MethodSignature(method)).Where(signature => signature is not null).Cast<object>().ToArray();
            if (signatures.Length == 0)
            {
                continue;
            }
            yield return new
            {
                kind = "method",
                sourceName = LowerCamel(first.Name),
                targetName = first.Name,
                metadataName = $"{MetadataName(type)}.{first.Name}",
                @static = first.IsStatic ? true : (bool?)null,
                signatures,
            };
        }

        foreach (var group in Operators(type).GroupBy(MethodGroupKey))
        {
            var first = group.First();
            var signatures = group.Select(method => MethodSignature(method)).Where(signature => signature is not null).Cast<object>().ToArray();
            if (signatures.Length == 0)
            {
                continue;
            }
            yield return new
            {
                kind = "operator",
                sourceName = OperatorSourceName(first.Name),
                targetName = first.Name,
                metadataName = $"{MetadataName(type)}.{first.Name}",
                @static = first.IsStatic ? true : (bool?)null,
                signatures,
            };
        }
    }

    IEnumerable<object> Constructors(Type type)
    {
        foreach (var constructor in type.GetConstructors(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly).OrderBy(ConstructorId, StringComparer.Ordinal))
        {
            var signature = ConstructorSignature(type, constructor);
            if (signature is null)
            {
                continue;
            }
            yield return new
            {
                kind = "constructor",
                sourceName = "constructor",
                targetName = ".ctor",
                metadataName = ConstructorId(constructor),
                signatures = new[] { signature },
            };
        }
    }

    IEnumerable<object> Properties(Type type)
    {
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).OrderBy(property => property.Name, StringComparer.Ordinal))
        {
            var accessors = property.GetAccessors(false);
            if (accessors.Length == 0)
            {
                continue;
            }
            var indexParameters = property.GetIndexParameters();
            if (indexParameters.Length > 0)
            {
                if (indexParameters.Length != 1 || !IsIndexSignatureParameterType(indexParameters[0].ParameterType))
                {
                    continue;
                }
                var parameters = Parameters(indexParameters);
                var returnType = TypeRef(property.PropertyType);
                if (parameters is null || returnType is null)
                {
                    continue;
                }
                yield return new
                {
                    kind = "indexer",
                    sourceName = "item",
                    targetName = property.Name,
                    metadataName = $"{MetadataName(type)}.{property.Name}({string.Join(",", indexParameters.Select(parameter => TypeMetadataName(UnwrapByRef(parameter.ParameterType))))})",
                    @static = accessors[0].IsStatic ? true : (bool?)null,
                    signatures = new[]
                    {
                        new
                        {
                            id = $"{MetadataName(type)}.{property.Name}({string.Join(",", indexParameters.Select(parameter => TypeMetadataName(UnwrapByRef(parameter.ParameterType))))})",
                            targetName = property.Name,
                            parameters,
                            returnType,
                        },
                    },
                };
                continue;
            }

            var typeRef = TypeRef(property.PropertyType);
            if (typeRef is null)
            {
                continue;
            }
            var isStatic = accessors[0].IsStatic;
            if ((type.IsInterface && isStatic) || (isStatic && UsesDeclaringTypeParameter(property.PropertyType, type)))
            {
                continue;
            }
            yield return new
            {
                kind = "property",
                sourceName = LowerCamel(property.Name),
                targetName = property.Name,
                metadataName = $"{MetadataName(type)}.{property.Name}",
                @static = isStatic ? true : (bool?)null,
                type = typeRef,
            };
        }
    }

    IEnumerable<object> Fields(Type type)
    {
        foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).OrderBy(field => field.Name, StringComparer.Ordinal))
        {
            if (field.IsSpecialName)
            {
                continue;
            }
            var typeRef = TypeRef(field.FieldType);
            if (typeRef is null)
            {
                continue;
            }
            if ((type.IsInterface && field.IsStatic) || (field.IsStatic && UsesDeclaringTypeParameter(field.FieldType, type)))
            {
                continue;
            }
            yield return new
            {
                kind = "field",
                sourceName = LowerCamel(field.Name),
                targetName = field.Name,
                metadataName = $"{MetadataName(type)}.{field.Name}",
                @static = field.IsStatic ? true : (bool?)null,
                type = typeRef,
            };
        }
    }

    IEnumerable<MethodInfo> Methods(Type type)
    {
        return type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => !method.IsSpecialName)
            .Where(method => !(type.IsInterface && method.IsStatic))
            .Where(method => !(method.IsStatic && UsesDeclaringTypeParameter(method, type)))
            .OrderBy(MethodId, StringComparer.Ordinal);
    }

    IEnumerable<MethodInfo> Operators(Type type)
    {
        return type.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => method.IsSpecialName)
            .Where(method => method.Name.StartsWith("op_", StringComparison.Ordinal))
            .Where(method => !UsesDeclaringTypeParameter(method, type))
            .OrderBy(MethodId, StringComparer.Ordinal);
    }

    object? MethodSignature(MethodInfo method)
    {
        var parameters = Parameters(method.GetParameters());
        var returnType = TypeRef(method.ReturnType);
        if (parameters is null || returnType is null)
        {
            return null;
        }
        var typeParameters = MethodTypeParameters(method);
        return new
        {
            id = MethodId(method),
            targetName = method.Name,
            typeParameters = typeParameters.Length == 0 ? null : typeParameters,
            parameters,
            returnType,
        };
    }

    object? ConstructorSignature(Type type, ConstructorInfo constructor)
    {
        var parameters = Parameters(constructor.GetParameters());
        if (parameters is null)
        {
            return null;
        }
        return new
        {
            id = ConstructorId(constructor),
            parameters,
        };
    }

    object[]? Parameters(ParameterInfo[] parameters)
    {
        var result = new List<object>();
        for (var index = 0; index < parameters.Length; index++)
        {
            var parameter = parameters[index];
            var parameterType = UnwrapByRef(parameter.ParameterType);
            var type = TypeRef(parameterType);
            if (type is null)
            {
                return null;
            }
            var isParamsArray = parameter.GetCustomAttribute<ParamArrayAttribute>() is not null && parameterType.IsArray;
            result.Add(new
            {
                name = Identifier(parameter.Name ?? $"arg{index}"),
                type,
                passingMode = PassingMode(parameter),
                optional = parameter.IsOptional ? true : (bool?)null,
                rest = isParamsArray ? true : (bool?)null,
            });
        }
        return result.ToArray();
    }

    static string PassingMode(ParameterInfo parameter)
    {
        if (!parameter.ParameterType.IsByRef)
        {
            return "by-value";
        }
        if (parameter.IsOut)
        {
            return "byref-writeonly-must-init";
        }
        return parameter.GetCustomAttribute<System.Runtime.InteropServices.InAttribute>() is not null
            ? "byref-readonly"
            : "byref-readwrite";
    }
}
