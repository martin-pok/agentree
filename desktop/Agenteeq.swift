import AppKit
import WebKit
import UserNotifications
import Darwin

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate, UNUserNotificationCenterDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var child: Process?
    var input: Pipe?
    var output: Pipe?
    var statusItem: NSStatusItem!
    var loading: NSView!
    var statusLabel: NSTextField!
    var retryButton: NSButton!
    var baseURL: URL?
    var quitting = false
    var retries = 0
    var generation = 0
    var buffer = ""
    var failedMessage: String?
    var lockFD: Int32 = -1
    let ink = NSColor(srgbRed: 22/255, green: 20/255, blue: 29/255, alpha: 1)
    let paper = NSColor(srgbRed: 244/255, green: 243/255, blue: 247/255, alpha: 1)
    let qa = ProcessInfo.processInfo.environment["AGENTEEQ_DESKTOP_QA"] == "1"

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        // Kernel-held advisory lock is atomic, has no stale-PID problem, and is
        // released even on SIGKILL. A loser only raises the winning instance.
        do {
            let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Agenteeq", isDirectory: true)
            do { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
            catch { NSApp.terminate(nil); return }
            lockFD = Darwin.open(directory.appendingPathComponent(qa ? "desktop-qa.lock" : "desktop.lock").path, O_CREAT | O_RDWR | O_NOFOLLOW | O_CLOEXEC, S_IRUSR | S_IWUSR)
            guard lockFD >= 0, flock(lockFD, LOCK_EX | LOCK_NB) == 0 else {
                if let existing = NSRunningApplication.runningApplications(withBundleIdentifier: "cz.agenteeq.desktop").first(where: { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }) { existing.activate(options: [.activateAllWindows]) }
                NSApp.terminate(nil); return
            }
        }
        buildMenu()
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "agenteeq")
        config.userContentController.addUserScript(WKUserScript(source: "document.documentElement.classList.add('is-desktop'); window.agenteeqDesktop = true;", injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        if qa { config.websiteDataStore = .nonPersistent() }
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self; web.uiDelegate = self
        web.isInspectable = qa
        web.setValue(false, forKey: "drawsBackground")
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1380, height: 920), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Agenteeq"; window.titlebarAppearsTransparent = true
        window.backgroundColor = paper; window.appearance = NSAppearance(named: .aqua)
        window.contentMinSize = NSSize(width: 900, height: 620)
        window.isReleasedWhenClosed = false; window.delegate = self
        window.setFrameAutosaveName(qa ? "Agenteeq-QA" : "Agenteeq-Main")
        window.center(); window.contentView = web
        buildLoading()
        buildStatusItem()
        UNUserNotificationCenter.current().delegate = self
        showWindow()
        startServer()
    }

    func buildMenu() {
        let menu = NSMenu()
        let appItem = NSMenuItem(); menu.addItem(appItem)
        let appMenu = NSMenu(); appItem.submenu = appMenu
        appMenu.addItem(withTitle: "O aplikaci Agenteeq", action: #selector(about), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Nastavení…", action: #selector(settings), keyEquivalent: ",")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Skrýt Agenteeq", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Ukončit Agenteeq", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let editItem = NSMenuItem(); menu.addItem(editItem)
        let edit = NSMenu(title: "Úpravy"); editItem.submenu = edit
        for (title, selector, key) in [("Zpět", "undo:", "z"), ("Vyjmout", "cut:", "x"), ("Kopírovat", "copy:", "c"), ("Vložit", "paste:", "v"), ("Vybrat vše", "selectAll:", "a")] {
            edit.addItem(withTitle: title, action: Selector(selector), keyEquivalent: key)
        }
        let windowItem = NSMenuItem(); menu.addItem(windowItem)
        let win = NSMenu(title: "Okno"); windowItem.submenu = win; NSApp.windowsMenu = win
        win.addItem(withTitle: "Zobrazit Agenteeq", action: #selector(showWindow), keyEquivalent: "0")
        win.addItem(withTitle: "Minimalizovat", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "Zavřít okno", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        let helpItem = NSMenuItem(); menu.addItem(helpItem)
        let help = NSMenu(title: "Nápověda"); helpItem.submenu = help
        help.addItem(withTitle: "Průvodce Agenteeq", action: #selector(welcome), keyEquivalent: "")
        NSApp.mainMenu = menu
    }

    func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = NSImage(systemSymbolName: "point.3.connected.trianglepath.dotted", accessibilityDescription: "Agenteeq")
        statusItem.button?.toolTip = "Agenteeq — zobrazit přehled"
        statusItem.button?.target = self; statusItem.button?.action = #selector(showWindow)
    }

    func buildLoading() {
        loading = NSView(); loading.wantsLayer = true; loading.layer?.backgroundColor = ink.cgColor
        loading.translatesAutoresizingMaskIntoConstraints = false; web.addSubview(loading)
        NSLayoutConstraint.activate([loading.leadingAnchor.constraint(equalTo: web.leadingAnchor), loading.trailingAnchor.constraint(equalTo: web.trailingAnchor), loading.topAnchor.constraint(equalTo: web.topAnchor), loading.bottomAnchor.constraint(equalTo: web.bottomAnchor)])
        let title = NSTextField(labelWithString: "Agenteeq")
        title.font = NSFont.systemFont(ofSize: 42, weight: .light); title.textColor = .white
        statusLabel = NSTextField(wrappingLabelWithString: "Připravujeme tvůj pracovní prostor…")
        statusLabel.font = .systemFont(ofSize: 15); statusLabel.textColor = NSColor(white: 0.75, alpha: 1); statusLabel.alignment = .center
        statusLabel.preferredMaxLayoutWidth = 420
        retryButton = NSButton(title: "Zkusit znovu", target: self, action: #selector(retry))
        retryButton.bezelStyle = .rounded; retryButton.isHidden = true
        let stack = NSStackView(views: [title, statusLabel, retryButton]); stack.orientation = .vertical; stack.spacing = 24
        stack.translatesAutoresizingMaskIntoConstraints = false; loading.addSubview(stack)
        NSLayoutConstraint.activate([stack.centerXAnchor.constraint(equalTo: loading.centerXAnchor), stack.centerYAnchor.constraint(equalTo: loading.centerYAnchor), stack.widthAnchor.constraint(lessThanOrEqualToConstant: 460)])
    }

    @objc func showWindow() { window?.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
    @objc func settings() { showWindow(); web?.evaluateJavaScript("location.hash='#/nastaveni'") }
    @objc func welcome() { showWindow(); web?.evaluateJavaScript("window.dispatchEvent(new Event('agenteeq-welcome'))") }
    @objc func about() { NSApp.orderFrontStandardAboutPanel(options: [.applicationName: "Agenteeq", .applicationVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "", .credits: NSAttributedString(string: "Všichni AI agenti na jednom místě.\nLokální desktopová verze pro macOS.")]) }
    @objc func retry() { guard child?.isRunning != true else { return }; retries = 0; startServer() }

    func startServer() {
        guard !quitting, child?.isRunning != true else { return }
        generation += 1
        let currentGeneration = generation
        loading.isHidden = false; retryButton.isHidden = true
        statusLabel.stringValue = retries == 0 ? "Připravujeme tvůj pracovní prostor…" : "Obnovujeme spojení s tvými agenty…"
        failedMessage = nil; buffer = ""; baseURL = nil
        let resources = Bundle.main.resourceURL!
        let process = Process(); process.executableURL = resources.appendingPathComponent("node")
        process.arguments = [resources.appendingPathComponent("app/desktop/server.mjs").path]
        process.currentDirectoryURL = resources.appendingPathComponent("app")
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = resources.path + ":/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        env["AGENTEEQ_NATIVE_NOTIFY"] = "0" // Native notifications below have click-through routing.
        env["AGENTEEQ_QUIET"] = "1"
        env["AGENTEEQ_DESKTOP"] = "1"
        env["AGENTEEQ_PARENT_PID"] = String(ProcessInfo.processInfo.processIdentifier)
        process.environment = env
        let stdout = Pipe(); let stdin = Pipe()
        process.standardOutput = stdout; process.standardInput = stdin
        process.standardError = FileHandle.nullDevice
        child = process; input = stdin; output = stdout
        stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { handle.readabilityHandler = nil; return }
            DispatchQueue.main.async {
                guard let self, self.generation == currentGeneration else { return }
                self.buffer += String(decoding: data, as: UTF8.self)
                while let range = self.buffer.range(of: "\n") {
                    let line = String(self.buffer[..<range.lowerBound]); self.buffer.removeSubrange(..<range.upperBound)
                    guard line.hasPrefix("AGENTEEQ_DESKTOP "), let data = String(line.dropFirst(17)).data(using: .utf8), let msg = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
                    if let error = msg["error"] as? String { self.failedMessage = error }
                    self.handleDesktopEvent(msg)
                    if let port = msg["port"] as? Int, msg["ready"] as? Bool == true {
                        self.baseURL = URL(string: "http://127.0.0.1:\(port)")!
                        self.web.load(URLRequest(url: self.baseURL!))
                    }
                }
            }
        }
        process.terminationHandler = { [weak self] process in
            DispatchQueue.main.async {
                guard let self, !self.quitting, self.generation == currentGeneration else { return }
                self.input = nil; self.output = nil; self.child = nil
                self.loading.isHidden = false
                if self.failedMessage == nil && self.retries < 3 {
                    self.retries += 1
                    DispatchQueue.main.asyncAfter(deadline: .now() + Double(self.retries)) { self.startServer() }
                } else {
                    self.statusLabel.stringValue = self.failedMessage ?? "Spojení se nepodařilo obnovit. Zkus aplikaci spustit znovu."
                    self.retryButton.isHidden = false
                }
            }
        }
        do { try process.run() } catch {
            child = nil; statusLabel.stringValue = "Aplikaci se nepodařilo spustit. Rozbal celý balíček Agenteeq a zkus to znovu."; retryButton.isHidden = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 60) { [weak self] in
            guard let self, self.generation == currentGeneration, self.baseURL == nil, self.child?.isRunning == true else { return }
            self.failedMessage = "Načítání trvá příliš dlouho. Zkus to znovu; při opakovaném problému ověř přístup k souborům agentů."
            self.child?.terminate()
        }
    }

    func local(_ url: URL?) -> Bool {
        guard let url, let baseURL else { return false }
        return url.scheme == "http" && url.host == "127.0.0.1" && url.port == baseURL.port
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if local(action.request.url) { decisionHandler(action.shouldPerformDownload ? .download : .allow); return }
        if let url = action.request.url, ["https", "mailto"].contains(url.scheme ?? ""), action.navigationType == .linkActivated { NSWorkspace.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if let r = response.response as? HTTPURLResponse, r.value(forHTTPHeaderField: "Content-Disposition")?.contains("attachment") == true { decisionHandler(.download) }
        else { decisionHandler(.allow) }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if local(action.request.url) { webView.load(action.request) }
        else if let url = action.request.url, ["https", "mailto"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        return nil
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { loading.isHidden = false; webView.reload() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        loading.isHidden = false; statusLabel.stringValue = "Obnovujeme zobrazení Agenteeq…"
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            if let url = self?.baseURL, !self!.quitting { self?.web.load(URLRequest(url: url)) }
        }
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel(); panel.nameFieldStringValue = URL(fileURLWithPath: suggestedFilename).lastPathComponent
        panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.url : nil) }
    }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel(); panel.canChooseDirectories = parameters.allowsDirectories; panel.canChooseFiles = true; panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.urls : nil) }
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, local(message.frameInfo.request.url), let data = message.body as? [String: Any], let type = data["type"] as? String else { return }
        if type == "ready" { loading.isHidden = true }
        if type == "appearance", let theme = data["theme"] as? String {
            let dark = theme == "dark"
            window.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
            window.backgroundColor = dark ? ink : paper
        }
    }
    // Status/notifications come from our child process, not a throttled hidden webview.
    func handleDesktopEvent(_ data: [String: Any]) {
        guard let type = data["type"] as? String else { return }
        if type == "badge", let count = data["count"] as? Int {
            NSApp.dockTile.badgeLabel = count > 0 ? String(min(count, 999)) : nil
            statusItem.button?.title = count > 0 ? " \(min(count, 999))" : ""
        }
        if type == "notification", !qa, let title = data["title"] as? String {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                guard granted else { return }
                let content = UNMutableNotificationContent(); content.title = String(title.prefix(160)); content.body = String((data["body"] as? String ?? "").prefix(400)); content.sound = .default
                content.userInfo = ["route": data["route"] as? String ?? "#/upozorneni"]
                UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: data["id"] as? String ?? UUID().uuidString, content: content, trigger: nil))
            }
        }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        DispatchQueue.main.async {
            self.showWindow()
            if let route = response.notification.request.content.userInfo["route"] as? String, route.hasPrefix("#/"), let data = try? JSONSerialization.data(withJSONObject: [route]), let json = String(data: data, encoding: .utf8) { self.web.evaluateJavaScript("location.hash=\(json)[0]") }
        }
        completionHandler()
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showWindow(); return true }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard child?.isRunning == true else { return .terminateNow }
        quitting = true
        let process = child!
        // AppKit's terminateLater runs a special run-loop mode: a default-mode
        // Timer can stop firing here and leave the GUI/instance lock alive.
        // Reap off the UI thread, including an exit racing this callback.
        process.terminationHandler = nil
        try? input?.fileHandleForWriting.close(); process.terminate()
        DispatchQueue.global().asyncAfter(deadline: .now() + 10) {
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
        }
        DispatchQueue.global().async {
            process.waitUntilExit()
            DispatchQueue.main.async { NSApp.reply(toApplicationShouldTerminate: true) }
        }
        return .terminateLater
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
