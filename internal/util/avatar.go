package util

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/png"
)

// headRect 是 Minecraft 皮肤正面头部（基础层）的像素区域。
var headRect = image.Rect(8, 8, 16, 16)

// headOverlayRect 是覆盖层（帽子/第二层）正面头部的像素区域（64x64 皮肤）。
var headOverlayRect = image.Rect(40, 8, 48, 16)

// ErrSkinTooSmall 表示皮肤尺寸不足以裁切头部。
var ErrSkinTooSmall = errors.New("skin texture too small to crop head")

// isVisible 判断像素是否可见（alpha > 0）。
func isVisible(c color.Color) bool {
	_, _, _, a := c.RGBA()
	return a > 0
}

// CropHead 从皮肤纹理裁切头部正面（8x8，合并基础层与覆盖层），
// 按最近邻放大到 size x size 输出。
func CropHead(data []byte, size int) ([]byte, error) {
	img, format, err := image.Decode(bytes.NewReader(data))
	if err != nil || format != "png" {
		return nil, ErrInvalidImage
	}
	b := img.Bounds()
	if b.Dx() < headRect.Max.X || b.Dy() < headRect.Max.Y {
		return nil, ErrSkinTooSmall
	}

	// 1) 基础层头部正面
	composite := image.NewNRGBA(image.Rect(0, 0, 8, 8))
	for y := 0; y < 8; y++ {
		for x := 0; x < 8; x++ {
			composite.Set(x, y, img.At(headRect.Min.X+x, headRect.Min.Y+y))
		}
	}

	// 2) 覆盖层（帽子/第二层）：仅现代 64x64 皮肤存在，且需有非透明像素才叠加
	if b.Dx() >= headOverlayRect.Max.X && b.Dy() >= 64 && hasVisibleOverlay(img, b) {
		for y := 0; y < 8; y++ {
			for x := 0; x < 8; x++ {
				c := img.At(headOverlayRect.Min.X+x, headOverlayRect.Min.Y+y)
				if isVisible(c) {
					composite.Set(x, y, c)
				}
			}
		}
	}

	// 3) 最近邻放大
	dst := image.NewRGBA(image.Rect(0, 0, size, size))
	for y := 0; y < size; y++ {
		sy := y * 8 / size
		for x := 0; x < size; x++ {
			sx := x * 8 / size
			dst.Set(x, y, composite.At(sx, sy))
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, dst); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// hasVisibleOverlay 判断覆盖层区域是否有可见像素（决定是否合并图层）。
func hasVisibleOverlay(img image.Image, b image.Rectangle) bool {
	for y := 0; y < 8; y++ {
		for x := 0; x < 8; x++ {
			if isVisible(img.At(headOverlayRect.Min.X+x, headOverlayRect.Min.Y+y)) {
				return true
			}
		}
	}
	return false
}

