import AppKit
import Foundation
let out = CommandLine.arguments[1]
let w = 760, h = 470
let img = NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:w,pixelsHigh:h,bitsPerSample:8,samplesPerPixel:4,hasAlpha:false,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep:img)
let canvas=NSRect(x:0,y:0,width:w,height:h)
NSColor(calibratedRed:0.052,green:0.046,blue:0.085,alpha:1).setFill()
canvas.fill()
func glow(_ x:CGFloat,_ y:CGFloat,_ radius:CGFloat,_ color:NSColor){
 let steps=65
 for step in stride(from:steps,through:1,by:-1){
  let r=radius*CGFloat(step)/CGFloat(steps)
  let a=0.011*CGFloat(steps-step)/CGFloat(steps)
  color.withAlphaComponent(a).setFill()
  NSBezierPath(ovalIn:NSRect(x:x-r,y:y-r,width:2*r,height:2*r)).fill()
 }
}
glow(225,245,260,NSColor(calibratedRed:0.49,green:0.35,blue:0.95,alpha:1))
glow(590,165,240,NSColor(calibratedRed:0.21,green:0.37,blue:0.71,alpha:1))
let line=NSBezierPath()
line.move(to:NSPoint(x:295,y:223));line.line(to:NSPoint(x:466,y:223))
line.lineWidth=1.5;NSColor(calibratedRed:0.64,green:0.56,blue:0.87,alpha:0.55).setStroke();line.stroke()
func label(_ txt:String,_ at:NSPoint,_ size:CGFloat,_ color:NSColor,_ weight:NSFont.Weight = .regular){
 let attributes:[NSAttributedString.Key:Any]=[.font:NSFont.systemFont(ofSize:size,weight:weight),.foregroundColor:color]
 let string=NSAttributedString(string:txt,attributes:attributes)
 let bounds=string.size()
 string.draw(at:NSPoint(x:at.x-bounds.width/2,y:at.y))
}
label("AGENTEEQ",NSPoint(x:380,y:412),12,NSColor(calibratedRed:0.77,green:0.71,blue:1,alpha:1),.semibold)
label("Přetáhni Agenteeq do Aplikací",NSPoint(x:380,y:366),25,.white,.medium)
label("DRAG TO APPLICATIONS",NSPoint(x:380,y:57),12,NSColor(calibratedRed:0.65,green:0.62,blue:0.75,alpha:1),.medium)
NSGraphicsContext.current?.flushGraphics()
NSGraphicsContext.restoreGraphicsState()
guard let png=img.representation(using:.png,properties:[:]) else {fatalError("PNG encoding failed")}
try png.write(to:URL(fileURLWithPath:out),options:.atomic)
