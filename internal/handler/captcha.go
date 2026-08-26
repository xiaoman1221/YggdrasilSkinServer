package handler

import (
	"net/http"

	"YggdrasilSkinServer/internal/envelope"
	"YggdrasilSkinServer/internal/service"

	"github.com/gin-gonic/gin"
)

// CaptchaHandler 处理图形验证码 API（/api/v1/captcha）。
type CaptchaHandler struct {
	captchaSvc *service.CaptchaService
}

// NewCaptchaHandler 创建 CaptchaHandler。
func NewCaptchaHandler(captchaSvc *service.CaptchaService) *CaptchaHandler {
	return &CaptchaHandler{captchaSvc: captchaSvc}
}

// Get GET /api/v1/captcha —— 生成一张图形验证码，返回 id 与 base64 图片。
func (h *CaptchaHandler) Get(c *gin.Context) {
	id, image, err := h.captchaSvc.Generate()
	if err != nil {
		writeEnvelopeError(c, envelope.CodeInternalError, "生成验证码失败")
		return
	}
	c.JSON(http.StatusOK, envelope.OK(gin.H{"id": id, "image": image}))
}

// Policy GET /api/v1/captcha/policy —— 返回当前验证码策略。
func (h *CaptchaHandler) Policy(c *gin.Context) {
	c.JSON(http.StatusOK, envelope.OK(gin.H{"policy": h.captchaSvc.Policy()}))
}
