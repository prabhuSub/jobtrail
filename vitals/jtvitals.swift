// jtvitals — one JSON line of this Mac's vitals, no admin rights needed.
//   CPU % (0.5 s sample), chip temperature (Apple Silicon HID sensors), fan speeds (SMC), thermal state,
//   battery % / health / cycles / temperature / on-power, free disk, uptime.
// Build:  swiftc -O jtvitals.swift -o jtvitals     (JobTrail copies it to ~/.jobtrail/bin on both Macs)
import Foundation
import IOKit
import IOKit.ps

// MARK: CPU % — two host_processor_info samples 0.5 s apart
func cpuTicks() -> (busy: UInt64, total: UInt64) {
    var n: natural_t = 0, info: processor_info_array_t?, cnt: mach_msg_type_number_t = 0
    guard host_processor_info(mach_host_self(), PROCESSOR_CPU_LOAD_INFO, &n, &info, &cnt) == KERN_SUCCESS, let info else { return (0, 0) }
    var busy: UInt64 = 0, total: UInt64 = 0
    for i in 0..<Int(n) {
        let b = Int(CPU_STATE_MAX) * i
        let u = UInt64(info[b + Int(CPU_STATE_USER)]), s = UInt64(info[b + Int(CPU_STATE_SYSTEM)])
        let ni = UInt64(info[b + Int(CPU_STATE_NICE)]), id = UInt64(info[b + Int(CPU_STATE_IDLE)])
        busy += u + s + ni; total += u + s + ni + id
    }
    vm_deallocate(mach_task_self_, vm_address_t(bitPattern: info), vm_size_t(Int(cnt) * MemoryLayout<integer_t>.stride))
    return (busy, total)
}

// MARK: temperatures — IOHIDEventSystem (private but stable; what menu-bar monitors use)
@_silgen_name("IOHIDEventSystemClientCreate") func IOHIDEventSystemClientCreate(_ a: CFAllocator?) -> Unmanaged<AnyObject>?
@_silgen_name("IOHIDEventSystemClientSetMatching") func IOHIDEventSystemClientSetMatching(_ c: AnyObject, _ m: CFDictionary) -> Int32
@_silgen_name("IOHIDEventSystemClientCopyServices") func IOHIDEventSystemClientCopyServices(_ c: AnyObject) -> Unmanaged<CFArray>?
@_silgen_name("IOHIDServiceClientCopyProperty") func IOHIDServiceClientCopyProperty(_ s: AnyObject, _ k: CFString) -> Unmanaged<AnyObject>?
@_silgen_name("IOHIDServiceClientCopyEvent") func IOHIDServiceClientCopyEvent(_ s: AnyObject, _ t: Int64, _ o: Int32, _ f: Int64) -> Unmanaged<AnyObject>?
@_silgen_name("IOHIDEventGetFloatValue") func IOHIDEventGetFloatValue(_ e: AnyObject, _ f: Int32) -> Double

func temps() -> [String: Double] {
    guard let c = IOHIDEventSystemClientCreate(kCFAllocatorDefault)?.takeRetainedValue() else { return [:] }
    _ = IOHIDEventSystemClientSetMatching(c, ["PrimaryUsagePage": 0xff00, "PrimaryUsage": 5] as CFDictionary)
    guard let svcs = IOHIDEventSystemClientCopyServices(c)?.takeRetainedValue() as? [AnyObject] else { return [:] }
    var out: [String: Double] = [:]
    for s in svcs {
        guard let name = IOHIDServiceClientCopyProperty(s, "Product" as CFString)?.takeRetainedValue() as? String,
              let ev = IOHIDServiceClientCopyEvent(s, 15, 0, 0)?.takeRetainedValue() else { continue }
        let v = IOHIDEventGetFloatValue(ev, 15 << 16)
        if v > 0 && v < 130 { out[name] = max(out[name] ?? 0, v) }
    }
    return out
}

// MARK: fans — SMC keys FNum, F<i>Ac (actual rpm), F<i>Mx (max rpm)
struct SMCVer { var major: UInt8 = 0, minor: UInt8 = 0, build: UInt8 = 0, reserved: UInt8 = 0, release: UInt16 = 0 }
struct SMCLimit { var version: UInt16 = 0, length: UInt16 = 0, cpu: UInt32 = 0, gpu: UInt32 = 0, mem: UInt32 = 0 }
struct SMCInfo { var size: UInt32 = 0, type: UInt32 = 0, attr: UInt8 = 0, pad0: UInt8 = 0, pad1: UInt8 = 0, pad2: UInt8 = 0 }   // C pads this to 12 bytes; Swift wouldn't
struct SMCParam {
    var key: UInt32 = 0; var vers = SMCVer(); var limit = SMCLimit(); var info = SMCInfo()
    var result: UInt8 = 0, status: UInt8 = 0, data8: UInt8 = 0; var data32: UInt32 = 0
    var bytes: (UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
                UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8) =
        (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
}
final class SMC {
    var conn: io_connect_t = 0
    init?() {
        let svc = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("AppleSMC"))
        guard svc != 0 else { return nil }
        defer { IOObjectRelease(svc) }
        guard IOServiceOpen(svc, mach_task_self_, 0, &conn) == KERN_SUCCESS else { return nil }
    }
    deinit { IOServiceClose(conn) }
    private func call(_ p: inout SMCParam) -> Bool {
        var out = SMCParam(); var size = MemoryLayout<SMCParam>.stride
        let r = IOConnectCallStructMethod(conn, 2, &p, MemoryLayout<SMCParam>.stride, &out, &size)
        p = out; return r == KERN_SUCCESS && out.result == 0
    }
    private func fourCC(_ s: String) -> UInt32 { s.utf8.reduce(0) { $0 << 8 | UInt32($1) } }
    func read(_ key: String) -> (type: String, bytes: [UInt8])? {
        var p = SMCParam(); p.key = fourCC(key); p.data8 = 9   // read key info
        guard call(&p) else { return nil }
        let info = p.info
        var q = SMCParam(); q.key = fourCC(key); q.info.size = info.size; q.data8 = 5   // read bytes
        guard call(&q) else { return nil }
        let all = withUnsafeBytes(of: q.bytes) { Array($0) }
        let t = String(bytes: withUnsafeBytes(of: info.type.bigEndian) { Array($0) }, encoding: .ascii) ?? ""
        return (t, Array(all.prefix(Int(info.size))))
    }
    func number(_ key: String) -> Double? {
        guard let (t, b) = read(key), !b.isEmpty else { return nil }
        switch t {
        case "flt ": return b.count >= 4 ? Double(b.withUnsafeBytes { $0.loadUnaligned(as: Float.self) }) : nil
        case "fpe2": return b.count >= 2 ? Double((UInt16(b[0]) << 8) | UInt16(b[1])) / 4 : nil
        case "ui8 ": return Double(b[0])
        case "ui16": return b.count >= 2 ? Double((UInt16(b[0]) << 8) | UInt16(b[1])) : nil
        default: return nil
        }
    }
}

// MARK: battery — AppleSmartBattery registry (cycles, health, temperature) + power source (%, on AC)
func battery() -> [String: Any]? {
    let svc = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("AppleSmartBattery"))
    guard svc != 0 else { return nil }
    defer { IOObjectRelease(svc) }
    var props: Unmanaged<CFMutableDictionary>?
    guard IORegistryEntryCreateCFProperties(svc, &props, kCFAllocatorDefault, 0) == KERN_SUCCESS,
          let d = props?.takeRetainedValue() as? [String: Any], d["BatteryInstalled"] as? Bool != false else { return nil }
    var b: [String: Any] = [:]
    if let c = d["CycleCount"] as? Int { b["cycles"] = c }
    let bd = d["BatteryData"] as? [String: Any] ?? [:]
    let maxCap = (bd["AppleRawMaxCapacity"] as? Int) ?? (d["AppleRawMaxCapacity"] as? Int) ?? (bd["NominalChargeCapacity"] as? Int)
    let design = (bd["DesignCapacity"] as? Int) ?? (d["DesignCapacity"] as? Int)
    if let m = maxCap, let ds = design, ds > 0 { b["health"] = Int((Double(m) / Double(ds) * 100).rounded()) }
    if let t = d["Temperature"] as? Int { b["temp"] = Int((Double(t) / 100).rounded()) }   // centi-°C
    if let cur = d["CurrentCapacity"] as? Int, let mx = d["MaxCapacity"] as? Int, mx > 0 { b["pct"] = mx == 100 ? cur : Int((Double(cur) / Double(mx) * 100).rounded()) }
    if let ext = d["ExternalConnected"] as? Bool { b["ac"] = ext }
    if let ch = d["IsCharging"] as? Bool { b["charging"] = ch }
    if let tte = d["TimeRemaining"] as? Int, tte > 0, tte < 6000 { b["minLeft"] = tte }
    return b
}

// MARK: run
let t0 = cpuTicks()
usleep(500_000)
let t1 = cpuTicks()
var v: [String: Any] = [:]
if t1.total > t0.total { v["cpu"] = Int((Double(t1.busy - t0.busy) / Double(t1.total - t0.total) * 100).rounded()) }

let ts = temps()
let die = ts.filter { $0.key.lowercased().contains("tdie") }.map(\.value)
let chip = die.isEmpty ? ts.filter { $0.key.hasPrefix("PMU") }.map(\.value) : die
if !chip.isEmpty { v["cpuT"] = Int((chip.reduce(0, +) / Double(chip.count)).rounded()); v["cpuTMax"] = Int(chip.max()!.rounded()) }   // chip average + hottest point

if let smc = SMC() {
    let n = Int(smc.number("FNum") ?? 0)
    var rpm: [Int] = [], mx: [Int] = []
    for i in 0..<min(n, 4) {
        rpm.append(Int((smc.number("F\(i)Ac") ?? 0).rounded()))
        if let m = smc.number("F\(i)Mx") { mx.append(Int(m.rounded())) }
    }
    if n > 0 { v["fans"] = rpm; v["fanMax"] = mx }
}

switch ProcessInfo.processInfo.thermalState {
case .nominal: v["therm"] = "nominal"
case .fair: v["therm"] = "fair"
case .serious: v["therm"] = "serious"
case .critical: v["therm"] = "critical"
@unknown default: break
}
if var b = battery() {
    if b["temp"] == nil, let t = ts.first(where: { $0.key.lowercased().contains("battery") })?.value { b["temp"] = Int(t.rounded()) }
    v["batt"] = b
}
if let a = try? URL(fileURLWithPath: "/").resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey, .volumeTotalCapacityKey]) {
    if let f = a.volumeAvailableCapacityForImportantUsage { v["diskFreeGB"] = Int(f / 1_000_000_000) }
    if let t = a.volumeTotalCapacity { v["diskGB"] = Int(t / 1_000_000_000) }
}
var bt = timeval(), sz = MemoryLayout<timeval>.stride
if sysctlbyname("kern.boottime", &bt, &sz, nil, 0) == 0 { v["upSec"] = Int(Date().timeIntervalSince1970) - bt.tv_sec }

let data = try! JSONSerialization.data(withJSONObject: v, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
