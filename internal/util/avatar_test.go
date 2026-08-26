package util

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"
)

// makeSkin 生成测试皮肤：可指定基础脸颜色、覆盖层脸颜色（nil 表示透明）、皮肤尺寸。
func makeSkin(t *testing.T, w, h int, baseFace, overlayFace *color.NRGBA) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	// 默认背景：绿色（基础层身体）
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.SetNRGBA(x, y, color.NRGBA{R: 0, G: 255, B: 0, A: 255})
		}
	}
	// 基础层头部正面
	for y := 8; y < 16; y++ {
		for x := 8; x < 16; x++ {
			img.SetNRGBA(x, y, *baseFace)
		}
	}
	// 覆盖层头部正面（可选）
	if overlayFace != nil {
		for y := 8; y < 16; y++ {
			for x := 40; x < 48; x++ {
				img.SetNRGBA(x, y, *overlayFace)
			}
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode skin: %v", err)
	}
	return buf.Bytes()
}

func decodePNG(t *testing.T, data []byte) image.Image {
	t.Helper()
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("decode avatar: %v", err)
	}
	return img
}

func assertAllColor(t *testing.T, img image.Image, want color.NRGBA) {
	t.Helper()
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			r, g, bl, _ := img.At(x, y).RGBA()
			got := color.NRGBA{uint8(r >> 8), uint8(g >> 8), uint8(bl >> 8), 255}
			if got.R != want.R || got.G != want.G || got.B != want.B {
				t.Fatalf("pixel(%d,%d) = %v, want %v", x, y, got, want)
			}
		}
	}
}

func TestCropHeadMergesOverlay(t *testing.T) {
	red := color.NRGBA{R: 255, G: 0, B: 0, A: 255}
	blue := color.NRGBA{R: 0, G: 0, B: 255, A: 255}

	// 1) 64x64：基础红 + 覆盖蓝 → 头像应为蓝（合并图层）
	data := makeSkin(t, 64, 64, &red, &blue)
	out, err := CropHead(data, 64)
	if err != nil {
		t.Fatalf("crop: %v", err)
	}
	assertAllColor(t, decodePNG(t, out), blue)

	// 2) 64x64：基础红 + 覆盖透明 → 头像应为红（仅基础层）
	transparent := color.NRGBA{R: 0, G: 0, B: 255, A: 0}
	data2 := makeSkin(t, 64, 64, &red, &transparent)
	out2, err := CropHead(data2, 64)
	if err != nil {
		t.Fatalf("crop: %v", err)
	}
	assertAllColor(t, decodePNG(t, out2), red)

	// 3) 64x32 旧格式：仅基础层 → 头像应为红
	data3 := makeSkin(t, 64, 32, &red, nil)
	out3, err := CropHead(data3, 64)
	if err != nil {
		t.Fatalf("crop: %v", err)
	}
	assertAllColor(t, decodePNG(t, out3), red)
}
