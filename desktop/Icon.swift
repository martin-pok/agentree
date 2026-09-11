import AppKit
// Exact geometry of public/brand/agentree-mark.svg, on a white macOS icon tile.
let destination = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
for (points, scale) in [(16,1),(16,2),(32,1),(32,2),(128,1),(128,2),(256,1),(256,2),(512,1),(512,2)] {
    let size = points * scale
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    let context = NSGraphicsContext.current!.cgContext
    context.scaleBy(x: CGFloat(size)/1024, y: CGFloat(size)/1024)
    let tile = NSBezierPath(roundedRect: NSRect(x: 64, y: 64, width: 896, height: 896), xRadius: 198, yRadius: 198)
    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow(); shadow.shadowColor = NSColor.black.withAlphaComponent(0.16); shadow.shadowBlurRadius = 24; shadow.shadowOffset = NSSize(width: 0, height: -10); shadow.set()
    NSColor.white.setFill(); tile.fill()
    NSGraphicsContext.restoreGraphicsState()
    NSColor(white: 0.88, alpha: 1).setStroke(); tile.lineWidth = 1; tile.stroke()
    context.translateBy(x: 172, y: 858); context.scaleBy(x: 17, y: -17)
    let ink = NSColor(srgbRed: 22/255, green: 20/255, blue: 29/255, alpha: 1)
    ink.setStroke(); ink.setFill()
    let stem = NSBezierPath(); stem.lineWidth = 3.2; stem.lineCapStyle = .round; stem.lineJoinStyle = .round
    stem.move(to: NSPoint(x: 20, y: 13)); stem.line(to: NSPoint(x: 20, y: 29))
    stem.move(to: NSPoint(x: 20, y: 18.5)); stem.curve(to: NSPoint(x: 10.5, y: 29), controlPoint1: NSPoint(x: 20, y: 23.5), controlPoint2: NSPoint(x: 10.5, y: 22.5))
    stem.move(to: NSPoint(x: 20, y: 18.5)); stem.curve(to: NSPoint(x: 29.5, y: 29), controlPoint1: NSPoint(x: 20, y: 23.5), controlPoint2: NSPoint(x: 29.5, y: 22.5)); stem.stroke()
    for x in [10.5,20.0,29.5] { NSBezierPath(ovalIn: NSRect(x: x-3.4, y: 27.6, width: 6.8, height: 6.8)).fill() }
    NSColor(srgbRed: 201/255, green: 154/255, blue: 62/255, alpha: 1).setFill()
    NSBezierPath(ovalIn: NSRect(x: 15.8, y: 4.3, width: 8.4, height: 8.4)).fill()
    NSGraphicsContext.restoreGraphicsState()
    let name = "icon_\(points)x\(points)\(scale == 2 ? "@2x" : "").png"
    try bitmap.representation(using: .png, properties: [:])!.write(to: destination.appendingPathComponent(name))
}
