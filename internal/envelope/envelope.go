package envelope

import "net/http"

// YSSErrorCode 是项目 API 稳定的错误码。
// 约定：4xx 客户端错误，5xx 服务端错误。
const (
	CodeBadRequest     = 400
	CodeUnauthorized   = 401
	CodeForbidden      = 403
	CodeNotFound       = 404
	CodeConflict       = 409
	CodeValidation     = 422
	CodeTooManyRequest = 429
	CodeInternalError  = 500
)

// APIError 是 envelope 中的错误对象。
type APIError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

// Response 是项目 API（/api/v1）统一响应 envelope。
type Response struct {
	Error *APIError `json:"error"`
	Data  any       `json:"data"`
}

// OK 构造成功响应。
func OK(data any) Response {
	return Response{Error: nil, Data: data}
}

// Err 构造失败响应。
func Err(code int, message string) Response {
	return Response{Error: &APIError{Code: code, Message: message}}
}

// HTTPStatus 将业务错误码映射为 HTTP 状态码。
func HTTPStatus(code int) int {
	switch {
	case code >= 50000:
		return http.StatusInternalServerError
	case code == CodeValidation:
		return http.StatusUnprocessableEntity
	case code == CodeTooManyRequest:
		return http.StatusTooManyRequests
	case code == CodeConflict:
		return http.StatusConflict
	case code == CodeNotFound:
		return http.StatusNotFound
	case code == CodeForbidden:
		return http.StatusForbidden
	case code == CodeUnauthorized:
		return http.StatusUnauthorized
	default:
		return http.StatusBadRequest
	}
}
