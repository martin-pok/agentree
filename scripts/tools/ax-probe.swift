// Diagnostika: co aplikace vystavuje přes macOS Přístupnost (Accessibility)? Vypíše názvy oken a stručný
// strom prvků (role + krátký popisek, nejvýš 60 znaků). Tvary UI se u aplikací mění, takže se tu měří,
// ne hádá. Obsah zpráv se nečte a nevypisuje. Použití:
//   xcrun swiftc -O scripts/tools/ax-probe.swift -o /tmp/ax-probe && /tmp/ax-probe com.openai.codex
import AppKit
import ApplicationServices

let bundle = CommandLine.arguments.dropFirst().first ?? "com.openai.codex"
guard AXIsProcessTrusted() else {
    print("TRUSTED=false — tomuto procesu není povolena Přístupnost.")
    print("Povol ji v Nastavení systému → Soukromí a zabezpečení → Přístupnost (pro Terminál / aplikaci, ze které nástroj spouštíš).")
    exit(2)
}
guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: bundle).first else {
    print("TRUSTED=true, ale \(bundle) neběží."); exit(3)
}
let root = AXUIElementCreateApplication(app.processIdentifier)
// Chromium (i Electron) staví strom prvků webu, až když o něj někdo požádá.
AXUIElementSetAttributeValue(root, "AXManualAccessibility" as CFString, kCFBooleanTrue)
AXUIElementSetAttributeValue(root, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
Thread.sleep(forTimeInterval: 1.0)

func attr(_ e: AXUIElement, _ k: String) -> String {
    var v: CFTypeRef?
    guard AXUIElementCopyAttributeValue(e, k as CFString, &v) == .success, let v else { return "" }
    if let s = v as? String { return s }
    if let n = v as? NSNumber { return n.stringValue }
    return ""
}
func children(_ e: AXUIElement) -> [AXUIElement] {
    var v: CFTypeRef?
    guard AXUIElementCopyAttributeValue(e, kAXChildrenAttribute as CFString, &v) == .success, let a = v as? [AXUIElement] else { return [] }
    return a
}
var budget = 260
func dump(_ e: AXUIElement, _ depth: Int) {
    if budget <= 0 || depth > 9 { return }
    budget -= 1
    let role = attr(e, "AXRole"), sub = attr(e, "AXSubrole")
    var label = [attr(e, "AXTitle"), attr(e, "AXDescription")].first(where: { !$0.isEmpty }) ?? ""
    if role == "AXStaticText" || role == "AXTextArea" || role == "AXTextField" { label = "‹text, \(attr(e, "AXValue").count) znaků›" }
    let line = String(repeating: "  ", count: depth) + role + (sub.isEmpty ? "" : "/\(sub)") + (label.isEmpty ? "" : "  “\(label.prefix(60))”")
    print(line)
    for c in children(e) { dump(c, depth + 1) }
}
print("TRUSTED=true  aplikace: \(app.localizedName ?? bundle)  pid \(app.processIdentifier)")
var w: CFTypeRef?
if AXUIElementCopyAttributeValue(root, kAXWindowsAttribute as CFString, &w) == .success, let wins = w as? [AXUIElement] {
    print("oken: \(wins.count)")
    for win in wins { print("— okno: “\(attr(win, "AXTitle"))” fokus=\(attr(win, "AXMain"))"); dump(win, 1) }
} else { print("okna se nepodařilo přečíst") }
