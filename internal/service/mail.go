package service

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strconv"
	"strings"

	"YggdrasilSkinServer/config"
	"YggdrasilSkinServer/internal/model"
)

// MailService 负责通过 SMTP 发送邮件（忘记密码、测试邮件等）。
type MailService struct {
	settings *SettingService
	cfg      *config.Config
}

// NewMailService 创建 MailService。
func NewMailService(settings *SettingService, cfg *config.Config) *MailService {
	return &MailService{settings: settings, cfg: cfg}
}

// Configured 判断 SMTP 是否已配置完整。
func (s *MailService) Configured() bool {
	return s.settings.Get(model.SettingSMTPHost, "") != ""
}

func (s *MailService) from() string {
	if v := s.settings.Get(model.SettingSMTPFrom, ""); v != "" {
		return v
	}
	return s.settings.Get(model.SettingSMTPUsername, "")
}

// Send 发送一封纯文本邮件。
func (s *MailService) Send(to, subject, body string) error {
	host := s.settings.Get(model.SettingSMTPHost, "")
	if host == "" {
		return fmt.Errorf("SMTP 未配置")
	}
	port, _ := strconv.Atoi(s.settings.Get(model.SettingSMTPPort, "465"))
	if port <= 0 {
		port = 465
	}
	username := s.settings.Get(model.SettingSMTPUsername, "")
	password := s.settings.Get(model.SettingSMTPPassword, "")
	from := s.from()
	if from == "" {
		return fmt.Errorf("SMTP 发件人未配置")
	}

	addr := host + ":" + strconv.Itoa(port)
	msg := buildMessage(from, to, subject, body)

	var client *smtp.Client
	if port == 465 {
		conn, err := tls.Dial("tcp", addr, &tls.Config{ServerName: host})
		if err != nil {
			return fmt.Errorf("连接 SMTP 失败: %w", err)
		}
		client, err = smtp.NewClient(conn, host)
		if err != nil {
			return fmt.Errorf("SMTP 握手失败: %w", err)
		}
	} else {
		conn, err := net.Dial("tcp", addr)
		if err != nil {
			return fmt.Errorf("连接 SMTP 失败: %w", err)
		}
		client, err = smtp.NewClient(conn, host)
		if err != nil {
			return fmt.Errorf("SMTP 握手失败: %w", err)
		}
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(&tls.Config{ServerName: host}); err != nil {
				return fmt.Errorf("STARTTLS 失败: %w", err)
			}
		}
	}
	defer client.Close()

	if username != "" {
		auth := smtp.PlainAuth("", username, password, host)
		if ok, _ := client.Extension("AUTH"); ok {
			if err := client.Auth(auth); err != nil {
				return fmt.Errorf("SMTP 认证失败: %w", err)
			}
		}
	}
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("设置发件人失败: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("设置收件人失败: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(msg); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return client.Quit()
}

// buildMessage 构造符合 MIME 规范的邮件正文（UTF-8 + Base64 主题）。
func buildMessage(from, to, subject, body string) []byte {
	fromName, addr := splitAddress(from)
	_, toAddr := splitAddress(to)
	var b strings.Builder
	b.WriteString("From: =?utf-8?b?" + base64Encode(fromName) + "?= <" + addr + ">\r\n")
	b.WriteString("To: " + toAddr + "\r\n")
	b.WriteString("Subject: =?utf-8?b?" + base64Encode(subject) + "?=\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
	b.WriteString(base64Wrap(body))
	return []byte(b.String())
}

func splitAddress(s string) (name, addr string) {
	s = strings.TrimSpace(s)
	if i := strings.Index(s, "<"); i >= 0 && strings.HasSuffix(s, ">") {
		return strings.TrimSpace(s[:i]), strings.TrimSuffix(s[i+1:], ">")
	}
	return s, s
}
