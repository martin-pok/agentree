// Plášť Agenteeq pro Windows – protějšek desktop/Agenteeq.swift.
//
// Dělá přesně tři věci, stejně jako ten na macOS:
//   1. spustí přibalený node.exe se souborem app/desktop/server.mjs,
//   2. čte z něj řádkový protokol „AGENTEEQ_DESKTOP {json}“,
//   3. ukáže rozhraní ve vlastním okně a doručí odznak a oznámení do systému.
//
// Jádro aplikace o plášti nic neví a vědět nemusí. Rozhraní posílá zprávy přes
// `window.webkit.messageHandlers.agenteeq` (WebKit), takže plášť podstrčí tvarově
// shodnou náhradu nad `chrome.webview` – aplikace se nepřizpůsobuje plášti, plášť
// se přizpůsobuje aplikaci.
//
// Co tu schválně není: žádná knihovna navíc. Stejně jako Swift verze sahá jen po tom,
// co je součástí systému (Win32, COM, WebView2). Zavaděč WebView2 je slinkovaný staticky,
// takže vedle .exe neleží žádná DLL.
//
// Běhové prostředí WebView2 je součástí Windows 11 a na Windows 10 ho přináší Edge.
// Když přesto chybí, okno to řekne česky a nabídne odkaz – nespadne.

// NOMINMAX musí padnout před windows.h, jinak se makra min/max stihnou nadefinovat
// a std::min z <algorithm> pak nejde zavolat.
#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <shellapi.h>
#include <dwmapi.h>
#include <wrl.h>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cwctype>
#include <memory>
#include <string>
#include <vector>

#include "WebView2.h"

using namespace Microsoft::WRL;

// Řetězec, který nám WebView2 předá k uvolnění přes CoTaskMemFree. Vlastní drobná
// obálka je tu proto, aby se kvůli jedné věci netahal další balíček (WIL).
class CoRetezec {
 public:
  CoRetezec() = default;
  ~CoRetezec() { if (p_) CoTaskMemFree(p_); }
  CoRetezec(const CoRetezec&) = delete;
  CoRetezec& operator=(const CoRetezec&) = delete;
  LPWSTR* operator&() { return &p_; }
  const wchar_t* get() const { return p_; }
  explicit operator bool() const { return p_ != nullptr; }

 private:
  LPWSTR p_ = nullptr;
};

// ── Konstanty, které drží vzhled a chování shodné se Swift verzí ─────────────

static const wchar_t* TRIDA_OKNA = L"AgenteeqDesktopWindow";
static const wchar_t* NAZEV = L"Agenteeq";
// Jmenný mutex drží jedinou instanci. Systém ho uklidí i po tvrdém ukončení procesu,
// takže tu není problém se zapomenutým zámkem po pádu.
static const wchar_t* MUTEX_JEDINACEK = L"Local\\cz.agenteeq.desktop.single";
static const wchar_t* MUTEX_JEDINACEK_QA = L"Local\\cz.agenteeq.desktop.qa.single";

// --backdrop ze stylů aplikace: „stůl“, na kterém karty leží. Okno má tuhle barvu
// v obou režimech vzhledu, protože je vidět jen při změně velikosti.
static const COLORREF BACKDROP = RGB(12, 11, 16);

static const int SIRKA = 1380, VYSKA = 920, MIN_SIRKA = 900, MIN_VYSKA = 620;

enum : UINT {
  ZPRAVA_RADEK = WM_APP + 1,      // wParam: std::wstring* s jedním řádkem protokolu
  ZPRAVA_KONEC_DITETE = WM_APP + 2,
  ZPRAVA_OZNAMENI = WM_APP + 3,   // ikona v oznamovací oblasti
};
static const UINT IKONA_ID = 1;

// ── Drobný parser JSON ───────────────────────────────────────────────────────
//
// Protokol posílá náš vlastní server přes JSON.stringify, takže tvar je známý a malý.
// I tak se čte pořádně, ne regulárním výrazem: uvozovka uvnitř textu oznámení by
// jinak rozhodila celou zprávu.

namespace json {

struct Hodnota {
  enum Druh { Nic, Text, Cislo, Pravda, Nepravda, Objekt } druh = Nic;
  std::wstring text;
  double cislo = 0;
  std::vector<std::pair<std::wstring, Hodnota>> polozky;

  const Hodnota* najdi(const wchar_t* klic) const {
    for (const auto& p : polozky) if (p.first == klic) return &p.second;
    return nullptr;
  }
  std::wstring textPod(const wchar_t* klic, const wchar_t* vychozi = L"") const {
    const Hodnota* h = najdi(klic);
    return h && h->druh == Text ? h->text : vychozi;
  }
  int cisloPod(const wchar_t* klic, int vychozi = 0) const {
    const Hodnota* h = najdi(klic);
    return h && h->druh == Cislo ? static_cast<int>(h->cislo) : vychozi;
  }
  bool pravdaPod(const wchar_t* klic) const {
    const Hodnota* h = najdi(klic);
    return h && h->druh == Pravda;
  }
};

class Ctecka {
 public:
  // Kopie, ne odkaz. Volá se to s dočasným řetězcem (radek.substr(...)), který by
  // odkazu zemřel pod rukama hned po vytvoření čtečky.
  explicit Ctecka(std::wstring s) : s_(std::move(s)) {}

  bool cti(Hodnota& out) { return ctiHodnotu(out); }

 private:
  const std::wstring s_;
  size_t i_ = 0;

  void preskocBile() { while (i_ < s_.size() && (s_[i_] == L' ' || s_[i_] == L'\t' || s_[i_] == L'\r' || s_[i_] == L'\n')) i_++; }

  bool ctiHodnotu(Hodnota& out) {
    preskocBile();
    if (i_ >= s_.size()) return false;
    wchar_t c = s_[i_];
    if (c == L'"') { out.druh = Hodnota::Text; return ctiText(out.text); }
    if (c == L'{') return ctiObjekt(out);
    if (c == L'[') return preskocPole();
    if (c == L't') { if (s_.compare(i_, 4, L"true") == 0) { i_ += 4; out.druh = Hodnota::Pravda; return true; } return false; }
    if (c == L'f') { if (s_.compare(i_, 5, L"false") == 0) { i_ += 5; out.druh = Hodnota::Nepravda; return true; } return false; }
    if (c == L'n') { if (s_.compare(i_, 4, L"null") == 0) { i_ += 4; out.druh = Hodnota::Nic; return true; } return false; }
    return ctiCislo(out);
  }

  bool ctiText(std::wstring& out) {
    if (i_ >= s_.size() || s_[i_] != L'"') return false;
    i_++;
    out.clear();
    while (i_ < s_.size()) {
      wchar_t c = s_[i_++];
      if (c == L'"') return true;
      if (c != L'\\') { out.push_back(c); continue; }
      if (i_ >= s_.size()) return false;
      wchar_t e = s_[i_++];
      switch (e) {
        case L'n': out.push_back(L'\n'); break;
        case L't': out.push_back(L'\t'); break;
        case L'r': out.push_back(L'\r'); break;
        case L'b': out.push_back(L'\b'); break;
        case L'f': out.push_back(L'\f'); break;
        case L'u': {
          if (i_ + 4 > s_.size()) return false;
          wchar_t kod = 0;
          for (int k = 0; k < 4; k++) {
            wchar_t h = s_[i_++];
            kod <<= 4;
            if (h >= L'0' && h <= L'9') kod |= (h - L'0');
            else if (h >= L'a' && h <= L'f') kod |= (h - L'a' + 10);
            else if (h >= L'A' && h <= L'F') kod |= (h - L'A' + 10);
            else return false;
          }
          out.push_back(kod);  // UTF-16 je nativní kódování Windows, náhradní páry projdou samy
          break;
        }
        default: out.push_back(e);  // \" \\ \/ a cokoli dalšího doslova
      }
    }
    return false;
  }

  bool ctiCislo(Hodnota& out) {
    size_t zacatek = i_;
    if (i_ < s_.size() && (s_[i_] == L'-' || s_[i_] == L'+')) i_++;
    while (i_ < s_.size() && (iswdigit(s_[i_]) || s_[i_] == L'.' || s_[i_] == L'e' || s_[i_] == L'E' || s_[i_] == L'-' || s_[i_] == L'+')) i_++;
    if (i_ == zacatek) return false;
    out.druh = Hodnota::Cislo;
    out.cislo = _wtof(s_.substr(zacatek, i_ - zacatek).c_str());
    return true;
  }

  bool ctiObjekt(Hodnota& out) {
    out.druh = Hodnota::Objekt;
    i_++;  // '{'
    preskocBile();
    if (i_ < s_.size() && s_[i_] == L'}') { i_++; return true; }
    for (;;) {
      preskocBile();
      std::wstring klic;
      if (!ctiText(klic)) return false;
      preskocBile();
      if (i_ >= s_.size() || s_[i_] != L':') return false;
      i_++;
      Hodnota hodnota;
      if (!ctiHodnotu(hodnota)) return false;
      out.polozky.emplace_back(std::move(klic), std::move(hodnota));
      preskocBile();
      if (i_ < s_.size() && s_[i_] == L',') { i_++; continue; }
      if (i_ < s_.size() && s_[i_] == L'}') { i_++; return true; }
      return false;
    }
  }

  bool preskocPole() {
    int hloubka = 0;
    bool vText = false;
    while (i_ < s_.size()) {
      wchar_t c = s_[i_++];
      if (vText) {
        if (c == L'\\') { i_++; continue; }
        if (c == L'"') vText = false;
        continue;
      }
      if (c == L'"') { vText = true; continue; }
      if (c == L'[' || c == L'{') hloubka++;
      if (c == L']' || c == L'}') { hloubka--; if (hloubka == 0) return true; }
    }
    return false;
  }
};

}  // namespace json

// ── Pomůcky ──────────────────────────────────────────────────────────────────

static std::wstring slozkaAplikace() {
  wchar_t cesta[MAX_PATH * 4] = {};
  GetModuleFileNameW(nullptr, cesta, _countof(cesta));
  std::wstring s(cesta);
  size_t lom = s.find_last_of(L'\\');
  return lom == std::wstring::npos ? L"." : s.substr(0, lom);
}

static std::wstring dataSlozka(const wchar_t* podslozka) {
  PWSTR zaklad = nullptr;
  std::wstring out;
  if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &zaklad))) {
    out = std::wstring(zaklad) + L"\\Agenteeq\\" + podslozka;
    CoTaskMemFree(zaklad);
    SHCreateDirectoryExW(nullptr, out.c_str(), nullptr);
  }
  return out;
}

// Do HTML jde i text chyby ze serveru. Escapování pro JavaScript na to nestačí:
// „<“ a „&“ by se braly jako značky. Stejné pravidlo jako esc() v rozhraní.
static std::wstring escapujProHtml(const std::wstring& s) {
  std::wstring out;
  for (wchar_t c : s) {
    switch (c) {
      case L'&': out += L"&amp;"; break;
      case L'<': out += L"&lt;"; break;
      case L'>': out += L"&gt;"; break;
      case L'"': out += L"&quot;"; break;
      case L'\'': out += L"&#39;"; break;
      default: out.push_back(c);
    }
  }
  return out;
}

static std::wstring escapujProJs(const std::wstring& s) {
  std::wstring out;
  for (wchar_t c : s) {
    if (c == L'\\' || c == L'\'' || c == L'"') { out.push_back(L'\\'); out.push_back(c); }
    else if (c == L'\n') out += L"\\n";
    else if (c == L'\r') out += L"\\r";
    else if (c < 32) { wchar_t buf[8]; swprintf_s(buf, L"\\u%04x", c); out += buf; }
    else out.push_back(c);
  }
  return out;
}

// ── Stránky, které ukazuje sám plášť ─────────────────────────────────────────
//
// Načítání i chyba jsou HTML, ne kreslené GDI. Důvod je praktický: typografie, barvy
// a odsazení pak sedí s aplikací na pixel, protože je to tentýž jazyk – a kódu je
// desetina. Stránka je úplná a bez odkazů ven; nic se nenačítá ze sítě.

static std::wstring strankaPlaste(const std::wstring& zprava, bool sTlacitkem) {
  std::wstring html =
      L"<!doctype html><html lang=\"cs\"><head><meta charset=\"utf-8\">"
      L"<style>"
      L"  :root { color-scheme: dark; }"
      L"  * { box-sizing: border-box; }"
      L"  html, body { height: 100%; margin: 0; }"
      L"  body { background: #16141D; color: #F4F3F7;"
      L"    font-family: 'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif;"
      L"    display: grid; place-items: center; text-align: center; padding: 32px;"
      L"    -webkit-user-select: none; user-select: none; cursor: default; }"
      L"  .kryt { max-width: 460px; }"
      L"  h1 { font-size: 42px; font-weight: 300; letter-spacing: -0.02em; margin: 0 0 24px; }"
      L"  p { font-size: 15px; font-weight: 400; line-height: 1.6; margin: 0;"
      L"    color: rgba(244, 243, 247, 0.75); }"
      L"  button { margin-top: 24px; font: inherit; font-size: 14px; font-weight: 500;"
      L"    color: #16141D; background: #F4F3F7; border: 0; border-radius: 8px;"
      L"    padding: 10px 20px; cursor: pointer; }"
      L"  button:hover { background: #fff; }"
      L"  button:focus-visible { outline: 2px solid #C99A3E; outline-offset: 2px; }"
      L"</style></head><body><div class=\"kryt\">"
      L"<h1>Agenteeq</h1><p>";
  html += escapujProHtml(zprava);
  html += L"</p>";
  if (sTlacitkem) {
    html +=
        L"<button type=\"button\" id=\"znovu\" autofocus>Zkusit znovu</button>"
        L"<script>document.getElementById('znovu').addEventListener('click',function(){"
        L"window.chrome.webview.postMessage({type:'retry'});});</script>";
  }
  html += L"</div></body></html>";
  return html;
}

// Náhrada za WebKit kanál. Aplikace volá window.webkit.messageHandlers.agenteeq.postMessage –
// plášť pro Windows jí ho podstrčí nad chrome.webview, aby se public/js nemuselo měnit.
// `is-windows` navíc říká stylům, že tu není průhledné záhlaví, pod které by obsah zajížděl.
//
// Pořadí je podstatné. WebView2 pouští tenhle skript hned při vzniku dokumentu, ještě než
// parser vytvoří <html> – document.documentElement je v tu chvíli null (na macOS se stejné
// třídy přidávají až v .atDocumentEnd). Kanál a příznak aplikace proto vznikají první a třídy
// se přidají, jakmile kořenový prvek existuje. Dřív skript na prvním řádku spadl a rozhraní
// na Windows pak nevědělo, že běží v aplikaci, a plášť od něj nedostal jedinou zprávu.
static const wchar_t* SKRIPT_MOSTU =
    L"window.agenteeqDesktop = true;"
    L"window.webkit = window.webkit || {};"
    L"window.webkit.messageHandlers = window.webkit.messageHandlers || {};"
    L"window.webkit.messageHandlers.agenteeq = {"
    L"  postMessage: function (m) { try { window.chrome.webview.postMessage(m); } catch (e) {} }"
    L"};"
    L"(function () {"
    L"  function oznac() {"
    L"    var h = document.documentElement;"
    L"    if (!h) return false;"
    L"    h.classList.add('is-desktop', 'is-windows');"
    L"    return true;"
    L"  }"
    L"  if (oznac()) return;"
    L"  new MutationObserver(function (zmeny, pozorovatel) { if (oznac()) pozorovatel.disconnect(); })"
    L"    .observe(document, { childList: true });"
    L"})();";

// Sonda pro kontrolu sestavené aplikace (scripts/qa-native.mjs). Pustí se jen v režimu QA
// s AGENTEEQ_DESKTOP_QA_REPORT. Popíše, co je v okně: rozhraní, navigaci, třídy pláště
// a jestli existuje kanál do pláště. Stejná sonda je v plášti pro macOS.
#define AGENTEEQ_QA_STAV                                                                         \
  L"(function(puvod){var v=document.querySelector('#view'),h=document.documentElement;"         \
  L"return {puvod:puvod,titulek:document.title,dokument:document.readyState,"                   \
  L"pohled:v?v.children.length:0,navigace:document.querySelectorAll('.sidebar .nav a').length," \
  L"desktop:!!h&&h.classList.contains('is-desktop'),windows:!!h&&h.classList.contains('is-windows')," \
  L"aplikace:window.agenteeqDesktop===true,"                                                     \
  L"most:!!(window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.agenteeq)," \
  L"kanal:!!(window.chrome&&window.chrome.webview),"                                             \
  L"trasa:location.hash,text:(document.body?document.body.innerText:'').slice(0,240)};})"
// Po „ready“ z rozhraní: po chvíli, kdy je obrazovka vykreslená, pošle stav zpátky kanálem.
// Tím se ověří i samotný kanál – stejnou cestou chodí přepnutí vzhledu a další zprávy.
static const wchar_t* QA_SONDA =
    L"setTimeout(function(){window.webkit.messageHandlers.agenteeq.postMessage("
    L"{type:'qa-sonda',sonda:" AGENTEEQ_QA_STAV L"('ready')});},1500);";
// Záloha pár sekund po dokončené navigaci: výsledek se vrátí přímo z ExecuteScript, takže
// hlášení řekne, co v okně je (chybová stránka, prázdno, rozhraní bez kanálu), i když
// kanál zpráv nefunguje – místo pouhého „nenačetlo se“.
static const wchar_t* QA_STAV_OKNA = AGENTEEQ_QA_STAV L"('navigace')";
static const UINT_PTR CASOVAC_QA_STAV = 4;

// Text do JSON řetězce pro hlášení kontroly.
static std::wstring jsonText(const std::wstring& s) {
  std::wstring out;
  for (wchar_t c : s) {
    if (c == L'"' || c == L'\\') { out.push_back(L'\\'); out.push_back(c); }
    else if (c < 0x20) { wchar_t buf[8]; swprintf(buf, 8, L"\\u%04x", static_cast<unsigned>(c)); out += buf; }
    else out.push_back(c);
  }
  return out;
}

// ── Aplikace ─────────────────────────────────────────────────────────────────

class Aplikace {
 public:
  int Spust(HINSTANCE instance);

 private:
  HINSTANCE instance_ = nullptr;
  HWND okno_ = nullptr;
  HANDLE mutex_ = nullptr;

  ComPtr<ICoreWebView2Controller> ovladac_;
  ComPtr<ICoreWebView2> web_;
  ComPtr<ITaskbarList3> hlavniPanel_;

  // Dítě: server v Node. Job object zaručí, že s pláštěm zmizí i všechno, co server spustil.
  PROCESS_INFORMATION dite_ = {};
  HANDLE job_ = nullptr;
  HANDLE vstupDitete_ = nullptr;   // zápis do stdin dítěte; zavření = pokyn k ukončení
  HANDLE vystupDitete_ = nullptr;  // čtení stdout dítěte
  HANDLE vlaknoCteni_ = nullptr;

  std::wstring zbytek_;            // nedočtený konec řádku mezi dvěma čteními
  std::wstring chyba_;             // poslední hlášená chyba serveru
  std::wstring adresa_;            // http://127.0.0.1:<port>
  int port_ = 0;
  int pokusy_ = 0;
  int generace_ = 0;
  bool koncime_ = false;
  bool qa_ = false;
  std::wstring qaZprava_;          // soubor pro hlášení kontroly (jen v režimu QA)
  int odznak_ = 0;
  HICON ikonaOdznaku_ = nullptr;
  std::wstring cestaOznameni_;     // kam skočit po kliknutí na oznámení

  static LRESULT CALLBACK Obsluha(HWND, UINT, WPARAM, LPARAM);
  LRESULT Zprava(HWND, UINT, WPARAM, LPARAM);

  bool VytvorOkno();
  void VytvorWebView();
  void PoVytvoreniWebView();
  void ZmenVelikost();
  void UkazStranku(const std::wstring& zprava, bool sTlacitkem);

  void SpustServer();
  void UkonciServer(bool pockej);
  void ZpracujRadek(const std::wstring& radek);
  void ZpracujUdalost(const json::Hodnota& zprava);

  void PridejIkonuDoOblasti();
  void ZmenOdznak(int pocet);
  void PosliOznameni(const std::wstring& titulek, const std::wstring& telo, const std::wstring& cesta);
  void UkazOkno();
  void Naviguj(const std::wstring& hash);
  void ZapisQa(const std::wstring& radek);
  void ZjistiStavOknaQa();
};

static Aplikace* g_app = nullptr;

// ── Okno ─────────────────────────────────────────────────────────────────────

LRESULT CALLBACK Aplikace::Obsluha(HWND okno, UINT zprava, WPARAM w, LPARAM l) {
  // Pozor na pořadí: WM_GETMINMAXINFO přijde dřív než WM_NCCREATE a dřív, než
  // CreateWindowExW vůbec vrátí popisovač. Kdyby se obsluha spoléhala na okno_,
  // sáhla by v tu chvíli do prázdna — proto se popisovač předává z parametru.
  if (!g_app) return DefWindowProcW(okno, zprava, w, l);
  if (zprava == WM_NCCREATE) g_app->okno_ = okno;
  return g_app->Zprava(okno, zprava, w, l);
}

LRESULT Aplikace::Zprava(HWND okno, UINT zprava, WPARAM w, LPARAM l) {
  switch (zprava) {
    case WM_SIZE:
      ZmenVelikost();
      return 0;

    case WM_GETMINMAXINFO: {
      // Minimální rozměr drží rozhraní použitelné; pod tím se karty lámou.
      auto* info = reinterpret_cast<MINMAXINFO*>(l);
      UINT dpi = okno ? GetDpiForWindow(okno) : 0;
      if (!dpi) dpi = 96;
      info->ptMinTrackSize.x = MulDiv(MIN_SIRKA, dpi, 96);
      info->ptMinTrackSize.y = MulDiv(MIN_VYSKA, dpi, 96);
      return 0;
    }

    case WM_ERASEBKGND: {
      // Bez tohohle při zvětšování okna problikne bílá, než WebView překreslí.
      RECT r;
      GetClientRect(okno, &r);
      HBRUSH stetec = CreateSolidBrush(BACKDROP);
      FillRect(reinterpret_cast<HDC>(w), &r, stetec);
      DeleteObject(stetec);
      return 1;
    }

    case WM_ACTIVATE:
      if (LOWORD(w) != WA_INACTIVE && ovladac_) ovladac_->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
      return 0;

    case ZPRAVA_RADEK: {
      std::unique_ptr<std::wstring> radek(reinterpret_cast<std::wstring*>(w));
      // Řádky z předchozí generace serveru se zahodí – jinak by doběhlé „ready“
      // ze zabitého procesu přepsalo adresu toho nového.
      if (static_cast<int>(l) == generace_) ZpracujRadek(*radek);
      return 0;
    }

    case ZPRAVA_KONEC_DITETE: {
      if (koncime_ || static_cast<int>(l) != generace_) return 0;
      UkonciServer(false);
      if (chyba_.empty() && pokusy_ < 3) {
        pokusy_++;
        SetTimer(okno_, 1, pokusy_ * 1000, nullptr);
        UkazStranku(L"Obnovujeme spojení s tvými agenty…", false);
      } else {
        UkazStranku(chyba_.empty() ? L"Spojení se nepodařilo obnovit. Zkus aplikaci spustit znovu." : chyba_, true);
      }
      return 0;
    }

    case WM_TIMER:
      if (w == 1) { KillTimer(okno_, 1); SpustServer(); return 0; }
      // Časovač 2 hlídá, že se server do minuty ozve; 3 nuluje počítadlo restartů.
      if (w == 2) {
        KillTimer(okno_, 2);
        if (adresa_.empty() && dite_.hProcess) {
          chyba_ = L"Načítání trvá příliš dlouho. Zkus to znovu; při opakovaném problému ověř přístup k souborům agentů.";
          UkonciServer(false);
          UkazStranku(chyba_, true);
        }
        return 0;
      }
      if (w == 3) { KillTimer(okno_, 3); if (dite_.hProcess) pokusy_ = 0; return 0; }
      if (w == CASOVAC_QA_STAV) { KillTimer(okno_, CASOVAC_QA_STAV); ZjistiStavOknaQa(); return 0; }
      break;

    case ZPRAVA_OZNAMENI:
      // Klik na ikonu i na samotné oznámení vede na stejné místo jako na macOS.
      if (LOWORD(l) == WM_LBUTTONUP || LOWORD(l) == NIN_SELECT) { UkazOkno(); return 0; }
      if (LOWORD(l) == NIN_BALLOONUSERCLICK) {
        UkazOkno();
        if (!cestaOznameni_.empty()) Naviguj(cestaOznameni_);
        return 0;
      }
      return 0;

    case WM_CLOSE:
      // Zavření okna aplikaci ukončí – na Windows se to tak čeká (na macOS ne).
      DestroyWindow(okno);
      return 0;

    case WM_DESTROY: {
      koncime_ = true;
      UkonciServer(true);
      // Ikona se odebírá tady, dokud okno ještě existuje. Po DestroyWindow už
      // Shell_NotifyIcon nemá co adresovat a ikona by v oblasti zůstala viset.
      NOTIFYICONDATAW ikona = {};
      ikona.cbSize = sizeof(ikona);
      ikona.hWnd = okno;
      ikona.uID = IKONA_ID;
      Shell_NotifyIconW(NIM_DELETE, &ikona);
      PostQuitMessage(0);
      return 0;
    }
  }
  return DefWindowProcW(okno, zprava, w, l);
}

bool Aplikace::VytvorOkno() {
  WNDCLASSEXW trida = {};
  trida.cbSize = sizeof(trida);
  trida.style = CS_HREDRAW | CS_VREDRAW;
  trida.lpfnWndProc = Obsluha;
  trida.hInstance = instance_;
  trida.hCursor = LoadCursorW(nullptr, IDC_ARROW);
  trida.hbrBackground = CreateSolidBrush(BACKDROP);
  trida.lpszClassName = TRIDA_OKNA;
  trida.hIcon = LoadIconW(instance_, MAKEINTRESOURCEW(1));
  trida.hIconSm = trida.hIcon;
  if (!RegisterClassExW(&trida)) return false;

  okno_ = CreateWindowExW(0, TRIDA_OKNA, NAZEV, WS_OVERLAPPEDWINDOW,
                          CW_USEDEFAULT, CW_USEDEFAULT, SIRKA, VYSKA,
                          nullptr, nullptr, instance_, nullptr);
  if (!okno_) return false;

  // Tmavé záhlaví a zaoblené rohy: okno pak vypadá jako součást aplikace, ne jako
  // světlý rámeček kolem tmavého obsahu. Obojí Windows starší než 10 1809 ignorují,
  // takže se návratová hodnota nekontroluje – jen se to na nich neprojeví.
  BOOL tmave = TRUE;
  DwmSetWindowAttribute(okno_, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, &tmave, sizeof(tmave));
  DwmSetWindowAttribute(okno_, 19 /* starší jméno téhož atributu */, &tmave, sizeof(tmave));
  COLORREF barvaZahlavi = BACKDROP;
  DwmSetWindowAttribute(okno_, 35 /* DWMWA_CAPTION_COLOR */, &barvaZahlavi, sizeof(barvaZahlavi));
  DWORD rohy = 2 /* DWMWCP_ROUND */;
  DwmSetWindowAttribute(okno_, 33 /* DWMWA_WINDOW_CORNER_PREFERENCE */, &rohy, sizeof(rohy));

  PridejIkonuDoOblasti();
  return true;
}

void Aplikace::ZmenVelikost() {
  if (!ovladac_) return;
  RECT r;
  GetClientRect(okno_, &r);
  ovladac_->put_Bounds(r);
}

void Aplikace::UkazOkno() {
  if (!okno_) return;
  if (IsIconic(okno_)) ShowWindow(okno_, SW_RESTORE);
  ShowWindow(okno_, SW_SHOW);
  SetForegroundWindow(okno_);
}

void Aplikace::Naviguj(const std::wstring& hash) {
  if (!web_ || hash.rfind(L"#/", 0) != 0) return;
  std::wstring skript = L"location.hash='" + escapujProJs(hash) + L"';";
  web_->ExecuteScript(skript.c_str(), nullptr);
}

void Aplikace::UkazStranku(const std::wstring& zprava, bool sTlacitkem) {
  if (!web_) return;
  web_->NavigateToString(strankaPlaste(zprava, sTlacitkem).c_str());
}

// ── Ikona v oznamovací oblasti a odznak ──────────────────────────────────────

void Aplikace::PridejIkonuDoOblasti() {
  NOTIFYICONDATAW data = {};
  data.cbSize = sizeof(data);
  data.hWnd = okno_;
  data.uID = IKONA_ID;
  data.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP | NIF_SHOWTIP;
  data.uCallbackMessage = ZPRAVA_OZNAMENI;
  data.hIcon = LoadIconW(instance_, MAKEINTRESOURCEW(1));
  wcscpy_s(data.szTip, L"Agenteeq – zobrazit přehled");
  Shell_NotifyIconW(NIM_ADD, &data);
  data.uVersion = NOTIFYICON_VERSION_4;
  Shell_NotifyIconW(NIM_SETVERSION, &data);
}

// Odznak na ikoně v hlavním panelu, protějšek NSApp.dockTile.badgeLabel.
// Kreslí se do malé bitmapy: kolečko v barvě rozhodnutí (--velvet) a počet.
void Aplikace::ZmenOdznak(int pocet) {
  odznak_ = pocet;
  if (!hlavniPanel_) return;

  if (ikonaOdznaku_) { DestroyIcon(ikonaOdznaku_); ikonaOdznaku_ = nullptr; }
  if (pocet <= 0) { hlavniPanel_->SetOverlayIcon(okno_, nullptr, nullptr); return; }

  const int velikost = 32;
  HDC obrazovka = GetDC(nullptr);
  HDC pamet = CreateCompatibleDC(obrazovka);
  BITMAPINFO info = {};
  info.bmiHeader.biSize = sizeof(info.bmiHeader);
  info.bmiHeader.biWidth = velikost;
  info.bmiHeader.biHeight = -velikost;  // shora dolů
  info.bmiHeader.biPlanes = 1;
  info.bmiHeader.biBitCount = 32;
  info.bmiHeader.biCompression = BI_RGB;
  void* body = nullptr;
  HBITMAP barvy = CreateDIBSection(pamet, &info, DIB_RGB_COLORS, &body, nullptr, 0);
  HGDIOBJ puvodni = SelectObject(pamet, barvy);

  HBRUSH stetec = CreateSolidBrush(RGB(0xC2, 0x33, 0x5A));  // --velvet: barva rozhodnutí
  HPEN pero = CreatePen(PS_NULL, 0, 0);
  HGDIOBJ stary = SelectObject(pamet, stetec);
  HGDIOBJ staryPero = SelectObject(pamet, pero);
  Ellipse(pamet, 0, 0, velikost, velikost);
  SelectObject(pamet, stary);
  SelectObject(pamet, staryPero);
  DeleteObject(stetec);
  DeleteObject(pero);

  wchar_t text[8];
  if (pocet > 99) wcscpy_s(text, L"99+"); else swprintf_s(text, L"%d", pocet);
  HFONT pismo = CreateFontW(pocet > 99 ? 15 : 20, 0, 0, 0, FW_MEDIUM, FALSE, FALSE, FALSE,
                            DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                            CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");
  HGDIOBJ staryFont = SelectObject(pamet, pismo);
  SetBkMode(pamet, TRANSPARENT);
  SetTextColor(pamet, RGB(255, 255, 255));
  RECT r = {0, 0, velikost, velikost};
  DrawTextW(pamet, text, -1, &r, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
  SelectObject(pamet, staryFont);
  DeleteObject(pismo);

  // GDI kreslí bez alfa kanálu; kolečko se udělá neprůhledné a zbytek průhledný.
  auto* pixely = static_cast<DWORD*>(body);
  for (int y = 0; y < velikost; y++) {
    for (int x = 0; x < velikost; x++) {
      DWORD& p = pixely[y * velikost + x];
      p = (p & 0x00FFFFFF) ? (p | 0xFF000000) : 0;
    }
  }

  // Bitmapa musí být z kontextu odvybraná dřív, než se z ní udělá ikona – jinak
  // nemusí být kresba dokončená a v odznaku by chyběly čáry.
  SelectObject(pamet, puvodni);
  GdiFlush();

  ICONINFO ikona = {};
  ikona.fIcon = TRUE;
  ikona.hbmColor = barvy;
  ikona.hbmMask = CreateBitmap(velikost, velikost, 1, 1, nullptr);
  ikonaOdznaku_ = CreateIconIndirect(&ikona);
  DeleteObject(ikona.hbmMask);
  DeleteObject(barvy);
  DeleteDC(pamet);
  ReleaseDC(nullptr, obrazovka);

  wchar_t popis[64];
  swprintf_s(popis, L"%d čeká na rozhodnutí", std::min(pocet, 999));
  hlavniPanel_->SetOverlayIcon(okno_, ikonaOdznaku_, popis);

  // Tooltip ikony v oznamovací oblasti nese totéž číslo, stejně jako titulek na macOS.
  NOTIFYICONDATAW data = {};
  data.cbSize = sizeof(data);
  data.hWnd = okno_;
  data.uID = IKONA_ID;
  data.uFlags = NIF_TIP | NIF_SHOWTIP;
  swprintf_s(data.szTip, L"Agenteeq – %d čeká na rozhodnutí", std::min(pocet, 999));
  Shell_NotifyIconW(NIM_MODIFY, &data);
}

void Aplikace::PosliOznameni(const std::wstring& titulek, const std::wstring& telo, const std::wstring& cesta) {
  if (qa_) return;  // v QA se nikdy neposílá nic do systému
  cestaOznameni_ = cesta;
  NOTIFYICONDATAW data = {};
  data.cbSize = sizeof(data);
  data.hWnd = okno_;
  data.uID = IKONA_ID;
  data.uFlags = NIF_INFO;
  data.dwInfoFlags = NIIF_USER | NIIF_LARGE_ICON;
  wcsncpy_s(data.szInfoTitle, titulek.substr(0, 63).c_str(), _TRUNCATE);
  wcsncpy_s(data.szInfo, telo.substr(0, 255).c_str(), _TRUNCATE);
  Shell_NotifyIconW(NIM_MODIFY, &data);
}

// ── Server v Node ────────────────────────────────────────────────────────────

// Čtecí vlákno: blokující ReadFile a každý hotový řádek pošle do okna.
// Rozdělovat řádky musí vlákno samo, protože roura nezaručuje, že jedno čtení
// odpovídá jednomu řádku.
struct KontextCteni {
  HANDLE roura;
  HWND okno;
  int generace;
};

// Roura patří vláknu: zavře ji, až samo skončí. Kdyby ji zavíral někdo jiný,
// zavíral by popisovač, na kterém vlákno právě blokuje v ReadFile.
static DWORD WINAPI VlaknoCteni(LPVOID parametr) {
  std::unique_ptr<KontextCteni> ctx(static_cast<KontextCteni*>(parametr));
  std::string bajty;
  char buf[4096];
  DWORD precteno = 0;
  for (;;) {
    if (!ReadFile(ctx->roura, buf, sizeof(buf), &precteno, nullptr) || precteno == 0) break;
    bajty.append(buf, precteno);
    size_t konec;
    while ((konec = bajty.find('\n')) != std::string::npos) {
      std::string radek = bajty.substr(0, konec);
      bajty.erase(0, konec + 1);
      if (!radek.empty() && radek.back() == '\r') radek.pop_back();
      if (radek.empty()) continue;
      int potreba = MultiByteToWideChar(CP_UTF8, 0, radek.c_str(), static_cast<int>(radek.size()), nullptr, 0);
      auto* siroky = new std::wstring(potreba, L'\0');
      MultiByteToWideChar(CP_UTF8, 0, radek.c_str(), static_cast<int>(radek.size()), &(*siroky)[0], potreba);
      if (!PostMessageW(ctx->okno, ZPRAVA_RADEK, reinterpret_cast<WPARAM>(siroky), ctx->generace)) delete siroky;
    }
  }
  CloseHandle(ctx->roura);
  PostMessageW(ctx->okno, ZPRAVA_KONEC_DITETE, 0, ctx->generace);
  return 0;
}

void Aplikace::SpustServer() {
  if (koncime_ || dite_.hProcess) return;
  generace_++;
  chyba_.clear();
  adresa_.clear();
  port_ = 0;
  zbytek_.clear();
  UkazStranku(pokusy_ == 0 ? L"Připravujeme tvůj pracovní prostor…" : L"Obnovujeme spojení s tvými agenty…", false);

  const std::wstring zaklad = slozkaAplikace();
  const std::wstring node = zaklad + L"\\node.exe";
  const std::wstring skript = zaklad + L"\\app\\desktop\\server.mjs";
  const std::wstring pracovni = zaklad + L"\\app";

  if (GetFileAttributesW(node.c_str()) == INVALID_FILE_ATTRIBUTES) {
    chyba_ = L"Aplikaci se nepodařilo spustit. Rozbal celou složku Agenteeq a zkus to znovu.";
    UkazStranku(chyba_, true);
    return;
  }

  SECURITY_ATTRIBUTES sa = {sizeof(sa), nullptr, TRUE};
  HANDLE vystupZapis = nullptr, vstupCteni = nullptr;
  if (!CreatePipe(&vystupDitete_, &vystupZapis, &sa, 0) ||
      !CreatePipe(&vstupCteni, &vstupDitete_, &sa, 0)) {
    chyba_ = L"Aplikaci se nepodařilo spustit (roura). Zkus to znovu.";
    UkazStranku(chyba_, true);
    return;
  }
  SetHandleInformation(vystupDitete_, HANDLE_FLAG_INHERIT, 0);
  SetHandleInformation(vstupDitete_, HANDLE_FLAG_INHERIT, 0);

  // Prostředí: zkopíruje se současné a přepíšou se naše klíče. Stejné hodnoty
  // jako ve Swift verzi – jádro se tak chová na obou systémech identicky.
  std::wstring prostredi;
  {
    wchar_t* puvodni = GetEnvironmentStringsW();
    const wchar_t* nase[] = {L"AGENTEEQ_NATIVE_NOTIFY=", L"AGENTEEQ_QUIET=", L"AGENTEEQ_DESKTOP=", L"AGENTEEQ_PARENT_PID="};
    for (wchar_t* p = puvodni; p && *p; p += wcslen(p) + 1) {
      bool prepsat = false;
      for (const wchar_t* klic : nase) if (_wcsnicmp(p, klic, wcslen(klic)) == 0) prepsat = true;
      if (!prepsat) { prostredi.append(p); prostredi.push_back(L'\0'); }
    }
    if (puvodni) FreeEnvironmentStringsW(puvodni);
    wchar_t pid[32];
    swprintf_s(pid, L"%lu", GetCurrentProcessId());
    // Oznámení posílá plášť (umí je nasměrovat na správné místo po kliknutí), ne jádro.
    prostredi += L"AGENTEEQ_NATIVE_NOTIFY=0"; prostredi.push_back(L'\0');
    prostredi += L"AGENTEEQ_QUIET=1"; prostredi.push_back(L'\0');
    prostredi += L"AGENTEEQ_DESKTOP=1"; prostredi.push_back(L'\0');
    prostredi += std::wstring(L"AGENTEEQ_PARENT_PID=") + pid; prostredi.push_back(L'\0');
    prostredi.push_back(L'\0');
  }

  std::wstring prikaz = L"\"" + node + L"\" \"" + skript + L"\"";
  STARTUPINFOW si = {};
  si.cb = sizeof(si);
  si.dwFlags = STARTF_USESTDHANDLES;
  si.hStdOutput = vystupZapis;
  si.hStdError = vystupZapis;
  si.hStdInput = vstupCteni;

  BOOL ok = CreateProcessW(node.c_str(), &prikaz[0], nullptr, nullptr, TRUE,
                           CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT | CREATE_SUSPENDED,
                           &prostredi[0], pracovni.c_str(), &si, &dite_);
  CloseHandle(vystupZapis);
  CloseHandle(vstupCteni);
  if (!ok) {
    dite_ = {};
    CloseHandle(vystupDitete_); vystupDitete_ = nullptr;
    CloseHandle(vstupDitete_); vstupDitete_ = nullptr;
    chyba_ = L"Aplikaci se nepodařilo spustit. Rozbal celou složku Agenteeq a zkus to znovu.";
    UkazStranku(chyba_, true);
    return;
  }

  // Job object: Windows neukončuje strom procesů s rodičem. Bez tohohle by po zavření
  // aplikace zůstal běžet server i všechno, co spustil – přesně ty „osiřelé“ procesy,
  // proti kterým se na macOS brání skupinou procesů.
  if (!job_) {
    job_ = CreateJobObjectW(nullptr, nullptr);
    if (job_) {
      JOBOBJECT_EXTENDED_LIMIT_INFORMATION limit = {};
      limit.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
      SetInformationJobObject(job_, JobObjectExtendedLimitInformation, &limit, sizeof(limit));
    }
  }
  if (job_) AssignProcessToJobObject(job_, dite_.hProcess);
  ResumeThread(dite_.hThread);

  auto* ctx = new KontextCteni{vystupDitete_, okno_, generace_};
  vlaknoCteni_ = CreateThread(nullptr, 0, VlaknoCteni, ctx, 0, nullptr);
  if (vlaknoCteni_) {
    vystupDitete_ = nullptr;  // od téhle chvíle roura patří vláknu
  } else {
    delete ctx;
    CloseHandle(vystupDitete_);
    vystupDitete_ = nullptr;
  }

  SetTimer(okno_, 2, 60000, nullptr);  // do minuty se musí ozvat
}

void Aplikace::UkonciServer(bool pockej) {
  KillTimer(okno_, 2);
  KillTimer(okno_, 3);
  if (vstupDitete_) {
    // Zavření stdin je pokyn k ukončení – desktop/server.mjs ho hlídá stejně
    // pečlivě jako SIGTERM na macOS. Signály Windows nedoručuje.
    CloseHandle(vstupDitete_);
    vstupDitete_ = nullptr;
  }
  if (dite_.hProcess) {
    if (pockej) {
      if (WaitForSingleObject(dite_.hProcess, 10000) == WAIT_TIMEOUT) TerminateProcess(dite_.hProcess, 1);
    }
    CloseHandle(dite_.hProcess);
    CloseHandle(dite_.hThread);
    dite_ = {};
  }
  // vystupDitete_ se tu nezavírá — po předání vláknu je nullptr a zavře si ji samo.
  if (vlaknoCteni_) { CloseHandle(vlaknoCteni_); vlaknoCteni_ = nullptr; }
}

void Aplikace::ZpracujRadek(const std::wstring& radek) {
  const std::wstring predpona = L"AGENTEEQ_DESKTOP ";
  if (radek.rfind(predpona, 0) != 0) return;
  json::Hodnota zprava;
  json::Ctecka ctecka(radek.substr(predpona.size()));
  if (!ctecka.cti(zprava) || zprava.druh != json::Hodnota::Objekt) return;

  const std::wstring chyba = zprava.textPod(L"error");
  if (!chyba.empty()) chyba_ = chyba;

  ZpracujUdalost(zprava);

  if (zprava.pravdaPod(L"ready")) {
    port_ = zprava.cisloPod(L"port");
    if (port_ > 0 && web_) {
      adresa_ = L"http://127.0.0.1:" + std::to_wstring(port_);
      web_->Navigate(adresa_.c_str());
      ZapisQa(L"{\"udalost\":\"server\",\"port\":" + std::to_wstring(port_) + L"}");
      KillTimer(okno_, 2);
      // Když server vydrží minutu, počítadlo restartů se vynuluje – jinak by
      // aplikace běžící týdny po třetím náhodném pádu zůstala viset.
      SetTimer(okno_, 3, 60000, nullptr);
    }
  }
}

void Aplikace::ZpracujUdalost(const json::Hodnota& zprava) {
  const std::wstring druh = zprava.textPod(L"type");
  if (druh == L"badge") {
    ZmenOdznak(zprava.cisloPod(L"count"));
    return;
  }
  if (druh == L"notification") {
    const std::wstring titulek = zprava.textPod(L"title");
    if (titulek.empty()) return;
    std::wstring cesta = zprava.textPod(L"route", L"#/upozorneni");
    if (cesta.rfind(L"#/", 0) != 0) cesta = L"#/upozorneni";
    PosliOznameni(titulek, zprava.textPod(L"body"), cesta);
  }
}

// ── WebView2 ─────────────────────────────────────────────────────────────────

void Aplikace::VytvorWebView() {
  const std::wstring slozkaDat = dataSlozka(qa_ ? L"WebView2-QA" : L"WebView2");
  HRESULT hr = CreateCoreWebView2EnvironmentWithOptions(
      nullptr, slozkaDat.empty() ? nullptr : slozkaDat.c_str(), nullptr,
      Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
          [this](HRESULT vysledek, ICoreWebView2Environment* prostredi) -> HRESULT {
            if (FAILED(vysledek) || !prostredi) {
              MessageBoxW(okno_,
                          L"Agenteeq potřebuje běhové prostředí WebView2 od Microsoftu.\n\n"
                          L"Na Windows 11 je součástí systému, na Windows 10 ho přináší Microsoft Edge.\n"
                          L"Nainstaluj Edge nebo „Evergreen WebView2 Runtime“ a spusť Agenteeq znovu.",
                          L"Agenteeq", MB_OK | MB_ICONWARNING);
              PostQuitMessage(1);
              return S_OK;
            }
            prostredi->CreateCoreWebView2Controller(
                okno_,
                Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                    [this](HRESULT vysledek, ICoreWebView2Controller* ovladac) -> HRESULT {
                      if (FAILED(vysledek) || !ovladac) { PostQuitMessage(1); return S_OK; }
                      ovladac_ = ovladac;
                      ovladac_->get_CoreWebView2(&web_);
                      PoVytvoreniWebView();
                      return S_OK;
                    })
                    .Get());
            return S_OK;
          })
          .Get());
  if (FAILED(hr)) PostQuitMessage(1);
}

void Aplikace::PoVytvoreniWebView() {
  if (!web_) return;

  ComPtr<ICoreWebView2Settings> nastaveni;
  if (SUCCEEDED(web_->get_Settings(&nastaveni)) && nastaveni) {
    nastaveni->put_AreDevToolsEnabled(qa_ ? TRUE : FALSE);
    nastaveni->put_IsStatusBarEnabled(FALSE);
    nastaveni->put_AreDefaultContextMenusEnabled(TRUE);
    nastaveni->put_IsZoomControlEnabled(TRUE);
  }

  web_->AddScriptToExecuteOnDocumentCreated(SKRIPT_MOSTU, nullptr);

  // Navigace ven z aplikace se nikdy neděje uvnitř okna. Odkaz na web se otevře
  // v prohlížeči, všechno ostatní se zahodí – stejné pravidlo jako na macOS.
  EventRegistrationToken token;
  web_->add_NavigationStarting(
      Callback<ICoreWebView2NavigationStartingEventHandler>(
          [this](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* args) -> HRESULT {
            CoRetezec url;
            if (FAILED(args->get_Uri(&url)) || !url) return S_OK;
            const std::wstring adresa(url.get());
            if (adresa.rfind(L"about:", 0) == 0 || adresa.rfind(L"data:", 0) == 0) return S_OK;
            if (!adresa_.empty() && adresa.rfind(adresa_, 0) == 0) return S_OK;
            args->put_Cancel(TRUE);
            if (adresa.rfind(L"https://", 0) == 0 || adresa.rfind(L"mailto:", 0) == 0) {
              ShellExecuteW(nullptr, L"open", adresa.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
            }
            return S_OK;
          })
          .Get(),
      &token);

  web_->add_NewWindowRequested(
      Callback<ICoreWebView2NewWindowRequestedEventHandler>(
          [this](ICoreWebView2*, ICoreWebView2NewWindowRequestedEventArgs* args) -> HRESULT {
            CoRetezec url;
            args->put_Handled(TRUE);
            if (FAILED(args->get_Uri(&url)) || !url) return S_OK;
            const std::wstring adresa(url.get());
            if (!adresa_.empty() && adresa.rfind(adresa_, 0) == 0) { web_->Navigate(adresa.c_str()); return S_OK; }
            if (adresa.rfind(L"https://", 0) == 0 || adresa.rfind(L"mailto:", 0) == 0) {
              ShellExecuteW(nullptr, L"open", adresa.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
            }
            return S_OK;
          })
          .Get(),
      &token);

  // Zprávy z rozhraní: „ready“ (stránka stojí) a „appearance“ (přepnutý vzhled).
  // Přijímají se jen z naší adresy nebo z vlastní stránky pláště.
  web_->add_WebMessageReceived(
      Callback<ICoreWebView2WebMessageReceivedEventHandler>(
          [this](ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs* args) -> HRESULT {
            CoRetezec zdroj;
            if (SUCCEEDED(args->get_Source(&zdroj)) && zdroj) {
              const std::wstring odkud(zdroj.get());
              const bool zAplikace = !adresa_.empty() && odkud.rfind(adresa_, 0) == 0;
              const bool zPlaste = odkud.rfind(L"about:", 0) == 0 || odkud.rfind(L"data:", 0) == 0;
              if (!zAplikace && !zPlaste) {
                if (!qaZprava_.empty()) ZapisQa(L"{\"udalost\":\"zprava-odmitnuta\",\"zdroj\":\"" + jsonText(odkud) + L"\"}");
                return S_OK;
              }
            }
            CoRetezec telo;
            if (FAILED(args->get_WebMessageAsJson(&telo)) || !telo) return S_OK;
            json::Hodnota zprava;
            json::Ctecka ctecka(std::wstring(telo.get()));
            if (!ctecka.cti(zprava) || zprava.druh != json::Hodnota::Objekt) return S_OK;
            const std::wstring druh = zprava.textPod(L"type");
            if (!qaZprava_.empty() && druh != L"qa-sonda") ZapisQa(L"{\"udalost\":\"zprava\",\"typ\":\"" + jsonText(druh) + L"\"}");
            if (druh == L"retry" && !dite_.hProcess) { pokusy_ = 0; SpustServer(); }
            if (!qaZprava_.empty() && druh == L"ready") web_->ExecuteScript(QA_SONDA, nullptr);
            if (!qaZprava_.empty() && druh == L"qa-sonda") {
              ZapisQa(L"{\"udalost\":\"nacteno\",\"zprava\":" + std::wstring(telo.get()) + L"}");
            }
            return S_OK;
          })
          .Get(),
      &token);

  // Kontrola sestavené aplikace: výsledek každé navigace a záložní sonda po ní.
  if (!qaZprava_.empty()) {
    web_->add_NavigationCompleted(
        Callback<ICoreWebView2NavigationCompletedEventHandler>(
            [this](ICoreWebView2* odesilatel, ICoreWebView2NavigationCompletedEventArgs* args) -> HRESULT {
              BOOL uspech = FALSE;
              COREWEBVIEW2_WEB_ERROR_STATUS stav = COREWEBVIEW2_WEB_ERROR_STATUS_UNKNOWN;
              args->get_IsSuccess(&uspech);
              args->get_WebErrorStatus(&stav);
              CoRetezec zdroj;
              std::wstring adresa;
              if (SUCCEEDED(odesilatel->get_Source(&zdroj)) && zdroj) adresa = zdroj.get();
              ZapisQa(L"{\"udalost\":\"navigace\",\"ok\":" + std::wstring(uspech ? L"true" : L"false") +
                      L",\"stav\":" + std::to_wstring(static_cast<int>(stav)) + L",\"adresa\":\"" + jsonText(adresa.substr(0, 80)) + L"\"}");
              if (!adresa_.empty() && adresa.rfind(adresa_, 0) == 0) SetTimer(okno_, CASOVAC_QA_STAV, 5000, nullptr);
              return S_OK;
            })
            .Get(),
        &token);
  }

  // Když spadne vykreslovací proces stránky, nesmí zůstat prázdné okno.
  web_->add_ProcessFailed(
      Callback<ICoreWebView2ProcessFailedEventHandler>(
          [this](ICoreWebView2*, ICoreWebView2ProcessFailedEventArgs*) -> HRESULT {
            if (!adresa_.empty() && !koncime_) web_->Navigate(adresa_.c_str());
            return S_OK;
          })
          .Get(),
      &token);

  ZmenVelikost();
  UkazStranku(L"Připravujeme tvůj pracovní prostor…", false);
  SpustServer();
}

// ── Start ────────────────────────────────────────────────────────────────────

int Aplikace::Spust(HINSTANCE instance) {
  instance_ = instance;
  qa_ = GetEnvironmentVariableW(L"AGENTEEQ_DESKTOP_QA", nullptr, 0) > 0;
  if (qa_) {
    const DWORD delka = GetEnvironmentVariableW(L"AGENTEEQ_DESKTOP_QA_REPORT", nullptr, 0);
    if (delka > 1) {
      qaZprava_.resize(delka);
      GetEnvironmentVariableW(L"AGENTEEQ_DESKTOP_QA_REPORT", &qaZprava_[0], delka);
      qaZprava_.resize(delka - 1);
    }
  }

  // Jediná instance. Poražený jen vyzdvihne okno vítěze a skončí – stejně jako na macOS.
  mutex_ = CreateMutexW(nullptr, TRUE, qa_ ? MUTEX_JEDINACEK_QA : MUTEX_JEDINACEK);
  if (!mutex_ || GetLastError() == ERROR_ALREADY_EXISTS) {
    if (HWND uzBezi = FindWindowW(TRIDA_OKNA, nullptr)) {
      if (IsIconic(uzBezi)) ShowWindow(uzBezi, SW_RESTORE);
      SetForegroundWindow(uzBezi);
    }
    return 0;
  }

  if (FAILED(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED))) return 1;
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

  if (!VytvorOkno()) return 1;
  if (SUCCEEDED(CoCreateInstance(CLSID_TaskbarList, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&hlavniPanel_)))) {
    // Bez HrInit() rozhraní existuje, ale SetOverlayIcon tiše nic neudělá.
    if (FAILED(hlavniPanel_->HrInit())) hlavniPanel_.Reset();
  }

  ShowWindow(okno_, SW_SHOW);
  UpdateWindow(okno_);
  VytvorWebView();

  MSG zprava;
  while (GetMessageW(&zprava, nullptr, 0, 0) > 0) {
    TranslateMessage(&zprava);
    DispatchMessageW(&zprava);
  }

  NOTIFYICONDATAW ikona = {};
  ikona.cbSize = sizeof(ikona);
  ikona.hWnd = okno_;
  ikona.uID = IKONA_ID;
  Shell_NotifyIconW(NIM_DELETE, &ikona);
  if (ikonaOdznaku_) DestroyIcon(ikonaOdznaku_);
  if (job_) CloseHandle(job_);  // s ním zmizí i všechno, co server spustil
  CoUninitialize();
  return static_cast<int>(zprava.wParam);
}

// Jeden řádek JSON na konec souboru hlášení. Soubor se pokaždé otevře a zavře, aby ho
// kontrolní skript mohl číst, zatímco aplikace běží.
void Aplikace::ZapisQa(const std::wstring& radek) {
  if (qaZprava_.empty()) return;
  const std::wstring sKoncem = radek + L"\n";
  const int bajtu = WideCharToMultiByte(CP_UTF8, 0, sKoncem.c_str(), static_cast<int>(sKoncem.size()), nullptr, 0, nullptr, nullptr);
  if (bajtu <= 0) return;
  std::string utf8(static_cast<size_t>(bajtu), '\0');
  WideCharToMultiByte(CP_UTF8, 0, sKoncem.c_str(), static_cast<int>(sKoncem.size()), &utf8[0], bajtu, nullptr, nullptr);
  HANDLE soubor = CreateFileW(qaZprava_.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr,
                              OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (soubor == INVALID_HANDLE_VALUE) return;
  DWORD zapsano = 0;
  WriteFile(soubor, utf8.data(), static_cast<DWORD>(utf8.size()), &zapsano, nullptr);
  CloseHandle(soubor);
}

// Záložní sonda kontroly: stav okna přímo z výsledku skriptu, bez kanálu zpráv.
void Aplikace::ZjistiStavOknaQa() {
  if (!web_ || qaZprava_.empty()) return;
  web_->ExecuteScript(
      QA_STAV_OKNA,
      Callback<ICoreWebView2ExecuteScriptCompletedHandler>(
          [this](HRESULT chyba, LPCWSTR vysledek) -> HRESULT {
            const std::wstring stav = SUCCEEDED(chyba) && vysledek && *vysledek ? std::wstring(vysledek) : L"null";
            ZapisQa(L"{\"udalost\":\"stav-okna\",\"chyba\":" + std::to_wstring(static_cast<long>(chyba)) +
                    L",\"sonda\":" + stav + L"}");
            return S_OK;
          })
          .Get());
}

int APIENTRY wWinMain(HINSTANCE instance, HINSTANCE, LPWSTR, int) {
  Aplikace aplikace;
  g_app = &aplikace;
  return aplikace.Spust(instance);
}
