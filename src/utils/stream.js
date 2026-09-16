// NDJSON 流式解析器（纯 JS，从原生版原样迁移，零改动）
// 后端按契约 v1 每行发一条 JSON：{"type":"delta","text":"..."}
// 关键点：网络分块会切断 UTF-8 中文（一个汉字 3 字节），所以必须在字节层面按 0x0A 切行，再整行解码
function decodeUtf8(bytes) {
  let out = ''
  let i = 0
  const n = bytes.length
  while (i < n) {
    const b = bytes[i]
    if (b < 0x80) {
      out += String.fromCharCode(b)
      i += 1
    } else if (b >= 0xc0 && b < 0xe0 && i + 1 < n) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f))
      i += 2
    } else if (b >= 0xe0 && b < 0xf0 && i + 2 < n) {
      out += String.fromCharCode(
        ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)
      )
      i += 3
    } else if (b >= 0xf0 && i + 3 < n) {
      const cp =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f)
      const v = cp - 0x10000
      out += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff))
      i += 4
    } else {
      i += 1 // 非法字节或跨包残留，跳过，等下一块补齐
    }
  }
  return out
}

function toBytes(buf) {
  if (!buf) return new Uint8Array(0)
  if (buf instanceof Uint8Array) return buf
  return new Uint8Array(buf)
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

// 返回 { push(ArrayBuffer), reset() }
function createNdjsonParser(onMessage) {
  let buf = new Uint8Array(0)

  function push(chunk) {
    buf = concat(buf, toBytes(chunk))
    let start = 0
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] !== 0x0a) continue // 0x0A = \n
      const line = decodeUtf8(buf.slice(start, i)).trim()
      start = i + 1
      if (!line) continue
      try {
        onMessage(JSON.parse(line))
      } catch (e) {
        console.warn('[stream] 无法解析的流内消息：', line)
      }
    }
    buf = buf.slice(start) // 留下不完整的尾巴
  }

  function reset() {
    buf = new Uint8Array(0)
  }

  return { push, reset }
}

export { createNdjsonParser, decodeUtf8 }
