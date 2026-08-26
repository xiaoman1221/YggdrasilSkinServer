package service

import "encoding/base64"

// base64Encode 编码 UTF-8 头部字段（RFC 2047 B 编码）。
func base64Encode(s string) string {
	return base64.StdEncoding.EncodeToString([]byte(s))
}

// base64Wrap 按 76 字符行折行 base64 正文。
func base64Wrap(s string) string {
	enc := base64.StdEncoding.EncodeToString([]byte(s))
	const lineLen = 76
	var out []byte
	for len(enc) > lineLen {
		out = append(out, enc[:lineLen]...)
		out = append(out, '\r', '\n')
		enc = enc[lineLen:]
	}
	out = append(out, enc...)
	return string(out)
}
