import AppKit
import WebKit
import UserNotifications
import Darwin

/// Horní pruh okna, za který se dá okno chytit a přesunout. Systémové záhlaví je sice průhledné
/// a táhnout se za něj dá, ale je úzké – tenhle pruh uchopení rozšiřuje na celou dekorativní
/// plochu nad kartami. Nic pod ním se neztratí: postranní panel začíná až na 44 px a obsah
/// stránky ještě níž, takže tu není co proklikávat.
final class DragStrip: NSView {
    override var mouseDownCanMoveWindow: Bool { true }

    // `mouseDownCanMoveWindow` je jen sdělení systému, že by se tady okno táhnout mohlo – a uvnitř
    // webového pohledu se na něj nedá spolehnout, protože ten si obsluhu myši řeší sám. Proto
    // tažení spouštíme výslovně; `performDrag` je k tomu určené API a chová se přesně jako záhlaví.
    override func mouseDown(with event: NSEvent) {
        // Dvojklik na záhlaví okno zvětší nebo zmenší – tohle chování musí pruh zachovat.
        if event.clickCount == 2 {
            window?.zoom(nil)
            return
        }
        window?.performDrag(with: event)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate, UNUserNotificationCenterDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var child: Process?
    var input: Pipe?
    var output: Pipe?
    var statusItem: NSStatusItem!
    var loading: NSView!
    // Načítací scéna (public/nacitani.html) ve vlastním webovém pohledu nad rozhraním. Běží od
    // prvního snímku okna až do načtení dat, takže animace značky jede souvisle bez střihu.
    var loaderWeb: WKWebView!
    var loaderURL: URL?
    var loaderText = "Připravujeme tvůj pracovní prostor…"
    var loaderRetry = false
    // Záloha, kdyby stránka scény v balíčku chyběla: prostý text a tlačítko v AppKitu.
    var fallback: NSStackView!
    var statusLabel: NSTextField!
    var retryButton: NSButton!
    var baseURL: URL?
    // Tajemství tohoto spuštění (64 znaků). Server ho vyžaduje od každého požadavku z tohoto Macu.
    let localKey = (UUID().uuidString + UUID().uuidString).replacingOccurrences(of: "-", with: "")
    var quitting = false
    var retries = 0
    var generation = 0
    var buffer = ""
    var failedMessage: String?
    var lockFD: Int32 = -1
    let paper = NSColor(srgbRed: 244/255, green: 243/255, blue: 247/255, alpha: 1)
    // --backdrop ze stylů aplikace: „stůl“, na kterém karty leží.
    let backdrop = NSColor(srgbRed: 12/255, green: 11/255, blue: 16/255, alpha: 1)
    let qa = ProcessInfo.processInfo.environment["AGENTEEQ_DESKTOP_QA"] == "1"
    // Kontrola sestavené aplikace (scripts/qa-native.mjs): v režimu QA zapisuje plášť do souboru
    // port serveru a sondu z načteného rozhraní. Stejná sonda je v plášti pro Windows.
    lazy var qaReport: String? = {
        guard self.qa, let path = ProcessInfo.processInfo.environment["AGENTEEQ_DESKTOP_QA_REPORT"], !path.isEmpty else { return nil }
        return path
    }()
    let qaProbe = "setTimeout(function(){var v=document.querySelector('#view');window.webkit.messageHandlers.agenteeq.postMessage({type:'qa-sonda',sonda:{puvod:'ready',titulek:document.title,pohled:v?v.children.length:0,navigace:document.querySelectorAll('.sidebar .nav a').length,desktop:document.documentElement.classList.contains('is-desktop'),aplikace:window.agenteeqDesktop===true,windows:document.documentElement.classList.contains('is-windows'),trasa:location.hash,text:(document.body?document.body.innerText:'').slice(0,240)}});},1500);"
    func qaWrite(_ object: [String: Any]) {
        guard let path = qaReport, let data = try? JSONSerialization.data(withJSONObject: object), let line = String(data: data, encoding: .utf8) else { return }
        if !FileManager.default.fileExists(atPath: path) { FileManager.default.createFile(atPath: path, contents: nil) }
        guard let handle = FileHandle(forWritingAtPath: path) else { return }
        handle.seekToEndOfFile(); handle.write(Data((line + "\n").utf8)); try? handle.close()
    }

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
        // Hned na začátku dokumentu (WebKit tu už má <html>), ne až na jeho konci: rozhraní se
        // vykreslí rovnou s rozvržením aplikace a ví, že v ní běží, dřív než spustí svůj kód.
        config.userContentController.addUserScript(WKUserScript(source: "window.agenteeqDesktop = true; document.documentElement.classList.add('is-desktop');", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if qa { config.websiteDataStore = .nonPersistent() }
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self; web.uiDelegate = self
        web.isInspectable = qa
        web.setValue(false, forKey: "drawsBackground")
        // Obsah sahá až pod záhlaví okna: místo systémového bílého pruhu je za tlačítky vidět
        // tmavý pruh aplikace i s jeho přechodem. Název okna je skrytý – značka je v panelu.
        // Za horní pruh se okno chytá a přesouvá (viz DragStrip). `isMovableByWindowBackground`
        // schválně nezapínáme – táhlo by okno i při označování textu uvnitř aplikace.
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1380, height: 920), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.title = "Agenteeq"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        // Podklad je tmavý v obou režimech vzhledu – stejně jako „stůl“, na kterém aplikace leží.
        window.backgroundColor = backdrop
        window.appearance = NSAppearance(named: .aqua)
        window.contentMinSize = NSSize(width: 900, height: 620)
        window.isReleasedWhenClosed = false; window.delegate = self
        window.setFrameAutosaveName(qa ? "Agenteeq-QA" : "Agenteeq-Main")
        window.center()
        buildLoading()
        buildDragStrip()
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

    // Výška odpovídá odsazení v `public/desktop.css` (`html.is-desktop .sidebar { margin-top: 44px }`):
    // pruh končí přesně tam, kde začíná první karta.
    // Obsah okna je kontejner se dvěma sourozenci: webový pohled přes celou plochu a nad ním pruh
    // k uchopení. Sourozenec dostane události myši běžnou cestou AppKitu – kdyby ležel uvnitř
    // webového pohledu, přebírala by je jeho vlastní obsluha a okno by se táhnout nedalo.
    func buildDragStrip() {
        let root = NSView()
        web.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(web)
        let drag = DragStrip()
        drag.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(drag, positioned: .above, relativeTo: web)
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            web.topAnchor.constraint(equalTo: root.topAnchor),
            web.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            drag.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            drag.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            drag.topAnchor.constraint(equalTo: root.topAnchor),
            drag.heightAnchor.constraint(equalToConstant: 44),
        ])
        window.contentView = root
    }

    func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = AppDelegate.robotIkonaListy()
        statusItem.button?.toolTip = "Agenteeq – zobrazit přehled"
        statusItem.button?.target = self; statusItem.button?.action = #selector(showWindow)
    }

    // Ikona v horní liště: hlava robota z public/brand/agenteeq-mark.svg (mřížka 48 jednotek) jako
    // šablona, kterou macOS sám obarví pro světlou i tmavou lištu; oči jsou průhledné výřezy.
    // Kulička antény je proti logu o kousek větší a stopka užší, aby anténa v 18 bodech nesplynula v čáru.
    static func robotIkonaListy() -> NSImage {
        let ikona = NSImage(size: NSSize(width: 18, height: 18), flipped: true) { _ in
            let s: CGFloat = 18.0 / 48.0
            NSColor.black.setFill()
            NSBezierPath(roundedRect: NSRect(x: 22.6 * s, y: 4.5 * s, width: 2.8 * s, height: 9 * s), xRadius: 1.4 * s, yRadius: 1.4 * s).fill()
            NSBezierPath(ovalIn: NSRect(x: 20.2 * s, y: 0.7 * s, width: 7.6 * s, height: 7.6 * s)).fill()
            let hlava = NSBezierPath(roundedRect: NSRect(x: 5 * s, y: 12 * s, width: 38 * s, height: 31 * s), xRadius: 12 * s, yRadius: 12 * s)
            for x in [14.5, 28.0] as [CGFloat] {
                hlava.append(NSBezierPath(roundedRect: NSRect(x: x * s, y: 21.5 * s, width: 5.5 * s, height: 11 * s), xRadius: 2.75 * s, yRadius: 2.75 * s))
            }
            hlava.windingRule = .evenOdd
            hlava.fill()
            return true
        }
        ikona.isTemplate = true
        ikona.accessibilityDescription = "Agenteeq"
        return ikona
    }

    func buildLoading() {
        loading = NSView(); loading.wantsLayer = true; loading.layer?.backgroundColor = backdrop.cgColor
        loading.translatesAutoresizingMaskIntoConstraints = false; web.addSubview(loading)
        NSLayoutConstraint.activate([loading.leadingAnchor.constraint(equalTo: web.leadingAnchor), loading.trailingAnchor.constraint(equalTo: web.trailingAnchor), loading.topAnchor.constraint(equalTo: web.topAnchor), loading.bottomAnchor.constraint(equalTo: web.bottomAnchor)])

        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "nacitani")
        loaderWeb = WKWebView(frame: .zero, configuration: config)
        loaderWeb.navigationDelegate = self
        loaderWeb.setValue(false, forKey: "drawsBackground")
        loaderWeb.translatesAutoresizingMaskIntoConstraints = false; loading.addSubview(loaderWeb)
        NSLayoutConstraint.activate([loaderWeb.leadingAnchor.constraint(equalTo: loading.leadingAnchor), loaderWeb.trailingAnchor.constraint(equalTo: loading.trailingAnchor), loaderWeb.topAnchor.constraint(equalTo: loading.topAnchor), loaderWeb.bottomAnchor.constraint(equalTo: loading.bottomAnchor)])

        let title = NSTextField(labelWithString: "Agenteeq")
        title.font = NSFont.systemFont(ofSize: 42, weight: .light); title.textColor = .white
        statusLabel = NSTextField(wrappingLabelWithString: loaderText)
        statusLabel.font = .systemFont(ofSize: 15); statusLabel.textColor = NSColor(white: 0.75, alpha: 1); statusLabel.alignment = .center
        statusLabel.preferredMaxLayoutWidth = 420
        retryButton = NSButton(title: "Zkusit znovu", target: self, action: #selector(retry))
        retryButton.bezelStyle = .rounded; retryButton.isHidden = true
        fallback = NSStackView(views: [title, statusLabel, retryButton]); fallback.orientation = .vertical; fallback.spacing = 24
        fallback.translatesAutoresizingMaskIntoConstraints = false; loading.addSubview(fallback)
        NSLayoutConstraint.activate([fallback.centerXAnchor.constraint(equalTo: loading.centerXAnchor), fallback.centerYAnchor.constraint(equalTo: loading.centerYAnchor), fallback.widthAnchor.constraint(lessThanOrEqualToConstant: 460)])

        let page = Bundle.main.resourceURL!.appendingPathComponent("app/public/nacitani.html")
        if FileManager.default.fileExists(atPath: page.path) {
            loaderURL = page
            fallback.isHidden = true
            loaderWeb.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
        } else {
            loaderWeb.isHidden = true
        }
    }

    // Jediné místo, které mění text a tlačítko načítací scény – ve stránce i v záloze.
    func setLoading(_ text: String, retry: Bool = false) {
        loaderText = text; loaderRetry = retry
        statusLabel.stringValue = text; retryButton.isHidden = !retry
        applyLoaderState()
    }
    func applyLoaderState() {
        guard loaderURL != nil, let data = try? JSONSerialization.data(withJSONObject: ["text": loaderText, "znovu": loaderRetry]), let json = String(data: data, encoding: .utf8) else { return }
        loaderWeb.evaluateJavaScript("window.agenteeqNacitani && window.agenteeqNacitani(\(json))")
    }
    func showLoading() {
        loading.layer?.removeAllAnimations()
        loading.alphaValue = 1; loading.isHidden = false
    }
    // Scéna se rozplyne do hotového rozhraní; při omezeném pohybu zmizí naráz.
    func hideLoading() {
        guard !loading.isHidden else { return }
        if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion { loading.isHidden = true; return }
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.32
            context.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0, 0, 1)
            loading.animator().alphaValue = 0
        }, completionHandler: { [weak self] in
            guard let self, self.loading.alphaValue == 0 else { return }
            self.loading.isHidden = true; self.loading.alphaValue = 1
        })
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
        showLoading()
        setLoading(retries == 0 ? "Připravujeme tvůj pracovní prostor…" : "Obnovujeme spojení s tvými agenty…")
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
        // Klíč jen pro tohle spuštění: server bez něj nevydá nic ani jiným programům na tomto Macu.
        env["AGENTEEQ_LOCAL_KEY"] = localKey
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
                        self.web.load(URLRequest(url: URL(string: "\(self.baseURL!.absoluteString)/?k=\(self.localKey)")!))
                        self.qaWrite(["udalost": "server", "port": port])
                        // Počítadlo restartů chrání jen před smyčkou pádů hned po startu. Když server
                        // vydrží minutu, vynuluje se – jinak by aplikace běžící týdny po třetím
                        // náhodném pádu zůstala viset a čekala na ruční „Zkusit znovu“.
                        DispatchQueue.main.asyncAfter(deadline: .now() + 60) { [weak self] in
                            guard let self, self.generation == currentGeneration, self.child?.isRunning == true else { return }
                            self.retries = 0
                        }
                    }
                }
            }
        }
        process.terminationHandler = { [weak self] process in
            DispatchQueue.main.async {
                guard let self, !self.quitting, self.generation == currentGeneration else { return }
                self.input = nil; self.output = nil; self.child = nil
                self.showLoading()
                if self.failedMessage == nil && self.retries < 3 {
                    self.retries += 1
                    DispatchQueue.main.asyncAfter(deadline: .now() + Double(self.retries)) { self.startServer() }
                } else {
                    self.setLoading(self.failedMessage ?? "Spojení se nepodařilo obnovit. Zkus aplikaci spustit znovu.", retry: true)
                }
            }
        }
        do { try process.run() } catch {
            child = nil; setLoading("Aplikaci se nepodařilo spustit. Rozbal celý balíček Agenteeq a zkus to znovu.", retry: true)
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
        // Pohled scény smí jen na svůj jediný soubor; nic jiného neotevře ani odkazem.
        if webView === loaderWeb {
            decisionHandler(action.request.url?.standardizedFileURL == loaderURL?.standardizedFileURL ? .allow : .cancel); return
        }
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
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if webView === loaderWeb { webView.reload(); return }
        showLoading(); webView.reload()
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView === loaderWeb { applyLoaderState() }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        if webView === loaderWeb { loaderURL = nil; loaderWeb.isHidden = true; fallback.isHidden = false; return }
        showLoading(); setLoading("Obnovujeme zobrazení Agenteeq…")
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
        if message.name == "nacitani" {
            if message.webView === loaderWeb, message.frameInfo.isMainFrame, (message.body as? [String: Any])?["type"] as? String == "znovu" { retry() }
            return
        }
        guard message.frameInfo.isMainFrame, local(message.frameInfo.request.url), let data = message.body as? [String: Any], let type = data["type"] as? String else { return }
        if type == "ready" { hideLoading(); if qaReport != nil { web.evaluateJavaScript(qaProbe) } }
        if type == "qa-sonda", qaReport != nil { qaWrite(["udalost": "nacteno", "zprava": data]) }
        if type == "appearance", let theme = data["theme"] as? String {
            let dark = theme == "dark"
            window.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
            // Pozadí okna zůstává tmavé v obou režimech: je vidět jen v pruhu za tlačítky okna
            // a při změně velikosti, a tam patří podklad, ne barva karet.
            window.backgroundColor = backdrop
        }
    }
    // Aktualizace jedním klepnutím. Balíček stáhl a otiskem SHA-256 ověřil server (src/updates.js).
    // Tady se rozbalí, zkontroluje (identifikátor, verze, podpis) a připraví vedle současné aplikace,
    // zatímco Agenteeq ještě běží. Pak se aplikace ukončí jako po ⌘Q a malý pomocník počká, až
    // skončí, vymění balíčky (stará verze jde do Koše) a spustí novou verzi. Když cokoli selže
    // před ukončením, nic se nemění a rozhraní dostane chybu. Stejný postup jako site/install.sh.
    var installing = false
    @discardableResult
    func runTool(_ path: String, _ args: [String]) -> Int32 {
        let p = Process(); p.executableURL = URL(fileURLWithPath: path); p.arguments = args
        p.standardOutput = FileHandle.nullDevice; p.standardError = FileHandle.nullDevice
        do { try p.run() } catch { return -1 }
        p.waitUntilExit(); return p.terminationStatus
    }
    func reportUpdateError(_ message: String) {
        installing = false
        guard let data = try? JSONSerialization.data(withJSONObject: [message]), let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.agenteeqAktualizaceSelhala && window.agenteeqAktualizaceSelhala(\(json)[0])")
    }
    func installUpdate(zip: String, version: String) {
        guard version.range(of: "^\\d+\\.\\d+\\.\\d+$", options: .regularExpression) != nil, zip.hasSuffix(".zip"), FileManager.default.fileExists(atPath: zip) else { return }
        installing = true
        let current = Bundle.main.bundleURL.standardizedFileURL
        let dest = current.deletingLastPathComponent()
        let bundleID = Bundle.main.bundleIdentifier ?? "cz.agenteeq.desktop"
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let fm = FileManager.default
            let fail = { (message: String) in DispatchQueue.main.async { self.reportUpdateError(message) } }
            guard fm.isWritableFile(atPath: dest.path) else { fail("Do složky \(dest.path) nejde zapisovat. Spusť aktualizaci příkazem z Terminálu."); return }
            let work = fm.temporaryDirectory.appendingPathComponent("agenteeq-update-\(UUID().uuidString)", isDirectory: true)
            guard (try? fm.createDirectory(at: work, withIntermediateDirectories: true)) != nil, self.runTool("/usr/bin/ditto", ["-x", "-k", zip, work.path]) == 0 else { fail("Balíček aktualizace nejde rozbalit. Nic se nezměnilo."); return }
            let fresh = work.appendingPathComponent("Agenteeq.app")
            let info = NSDictionary(contentsOf: fresh.appendingPathComponent("Contents/Info.plist"))
            guard info?["CFBundleIdentifier"] as? String == bundleID, info?["CFBundleShortVersionString"] as? String == version else { fail("V balíčku není Agenteeq \(version). Nic se nezměnilo."); return }
            guard self.runTool("/usr/bin/codesign", ["--verify", "--deep", "--strict", fresh.path]) == 0 else { fail("Podpis nové verze neprošel kontrolou. Nic se nezměnilo."); return }
            // Kopie vedle cíle (stejný disk): výměna po ukončení je jen přejmenování.
            let stage = dest.appendingPathComponent(".agenteeq-update-\(UUID().uuidString).app")
            guard self.runTool("/usr/bin/ditto", [fresh.path, stage.path]) == 0 else { fail("Novou verzi se nepodařilo připravit (místo na disku?). Nic se nezměnilo."); return }
            self.runTool("/usr/bin/xattr", ["-dr", "com.apple.quarantine", stage.path])
            try? fm.removeItem(at: work)
            let backup = dest.appendingPathComponent(".agenteeq-previous-\(UUID().uuidString).app")
            let trash = fm.urls(for: .trashDirectory, in: .userDomainMask).first?.appendingPathComponent("Agenteeq \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "") \(Int(Date().timeIntervalSince1970)).app")
            // Pomocník: počká na konec tohoto procesu (nejvýš 60 s), vymění balíčky, při chybě vrátí
            // původní aplikaci a v každém případě Agenteeq znovu otevře.
            let script = """
            pid="$1"; current="$2"; stage="$3"; backup="$4"; trash="$5"
            n=0; while kill -0 "$pid" 2>/dev/null && [ "$n" -lt 300 ]; do sleep 0.2; n=$((n+1)); done
            if mv "$current" "$backup"; then
              if mv "$stage" "$current"; then
                xattr -dr com.apple.quarantine "$current" 2>/dev/null
                [ -n "$trash" ] && mv "$backup" "$trash" 2>/dev/null
              else
                mv "$backup" "$current"; rm -rf "$stage"
              fi
            else
              rm -rf "$stage"
            fi
            open "$current"
            """
            let helper = Process(); helper.executableURL = URL(fileURLWithPath: "/bin/sh")
            helper.arguments = ["-c", script, "agenteeq-update", String(ProcessInfo.processInfo.processIdentifier), current.path, stage.path, backup.path, trash?.path ?? ""]
            helper.standardOutput = FileHandle.nullDevice; helper.standardError = FileHandle.nullDevice; helper.standardInput = FileHandle.nullDevice
            do { try helper.run() } catch { try? fm.removeItem(at: stage); fail("Aktualizaci se nepodařilo spustit. Nic se nezměnilo."); return }
            DispatchQueue.main.async {
                self.showLoading(); self.setLoading("Instalujeme Agenteeq \(version)…")
                NSApp.terminate(nil)
            }
        }
    }

    // Status/notifications come from our child process, not a throttled hidden webview.
    func handleDesktopEvent(_ data: [String: Any]) {
        guard let type = data["type"] as? String else { return }
        if type == "badge", let count = data["count"] as? Int {
            NSApp.dockTile.badgeLabel = count > 0 ? String(min(count, 999)) : nil
            statusItem.button?.title = count > 0 ? " \(min(count, 999))" : ""
        }
        if type == "install-update", !installing, let zip = data["zip"] as? String, let version = data["version"] as? String {
            installUpdate(zip: zip, version: version)
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
    // Aplikaci někdo v Aplikacích nahradil novou verzí (přetažením z DMG nebo ZIP), zatímco tahle
    // pořád běží na pozadí. Klepnutí na ikonu by jinak ukázalo starou verzi. Při návratu do popředí
    // se proto porovná verze na disku s běžící; když se liší, aplikace se restartuje do nové.
    let runningVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
    func relaunchIfReplaced() {
        guard !qa, !installing, !quitting else { return }
        let bundle = Bundle.main.bundleURL.standardizedFileURL
        guard let disk = NSDictionary(contentsOf: bundle.appendingPathComponent("Contents/Info.plist"))?["CFBundleShortVersionString"] as? String,
              !disk.isEmpty, disk != runningVersion else { return }
        installing = true
        let helper = Process(); helper.executableURL = URL(fileURLWithPath: "/bin/sh")
        helper.arguments = ["-c", "n=0; while kill -0 \"$1\" 2>/dev/null && [ \"$n\" -lt 300 ]; do sleep 0.2; n=$((n+1)); done; open \"$2\"", "agenteeq-relaunch", String(ProcessInfo.processInfo.processIdentifier), bundle.path]
        helper.standardOutput = FileHandle.nullDevice; helper.standardError = FileHandle.nullDevice; helper.standardInput = FileHandle.nullDevice
        do { try helper.run() } catch { installing = false; return }
        showLoading(); setLoading("Spouštíme Agenteeq \(disk)…")
        NSApp.terminate(nil)
    }
    func applicationDidBecomeActive(_ notification: Notification) { relaunchIfReplaced() }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { relaunchIfReplaced(); showWindow(); return true }
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
