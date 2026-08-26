package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"YggdrasilSkinServer/config"
	"YggdrasilSkinServer/internal/database"
	"YggdrasilSkinServer/internal/router"
)

// defaultJWTSecret 与 config.Load 中的默认密钥一致。
const defaultJWTSecret = "change-me-in-production"

func main() {
	cfg := config.Load()

	if cfg.JWT.Secret == defaultJWTSecret {
		if cfg.Server.Mode == "release" {
			log.Fatal("refusing to start in release mode with default JWT secret: set YSS_JWT_SECRET")
		}
		log.Println("WARNING: using default JWT secret, set YSS_JWT_SECRET in production!")
	}

	if err := database.Init(cfg); err != nil {
		log.Fatalf("init database: %v", err)
	}

	r := router.Setup(cfg)

	srv := &http.Server{Addr: cfg.Addr(), Handler: r}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("YSS listening on %s", cfg.Addr())
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server stopped: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown error: %v", err)
	}
}
