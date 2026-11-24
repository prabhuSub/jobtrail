// Draws the JobTrail icon (Agent Trail palette: black tile, amber trail) to a 1024px PNG.
import AppKit
let size = 1024.0
let img = NSImage(size: NSSize(width: size, height: size))
img.lockFocus()
let tile = NSBezierPath(roundedRect: NSRect(x: 100, y: 100, width: 824, height: 824), xRadius: 185, yRadius: 185)
NSColor(calibratedWhite: 0.06, alpha: 1).setFill(); tile.fill()
NSColor(calibratedWhite: 0.19, alpha: 1).setStroke(); tile.lineWidth = 6; tile.stroke()
let amber = NSColor(calibratedRed: 0.914, green: 0.635, blue: 0.231, alpha: 1)
let line = NSBezierPath(); line.move(to: NSPoint(x: 290, y: 300)); line.line(to: NSPoint(x: 512, y: 512)); line.line(to: NSPoint(x: 734, y: 724))
NSColor(calibratedWhite: 0.25, alpha: 1).setStroke(); line.lineWidth = 22; line.lineCapStyle = .round; line.stroke()
let pts: [(Double, Double, Double, NSColor)] = [
  (290, 300, 52, NSColor(calibratedWhite: 0.41, alpha: 1)),
  (512, 512, 56, NSColor(calibratedWhite: 0.61, alpha: 1)),
  (734, 724, 84, amber),
]
for (x, y, r, c) in pts { c.setFill(); NSBezierPath(ovalIn: NSRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r)).fill() }
let glow = NSBezierPath(ovalIn: NSRect(x: 734 - 130, y: 724 - 130, width: 260, height: 260))
amber.withAlphaComponent(0.18).setStroke(); glow.lineWidth = 14; glow.stroke()
img.unlockFocus()
let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
