package util

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/png"
)

// ErrInvalidImage 表示上传内容不是合法的 PNG 图片。
var ErrInvalidImage = errors.New("invalid PNG image")

// ErrImageTooLarge 表示图片尺寸超出限制。
var ErrImageTooLarge = errors.New("image too large")

// ProcessPNG 校验并重编码 PNG：
//  1. 只接受 PNG 格式
//  2. 校验尺寸不超过限制
//  3. 重新编码为安全 PNG（剔除危险/多余 chunk）
//
// 返回重编码后的字节、宽、高。
func ProcessPNG(data []byte, maxWidth, maxHeight int) ([]byte, int, int, error) {
	img, format, err := image.Decode(bytes.NewReader(data))
	if err != nil || format != "png" {
		return nil, 0, 0, ErrInvalidImage
	}

	bounds := img.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if maxWidth > 0 && width > maxWidth {
		return nil, 0, 0, fmt.Errorf("%w: %dx%d exceeds %dx%d", ErrImageTooLarge, width, height, maxWidth, maxHeight)
	}
	if maxHeight > 0 && height > maxHeight {
		return nil, 0, 0, fmt.Errorf("%w: %dx%d exceeds %dx%d", ErrImageTooLarge, width, height, maxWidth, maxHeight)
	}

	var buf bytes.Buffer
	enc := png.Encoder{CompressionLevel: png.BestSpeed}
	if err := enc.Encode(&buf, img); err != nil {
		return nil, 0, 0, fmt.Errorf("re-encode png: %w", err)
	}
	return buf.Bytes(), width, height, nil
}

// HashPNG 计算处理后的 PNG 内容 hash（SHA-256 十六进制）。
func HashPNG(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
