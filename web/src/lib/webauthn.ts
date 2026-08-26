/**
 * WebAuthn 浏览器端辅助：把服务端下发的 base64url 选项转为浏览器需要的
 * ArrayBuffer，并把凭证响应编码回 base64url 提交给服务端。
 */

function base64UrlToBytes(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function bytesToBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let bin = ''
  for (const byte of bytes) bin += String.fromCharCode(byte)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * 把服务端 JSON 选项解码为浏览器需要的字节数组。
 * 服务端返回的是 { publicKey: {...} } 包装结构（go-webauthn 的
 * CredentialCreation/CredentialAssertion），需要先解包再解码 base64url 字段。
 */
export function decodePublicKeyOptions(options: any): any {
  const out = JSON.parse(JSON.stringify(options?.publicKey ?? options))
  if (out.challenge) out.challenge = base64UrlToBytes(out.challenge)
  if (out.user?.id) out.user.id = base64UrlToBytes(out.user.id)
  if (Array.isArray(out.excludeCredentials)) {
    out.excludeCredentials = out.excludeCredentials.map((c: any) => ({ ...c, id: base64UrlToBytes(c.id) }))
  }
  if (Array.isArray(out.allowCredentials)) {
    out.allowCredentials = out.allowCredentials.map((c: any) => ({ ...c, id: base64UrlToBytes(c.id) }))
  }
  return out
}

/** 把浏览器凭证（PublicKeyCredential）编码为服务端可解析的 JSON。 */
export function encodeCredential(cred: PublicKeyCredential): any {
  const client = cred.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse
  const res: any = {
    id: cred.id,
    rawId: bytesToBase64Url(cred.rawId),
    type: cred.type,
    response: { clientDataJSON: bytesToBase64Url(client.clientDataJSON) },
  }
  if ('attestationObject' in client && client.attestationObject) {
    res.response.attestationObject = bytesToBase64Url(client.attestationObject)
  }
  if ('authenticatorData' in client && client.authenticatorData) {
    res.response.authenticatorData = bytesToBase64Url(client.authenticatorData)
  }
  if ('signature' in client && client.signature) {
    res.response.signature = bytesToBase64Url(client.signature)
  }
  if ('userHandle' in client && client.userHandle) {
    res.response.userHandle = bytesToBase64Url(client.userHandle)
  }
  return res
}

/** 调用浏览器创建通行密钥。 */
export async function createPasskey(options: any): Promise<any> {
  if (!navigator.credentials?.create) {
    throw new Error('当前浏览器不支持 WebAuthn')
  }
  const publicKey = decodePublicKeyOptions(options)
  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null
  if (!credential) throw new Error('注册已取消')
  return encodeCredential(credential)
}

/** 调用浏览器进行通行密钥断言。 */
export async function getPasskey(options: any): Promise<any> {
  if (!navigator.credentials?.get) {
    throw new Error('当前浏览器不支持 WebAuthn')
  }
  const publicKey = decodePublicKeyOptions(options)
  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null
  if (!credential) throw new Error('登录已取消')
  return encodeCredential(credential)
}
