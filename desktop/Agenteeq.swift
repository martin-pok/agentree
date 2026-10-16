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
    var loaderProgress = false
    var loaderValue: Double? = nil
    // Záloha, kdyby stránka scény v balíčku chyběla: prostý text a tlačítko v AppKitu.
    var fallback: NSStackView!
    var statusLabel: NSTextField!
    var retryButton: NSButton!
    var baseURL: URL?
    // Tajemství tohoto spuštění (64 znaků). Server ho vyžaduje od každého požadavku z tohoto Macu.
    let localKey = (UUID().uuidString + UUID().uuidString).replacingOccurrences(of: "-", with: "")
    var quitting = false
    // Agenti spuštění z Agenteeq (hlásí server, desktop/server.mjs). Ukončení aplikace je zastaví.
    var ownedRuns = 0
    var exitWatchdogArmed = false
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
    let qaProbe = "setTimeout(function(){var v=document.querySelector('#view'),t=document.querySelector('.page-title'),a=document.querySelector('.topbar-actions'),s=document.querySelector('.sidebar'),m=document.querySelector('.main');window.webkit.messageHandlers.agenteeq.postMessage({type:'qa-sonda',sonda:{puvod:'ready',titulek:document.title,pohled:v?v.children.length:0,navigace:document.querySelectorAll('.sidebar .nav a').length,desktop:document.documentElement.classList.contains('is-desktop'),aplikace:window.agenteeqDesktop===true,windows:document.documentElement.classList.contains('is-windows'),trasa:location.hash,text:(document.body?document.body.innerText:'').slice(0,240),layout:{title:t?t.getBoundingClientRect().top:null,actions:a?a.getBoundingClientRect().top:null,sidebar:s?s.getBoundingClientRect().top:null,padding:m?parseFloat(getComputedStyle(m).paddingTop):null}}});},1500);"
    func qaWrite(_ object: [String: Any]) {
        guard let path = qaReport, let data = try? JSONSerialization.data(withJSONObject: object), let line = String(data: data, encoding: .utf8) else { return }
        if !FileManager.default.fileExists(atPath: path) { FileManager.default.createFile(atPath: path, contents: nil) }
        guard let handle = FileHandle(forWritingAtPath: path) else { return }
        handle.seekToEndOfFile(); handle.write(Data((line + "\n").utf8)); try? handle.close()
    }

    // Scénáře pro scripts/qa-update.mjs (jen v režimu QA): skutečná aktualizace sestavené aplikace
    // a ukončení, volitelně se zaseknutým serverem (SIGSTOP) – přesně situace, ve které dřív
    // aplikace visela na „Instalujeme…“ a nešla ukončit.
    var qaScenarioDone = false
    func runQaScenario() {
        guard qa, !qaScenarioDone else { return }
        let env = ProcessInfo.processInfo.environment
        let zip = env["AGENTEEQ_DESKTOP_QA_INSTALL"] ?? "", version = env["AGENTEEQ_DESKTOP_QA_INSTALL_VERSION"] ?? ""
        let quit = env["AGENTEEQ_DESKTOP_QA_QUIT"] == "1"
        guard !zip.isEmpty || quit else { return }
        qaScenarioDone = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            guard let self else { return }
            if env["AGENTEEQ_DESKTOP_QA_WEDGE"] == "1", let pid = self.child?.processIdentifier {
                kill(pid, SIGSTOP)
                self.qaWrite(["udalost": "qa-zaseknuty-server", "pid": Int(pid)])
            }
            if !zip.isEmpty { self.installUpdate(zip: zip, version: version) }
            else { self.qaWrite(["udalost": "qa-ukonceni"]); NSApp.terminate(nil) }
        }
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
        statusItem.button?.title = " —" // unknown until first confirmed local snapshot
        statusItem.button?.toolTip = "Agenteeq – zobrazit přehled"
        statusItem.button?.target = self; statusItem.button?.action = #selector(showWindow)
    }

    // Exact proportions of the Dock master (78:53 head, 8:16 capsule eyes).
    // Draw the silhouette transparently at 18pt; never redesign it for menu size.
    static func robotIkonaListy() -> NSImage {
        let ikona = NSImage(size: NSSize(width: 18, height: 18), flipped: true) { _ in
            let s: CGFloat = 18.0 / 108.0
            NSColor.black.setFill()
            NSColor.black.setStroke()
            let antena = NSBezierPath()
            antena.lineWidth = 5 * s
            antena.lineCapStyle = .round
            antena.move(to: NSPoint(x: 54 * s, y: 25 * s))
            antena.line(to: NSPoint(x: 54 * s, y: 34 * s))
            antena.stroke()
            NSBezierPath(ovalIn: NSRect(x: 50 * s, y: 18 * s, width: 8 * s, height: 8 * s)).fill()
            let hlava = NSBezierPath(roundedRect: NSRect(x: 15 * s, y: 34 * s, width: 78 * s, height: 53 * s),
                                    xRadius: 20 * s, yRadius: 20 * s)
            for x in [36, 64] as [CGFloat] {
                hlava.append(NSBezierPath(roundedRect: NSRect(x: x * s, y: 52 * s, width: 8 * s, height: 16 * s),
                                          xRadius: 4 * s, yRadius: 4 * s))
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
    func setLoading(_ text: String, retry: Bool = false, progress: Bool = false, value: Double? = nil) {
        loaderText = text; loaderRetry = retry; loaderProgress = progress; loaderValue = value
        statusLabel.stringValue = text; retryButton.isHidden = !retry
        applyLoaderState()
    }
    func applyLoaderState() {
        var state: [String: Any] = ["text": loaderText, "znovu": loaderRetry, "progress": loaderProgress]
        if let value = loaderValue { state["hodnota"] = value }
        guard loaderURL != nil, let data = try? JSONSerialization.data(withJSONObject: state), let json = String(data: data, encoding: .utf8) else { return }
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
        statusItem.button?.title = " —" // no current count until a fresh local server snapshot
        statusItem.button?.toolTip = "Agenteeq – stav agentů se načítá"
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
                self.statusItem.button?.title = " —"
                self.statusItem.button?.toolTip = "Agenteeq – spojení s agenty přerušeno"
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
        if webView === web { applyPendingAgentRoute() }
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
            guard message.webView === loaderWeb, message.frameInfo.isMainFrame,
                  let type = (message.body as? [String: Any])?["type"] as? String else { return }
            if type == "znovu" { retry() }
            // Always give the user an explicit way out of a long installer.
            // The quit watchdog below is independent of WebKit/server progress.
            if type == "ukoncit", installing { NSApp.terminate(nil) }
            return
        }
        guard message.frameInfo.isMainFrame, local(message.frameInfo.request.url), let data = message.body as? [String: Any], let type = data["type"] as? String else { return }
        if type == "ready" { hideLoading(); if qaReport != nil { web.evaluateJavaScript(qaProbe) }; runQaScenario() }
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
    // Tady se rozbalí rovnou vedle současné aplikace (stejný disk, žádná druhá kopie), zkontroluje
    // (identifikátor, verze, podpis) a připraví, zatímco Agenteeq ještě běží. Pak plášť sám zastaví
    // server (data se uloží), ukončí se a malý pomocník vymění balíčky (stará verze jde do Koše)
    // a spustí novou verzi. Když cokoli selže před ukončením, nic se nemění a rozhraní dostane chybu.
    //
    // Ukončení nikdy nestojí jen na AppKitu: pojistka (armExitWatchdog) proces ukončí i tehdy, když
    // by se odpověď na applicationShouldTerminate ztratila, a pomocník si poradí i se zaseknutým
    // procesem. Uživatel se tak nikdy nedostane do stavu, kdy aplikace visí a nejde zavřít.
    var installing = false
    @discardableResult
    func runTool(_ path: String, _ args: [String]) -> Int32 {
        let p = Process(); p.executableURL = URL(fileURLWithPath: path); p.arguments = args
        p.standardOutput = FileHandle.nullDevice; p.standardError = FileHandle.nullDevice
        do { try p.run() } catch { return -1 }
        p.waitUntilExit(); return p.terminationStatus
    }
    // Deník aktualizací v ~/Library/Logs/Agenteeq/update.log: když se výměna nepovede, je z něj
    // vidět, v kterém kroku. Zapisuje do něj plášť i pomocník.
    lazy var updateLogPath: String = {
        let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Agenteeq", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("update.log").path
    }()
    func updateLog(_ message: String) {
        let line = "\(ISO8601DateFormatter().string(from: Date())) [\(ProcessInfo.processInfo.processIdentifier)] \(message)\n"
        let path = updateLogPath
        if !FileManager.default.fileExists(atPath: path) { FileManager.default.createFile(atPath: path, contents: nil) }
        guard let handle = FileHandle(forWritingAtPath: path) else { return }
        handle.seekToEndOfFile(); handle.write(Data(line.utf8)); try? handle.close()
    }
    func reportUpdateError(_ message: String) {
        installing = false
        updateLog("chyba: \(message)")
        qaWrite(["udalost": "aktualizace", "krok": "chyba", "zprava": message])
        // Failure happened BEFORE the bundle swap. Restore the already-running
        // application instead of stranding a user behind a permanent loader.
        if baseURL != nil { hideLoading() }
        else { setLoading(message, retry: true) }
        guard let data = try? JSONSerialization.data(withJSONObject: [message]), let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.agenteeqAktualizaceSelhala && window.agenteeqAktualizaceSelhala(\(json)[0])")
    }
    // Zbytky po dřívější přerušené aktualizaci (rozbalené složky vedle aplikace) starší než hodina.
    // Mažou se jen soubory, které vytvořil tenhle pomocník, podle jejich přesného prefixu.
    func removeStaleUpdateStages(in dest: URL) {
        let fm = FileManager.default
        guard let items = try? fm.contentsOfDirectory(at: dest, includingPropertiesForKeys: [.contentModificationDateKey], options: []) else { return }
        for item in items where item.lastPathComponent.hasPrefix(".agenteeq-update-") {
            let modified = (try? item.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date()
            if Date().timeIntervalSince(modified) > 3600 { try? fm.removeItem(at: item) }
        }
    }
    // Zastaví server (uloží data, ukončí agenty spuštěné z Agenteeq) s pevným časovým limitem.
    // Volá se mimo hlavní vlákno; nikdy nečeká déle než ~10 s.
    func stopServerBounded() {
        guard let process = child else { return }
        // Do not synchronously hop to the AppKit thread here. Under a stalled
        // WKWebView/runloop that hop can consume the entire 15-second Quit deadline
        // before SIGTERM even reaches the child (observed in postmerge Mac CI).
        // Shut down the child immediately from this worker; the callers already
        // schedule the final NSApp.terminate on the main thread.
        self.quitting = true
        process.terminationHandler = nil
        try? self.input?.fileHandleForWriting.close()
        if process.isRunning { process.terminate() }
        var waited = 0
        while process.isRunning && waited < 80 { usleep(100_000); waited += 1 }
        if process.isRunning { kill(process.processIdentifier, SIGKILL); updateLog("server neskončil do 8 s, ukončen násilně") }
        waited = 0
        while process.isRunning && waited < 20 { usleep(100_000); waited += 1 }
    }
    // Poslední pojistka: když proces po žádosti o ukončení do `seconds` nezmizí (ztracená odpověď
    // AppKitu, zaseknuté hlavní vlákno), ukončí se sám. Server v tu chvíli už neběží nebo skončí
    // sám, jakmile zjistí, že rodič zmizel (desktop/server.mjs hlídá rodiče každých 500 ms).
    func armExitWatchdog(seconds: Double) {
        guard !exitWatchdogArmed else { return }
        exitWatchdogArmed = true
        let serverPid: pid_t? = (child?.isRunning == true) ? child?.processIdentifier : nil
        let log = updateLogPath
        DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + seconds) {
            if let pid = serverPid { kill(pid, SIGKILL) }
            let line = "\(ISO8601DateFormatter().string(from: Date())) [\(ProcessInfo.processInfo.processIdentifier)] ukončení nedoběhlo do \(Int(seconds)) s, aplikace končí pojistkou\n"
            if let handle = FileHandle(forWritingAtPath: log) { handle.seekToEndOfFile(); handle.write(Data(line.utf8)); try? handle.close() }
            _exit(0)
        }
    }
    func installUpdate(zip: String, version: String) {
        guard version.range(of: "^\\d+\\.\\d+\\.\\d+$", options: .regularExpression) != nil, zip.hasSuffix(".zip"), FileManager.default.fileExists(atPath: zip) else {
            reportUpdateError("Stažený balíček aktualizace už není dostupný. Stáhni ho znovu.")
            return
        }
        installing = true
        updateLog("aktualizace \(runningVersion) → \(version) začíná")
        // Feedback must start BEFORE extracting the downloaded archive. Otherwise
        // large ZIPs look like a frozen black screen until the last file is copied.
        showLoading()
        setLoading("Připravujeme Agenteeq \(version)…", progress: true, value: 0.05)
        let current = Bundle.main.bundleURL.standardizedFileURL
        let dest = current.deletingLastPathComponent()
        let bundleID = Bundle.main.bundleIdentifier ?? "cz.agenteeq.desktop"
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let fm = FileManager.default
            let started = Date()
            let step = { (text: String, value: Double, key: String) in
                self.updateLog("krok \(key) (\(String(format: "%.1f", Date().timeIntervalSince(started))) s)")
                DispatchQueue.main.async { self.qaWrite(["udalost": "aktualizace", "krok": key]); self.setLoading(text, progress: true, value: value) }
            }
            guard fm.isWritableFile(atPath: dest.path) else {
                DispatchQueue.main.async { self.reportUpdateError("Do složky \(dest.path) nejde zapisovat. Stáhni Agenteeq z webu a nahraď aplikaci ručně.") }
                return
            }
            self.removeStaleUpdateStages(in: dest)
            // Rozbalení přímo vedle aplikace: stejný disk, takže výměna je jen přejmenování a nová
            // verze se nekopíruje podruhé (dřív rozbalení do dočasné složky + celá kopie).
            let work = dest.appendingPathComponent(".agenteeq-update-\(UUID().uuidString)", isDirectory: true)
            let fail = { (message: String) in
                try? fm.removeItem(at: work)
                DispatchQueue.main.async { self.reportUpdateError(message) }
            }
            step("Rozbalujeme Agenteeq \(version)…", 0.15, "rozbaleni")
            guard (try? fm.createDirectory(at: work, withIntermediateDirectories: true)) != nil, self.runTool("/usr/bin/ditto", ["-x", "-k", zip, work.path]) == 0 else { fail("Balíček aktualizace nejde rozbalit. Nic se nezměnilo."); return }
            let fresh = work.appendingPathComponent("Agenteeq.app")
            let info = NSDictionary(contentsOf: fresh.appendingPathComponent("Contents/Info.plist"))
            guard info?["CFBundleIdentifier"] as? String == bundleID, info?["CFBundleShortVersionString"] as? String == version else { fail("V balíčku není Agenteeq \(version). Nic se nezměnilo."); return }
            step("Kontrolujeme podpis aplikace…", 0.5, "podpis")
            guard self.runTool("/usr/bin/codesign", ["--verify", "--deep", "--strict", fresh.path]) == 0 else { fail("Podpis nové verze neprošel kontrolou. Nic se nezměnilo."); return }
            self.runTool("/usr/bin/xattr", ["-dr", "com.apple.quarantine", fresh.path])
            let backup = dest.appendingPathComponent(".agenteeq-previous-\(UUID().uuidString).app")
            let trash = fm.urls(for: .trashDirectory, in: .userDomainMask).first?.appendingPathComponent("Agenteeq \(self.runningVersion) \(Int(Date().timeIntervalSince1970)).app")
            // Pomocník počká na konec tohoto procesu. Když by proces po 30 s pořád běžel, ukončí ho
            // (TERM, pak KILL) – aktualizace se nesmí zaseknout. Pak vymění balíčky, při chybě vrátí
            // původní aplikaci a v každém případě Agenteeq znovu otevře. Vše zapisuje do deníku.
            let script = """
            pid="$1"; current="$2"; stage="$3"; work="$4"; backup="$5"; trash="$6"; log="$7"
            say() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [pomocnik] $*" >> "$log" 2>/dev/null || :; }
            # Jen proces Agenteeq: kdyby PID mezitím dostal jiný program, nikdy ho neukončíme. Porovnává se
            # konec cesty, ne celá cesta – /var a /private/var jsou na Macu totéž místo.
            ours() { kill -0 "$pid" 2>/dev/null && ps -p "$pid" -o args= 2>/dev/null | grep -qF ".app/Contents/MacOS/Agenteeq"; }
            wait_gone() { n=0; while ours && [ "$n" -lt "$1" ]; do sleep 0.2; n=$((n+1)); done; }
            say "čekám na ukončení procesu $pid"
            wait_gone 150
            if ours; then say "proces běží i po 30 s, posílám TERM"; kill -TERM "$pid" 2>/dev/null; wait_gone 25; fi
            if ours; then say "posílám KILL"; kill -KILL "$pid" 2>/dev/null; wait_gone 25; fi
            if ours; then
              say "proces nejde ukončit, aktualizace zrušena"
              rm -rf "$work"
              exit 1
            fi
            if mv "$current" "$backup"; then
              if mv "$stage" "$current"; then
                rm -rf "$work"
                xattr -dr com.apple.quarantine "$current" 2>/dev/null || :
                # Retain the old app until macOS confirms that the new one can
                # at least be opened; never trash the only recoverable bundle.
                if open "$current"; then
                  say "nová verze spuštěna"
                  [ -n "$trash" ] && mv "$backup" "$trash" 2>/dev/null || :
                  exit 0
                fi
                say "novou verzi nejde otevřít, vracím původní"
                rm -rf "$current"
                mv "$backup" "$current" || exit 1
                open "$current" || :
                exit 1
              fi
              say "výměna se nepovedla, vracím původní"
              mv "$backup" "$current" || exit 1
            fi
            rm -rf "$work"
            open "$current" || :
            exit 1
            """
            step("Ukládáme data a restartujeme…", 0.75, "ukonceni")
            let helper = Process(); helper.executableURL = URL(fileURLWithPath: "/bin/sh")
            helper.arguments = ["-c", script, "agenteeq-update", String(ProcessInfo.processInfo.processIdentifier), current.path, fresh.path, work.path, backup.path, trash?.path ?? "", self.updateLogPath]
            helper.standardOutput = FileHandle.nullDevice; helper.standardError = FileHandle.nullDevice; helper.standardInput = FileHandle.nullDevice
            do { try helper.run() } catch { fail("Aktualizaci se nepodařilo spustit. Nic se nezměnilo."); return }
            // Server se zastaví tady, s časovým limitem, ne až uvnitř ukončení AppKitu.
            self.stopServerBounded()
            step("Spouštíme Agenteeq \(version)…", 0.9, "restart")
            DispatchQueue.main.async {
                self.armExitWatchdog(seconds: 6)
                NSApp.terminate(nil)
            }
        }
    }

    // Status/notifications come from our child process, not a throttled hidden webview.
    // Messages arrive only through the native-owned child stdout, never from a
    // browser navigation. If WKWebView is loading, retain the last requested
    // route instead of silently dropping a user click during app startup.
    var pendingAgentRoute: String?
    func applyPendingAgentRoute() {
        guard let route = pendingAgentRoute, !web.isLoading,
              let data = try? JSONSerialization.data(withJSONObject: [route]),
              let json = String(data: data, encoding: .utf8) else { return }
        pendingAgentRoute = nil
        web.evaluateJavaScript("location.hash=\(json)[0]")
    }

    func handleDesktopEvent(_ data: [String: Any]) {
        guard let type = data["type"] as? String else { return }
        if type == "badge", let count = data["count"] as? Int {
            NSApp.dockTile.badgeLabel = count > 0 ? String(min(count, 999)) : nil
            // Dock badge shows items needing attention; menu bar count is separate.
        }
        if type == "running-agents", let count = data["count"] as? Int {
            // Explicit zero matters: the menu bar must not retain a stale count.
            let active = max(0, min(count, 999))
            statusItem.button?.title = " \(active)"
            statusItem.button?.toolTip = "Agenteeq – aktivně pracující agenti: \(active)"
            statusItem.button?.setAccessibilityLabel("Agenteeq, aktivně pracující agenti: \(active)")
        }
        if type == "focus-agent", !quitting, !installing, let route = data["route"] as? String,
           route.hasPrefix("#/agent/"), route.utf8.count <= 600,
           !route.dropFirst("#/agent/".count).isEmpty,
           !route.dropFirst("#/agent/".count).contains("/") {
            // No process creation, shell execution or key transfer. Reuse the
            // existing authenticated WKWebView and bring its window forward.
            pendingAgentRoute = route
            showWindow()
            applyPendingAgentRoute()
        }
        if type == "owned-runs", let count = data["count"] as? Int { ownedRuns = max(0, count) }
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
    var terminateReplyPending = false
    var stoppingForQuit = false
    // Odhlášení, restart nebo vypnutí Macu nese v události důvod. Tam se neptáme – systém by čekal.
    var quitIsSystemInitiated: Bool {
        NSAppleEventManager.shared().currentAppleEvent?.attributeDescriptor(forKeyword: AEKeyword(0x7768_793F)) != nil // 'why?' = kAEQuitReason
    }
    func confirmQuitWithRunningAgents() -> Bool {
        let n = ownedRuns
        let agenti = n == 1 ? "1 agent spuštěný" : (2...4).contains(n) ? "\(n) agenti spuštění" : "\(n) agentů spuštěných"
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "Ukončit Agenteeq?"
        alert.informativeText = "Běží \(agenti) z Agenteeq. Ukončením je zastavíš. Agenti v Terminálu a jiných aplikacích poběží dál."
        alert.addButton(withTitle: "Ukončit")
        alert.addButton(withTitle: "Zrušit")
        NSApp.activate(ignoringOtherApps: true)
        return alert.runModal() == .alertFirstButtonReturn
    }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if !quitting, !installing, !qa, ownedRuns > 0, !quitIsSystemInitiated, !confirmQuitWithRunningAgents() {
            return .terminateCancel
        }
        quitting = true
        // Ukončení se nesmí zaseknout ani při zaseknutém serveru nebo ztracené odpovědi AppKitu.
        armExitWatchdog(seconds: 15)
        guard let process = child, process.isRunning else { return .terminateNow }
        // ⌘Q a Ukončit z Docku: server se zastaví mimo hlavní vlákno s pevným limitem a pak se
        // aplikace ukončí znovu – už bez běžícího serveru, tedy okamžitě. Na odpověď AppKitu
        // (terminateLater) se nečeká; v praxi se uměla ztratit a aplikace pak visela.
        // Odhlášení a vypnutí Macu nejde zrušit a znovu spustit, ty jdou cestou níže.
        if !quitIsSystemInitiated {
            if !stoppingForQuit {
                stoppingForQuit = true
                DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                    self?.stopServerBounded()
                    DispatchQueue.main.async { NSApp.terminate(nil) }
                }
            }
            return .terminateCancel
        }
        // Never allow a dead/unresponsive backend to trap the Dock Quit action.
        // AppKit's terminateLater uses a special runloop: do NOT wait on main,
        // or rely on a default-mode Timer as the only completion mechanism.
        terminateReplyPending = true
        let finish: () -> Void = { [weak self] in
            guard let self, self.terminateReplyPending else { return }
            self.terminateReplyPending = false
            NSApp.reply(toApplicationShouldTerminate: true)
        }
        process.terminationHandler = nil
        try? input?.fileHandleForWriting.close()
        if process.isRunning { process.terminate() }
        // SIGTERM is a graceful request; escalation must not block the UI.
        DispatchQueue.global().asyncAfter(deadline: .now() + 8) {
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
        }
        DispatchQueue.global().async {
            process.waitUntilExit()
            DispatchQueue.main.async(execute: finish)
        }
        // Even an uninterruptible child must not strand the native window
        // indefinitely. The OS will close remaining process-owned resources.
        DispatchQueue.main.asyncAfter(deadline: .now() + 12, execute: finish)
        return .terminateLater
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
