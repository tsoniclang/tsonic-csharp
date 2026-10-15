using System;

namespace ProviderAttributeFixtures;

public enum ProviderAttributeMode
{
    Default = 0,
    Fast = 2,
}

[AttributeUsage(AttributeTargets.All, AllowMultiple = true)]
public sealed class SampleAttribute : Attribute
{
    public SampleAttribute(string name, int count, ProviderAttributeMode mode, Type targetType, int[] numbers)
    {
        Name = name;
        Count = count;
        Mode = mode;
        TargetType = targetType;
        Numbers = numbers;
    }

    public string Name { get; }
    public int Count { get; }
    public ProviderAttributeMode Mode { get; }
    public Type TargetType { get; }
    public int[] Numbers { get; }
    public bool Enabled { get; init; }
    public string? Label;
}

public sealed class TypeOnlyAttribute : Attribute
{
    public TypeOnlyAttribute(Type type)
    {
        Type = type;
    }

    public Type Type { get; }
}

[Sample("type", 3, ProviderAttributeMode.Fast, typeof(AttributeTarget), new[] { 1, 2 }, Enabled = true, Label = "type-field")]
public sealed class AttributeTarget
{
    [Sample("field", 4, ProviderAttributeMode.Fast, typeof(string), new[] { 3 }, Label = "field-label")]
    public string Field = "";

    [Sample("constructor", 5, ProviderAttributeMode.Default, typeof(AttributeTarget), new[] { 4, 5 })]
    public AttributeTarget(
        [Sample("parameter", 6, ProviderAttributeMode.Fast, typeof(int), new[] { 6 }, Enabled = true)]
        string name)
    {
        Field = name;
    }

    [Sample("property", 7, ProviderAttributeMode.Default, typeof(int), new[] { 7 })]
    public int Count { get; set; }

    [return: Sample("return", 8, ProviderAttributeMode.Fast, typeof(string), new[] { 8 })]
    [Sample("method", 9, ProviderAttributeMode.Default, typeof(AttributeTarget), new[] { 9 })]
    public string Run(
        [Sample("method-parameter", 10, ProviderAttributeMode.Fast, typeof(int), new[] { 10 })]
        int value)
    {
        return $"{Field}:{value}";
    }
}

[TypeOnly(typeof(int*))]
public unsafe sealed class UnsupportedAttributeTarget
{
}
