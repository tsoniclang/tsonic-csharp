using System;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Threading;
using Tsonic.CSharp.Runtime;

namespace NativeMemoryProof;

public struct Header
{
    public byte TagByte;
    public uint Units;
}

public struct Envelope
{
    public byte Lead;
    public Header Record;
}

public static class Provider
{
    private static WeakReference<Region>? _last;
    private static int _live;

    public static Envelope CreateEnvelope(byte prefix, byte tag, uint count) =>
        new() { Lead = prefix, Record = new Header { TagByte = tag, Units = count } };

    public static unsafe RawPointer Acquire(uint value)
    {
        var region = new Region(value);
        _last = new WeakReference<Region>(region);
        return RawPointer.FromExternal((void*)region.Address, 8, region)!;
    }

    public static uint ReadOriginal() => Last().Values[0];
    public static uint ReadSecond() => Last().Values[1];
    public static uint LiveLeases() => checked((uint)Volatile.Read(ref _live));
    public static Location<uint> Location(uint value) => NativeLocation.Reinterpret<uint>(Acquire(value), NativeLayout.Scalar<uint>(4, 4, 64, true))!;
    public static Location<Value> Relay<Value>(Location<Value> pointer) => pointer;
    public static Value Identity<Value>(Value value) => value;

    public static void Collect()
    {
        GC.Collect(GC.MaxGeneration, GCCollectionMode.Forced, true, true);
        GC.WaitForPendingFinalizers();
        GC.Collect(GC.MaxGeneration, GCCollectionMode.Forced, true, true);
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static Region Last() => _last is not null && _last.TryGetTarget(out var region)
        ? region : throw new InvalidOperationException("Native region was released.");

    private sealed class Region
    {
        private readonly GCHandle _pin;
        internal uint[] Values { get; }
        internal nint Address => _pin.AddrOfPinnedObject();

        internal Region(uint value)
        {
            Values = [value, 0];
            _pin = GCHandle.Alloc(Values, GCHandleType.Pinned);
            Interlocked.Increment(ref _live);
        }

        ~Region()
        {
            if (_pin.IsAllocated)
            {
                _pin.Free();
                Interlocked.Decrement(ref _live);
            }
        }
    }
}
