import Foundation
import Security

// Values travel through a private pipe, never argv or a temporary file.
guard CommandLine.arguments.count == 3,
      ["get", "set", "remove"].contains(CommandLine.arguments[1]),
      ["openai-admin", "anthropic-admin"].contains(CommandLine.arguments[2]) else { exit(64) }
let action = CommandLine.arguments[1]
let id = CommandLine.arguments[2]
var query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "cz.agentree.\(id)", kSecAttrAccount as String: "agentree"]
#if AGENTREE_KEYCHAIN_QA
// Test build cannot read or overwrite real Agentree keys.
guard let namespace = ProcessInfo.processInfo.environment["AGENTREE_QA_NAMESPACE"], UUID(uuidString: namespace) != nil else { exit(64) }
query[kSecAttrService as String] = "cz.agentree.qa.\(namespace).\(id)"
#endif
var status: OSStatus = errSecParam
switch action {
case "get":
    var lookup = query
    lookup[kSecReturnData as String] = true
    lookup[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    status = SecItemCopyMatching(lookup as CFDictionary, &result)
    if status == errSecSuccess, let data = result as? Data { FileHandle.standardOutput.write(data) }
case "set":
    var data = Data()
    while data.count <= 4096 {
        let chunk = FileHandle.standardInput.readData(ofLength: 4097 - data.count)
        if chunk.isEmpty { break }
        data.append(chunk)
    }
    guard !data.isEmpty, data.count <= 4096,
          let value = String(data: data, encoding: .utf8),
          value.range(of: id == "openai-admin" ? "^sk-[A-Za-z0-9_-]{20,}$" : "^sk-ant-[A-Za-z0-9_-]{20,}$", options: .regularExpression) != nil else { exit(64) }
    status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if status == errSecItemNotFound {
        var item = query
        item[kSecValueData as String] = data
        status = SecItemAdd(item as CFDictionary, nil)
    }
default:
    status = SecItemDelete(query as CFDictionary)
    if status == errSecItemNotFound { status = errSecSuccess }
}
// No error payload can accidentally include a credential.
exit(status == errSecSuccess ? 0 : status == errSecItemNotFound ? 2 : 1)
