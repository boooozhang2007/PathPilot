// 增量 UTF-8 解码器：SSE/流式响应按字节块到达，多字节中文可能被切断在两块之间
// 不依赖 Hermes 是否内置 TextDecoder，纯 JS 实现（含 chunk 边界与无效字节兜底）
export function createUtf8StreamDecoder(): (chunk: Uint8Array, flush?: boolean) => string {
  let pending: number[] = [];

  /** 解码 bytes 前缀中的完整字符序列；返回 [文本, 已消费字节数] */
  function decodeFrom(bytes: number[]): [string, number] {
    let out = '';
    let i = 0;
    while (i < bytes.length) {
      const b = bytes[i];
      if (b < 0x80) {
        out += String.fromCharCode(b);
        i += 1;
        continue;
      }
      let len = 0;
      let cp = 0;
      if ((b & 0xe0) === 0xc0) {
        len = 2;
        cp = b & 0x1f;
      } else if ((b & 0xf0) === 0xe0) {
        len = 3;
        cp = b & 0x0f;
      } else if ((b & 0xf8) === 0xf0) {
        len = 4;
        cp = b & 0x07;
      } else {
        out += '\uFFFD'; // 无效起始字节
        i += 1;
        continue;
      }
      if (i + len > bytes.length) break; // 序列不完整：留待下一块
      let valid = true;
      for (let j = 1; j < len; j++) {
        const c = bytes[i + j];
        if ((c & 0xc0) !== 0x80) {
          valid = false;
          break;
        }
        cp = (cp << 6) | (c & 0x3f);
      }
      if (!valid) {
        out += '\uFFFD';
        i += 1;
        continue;
      }
      out += String.fromCodePoint(cp);
      i += len;
    }
    return [out, i];
  }

  return (chunk: Uint8Array, flush = false): string => {
    pending = pending.concat(Array.from(chunk));
    const [text, consumed] = decodeFrom(pending);
    pending = pending.slice(consumed);
    if (flush && pending.length) {
      const rest = '\uFFFD'.repeat(pending.length);
      pending = [];
      return text + rest;
    }
    return text;
  };
}
