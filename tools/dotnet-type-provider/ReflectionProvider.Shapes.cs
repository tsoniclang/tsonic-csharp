using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

sealed partial class ReflectionProvider
{
    static bool IsEnumerableShape(Type type, out Type element)
    {
        var definition = type.IsGenericType ? type.GetGenericTypeDefinition() : type;
        if (definition == typeof(IEnumerable<>) ||
            definition == typeof(IReadOnlyCollection<>) ||
            definition == typeof(IReadOnlyList<>) ||
            definition == typeof(ICollection<>) ||
            definition == typeof(IList<>))
        {
            element = type.GetGenericArguments()[0];
            return true;
        }
        element = typeof(object);
        return false;
    }

    static bool IsNullableShape(Type type, out Type element)
    {
        var definition = type.IsGenericType ? type.GetGenericTypeDefinition() : type;
        if (definition.FullName == "System.Nullable`1")
        {
            element = type.GetGenericArguments()[0];
            return true;
        }
        element = typeof(object);
        return false;
    }

    static bool IsKeyValuePairShape(Type type, out Type keyType, out Type valueType)
    {
        var definition = type.IsGenericType ? type.GetGenericTypeDefinition() : type;
        if (definition.FullName == "System.Collections.Generic.KeyValuePair`2")
        {
            var args = type.GetGenericArguments();
            keyType = args[0];
            valueType = args[1];
            return true;
        }
        keyType = typeof(object);
        valueType = typeof(object);
        return false;
    }

    static bool TryValueTupleElementTypes(Type type, out IReadOnlyList<Type> elements)
    {
        var flattened = new List<Type>();
        if (!AppendValueTupleElementTypes(type, flattened))
        {
            elements = Array.Empty<Type>();
            return false;
        }
        elements = flattened;
        return true;
    }

    static bool AppendValueTupleElementTypes(Type type, List<Type> elements)
    {
        var definition = type.IsGenericType ? type.GetGenericTypeDefinition() : type;
        if (definition.FullName is null || !definition.FullName.StartsWith("System.ValueTuple`", StringComparison.Ordinal))
        {
            return false;
        }
        var args = type.GetGenericArguments();
        if (args.Length == 8)
        {
            elements.AddRange(args.Take(7));
            return AppendValueTupleElementTypes(args[7], elements);
        }
        elements.AddRange(args);
        return args.Length > 0;
    }

}
