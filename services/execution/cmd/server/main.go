package main

import (
	"log"
	"net/http"

	"github.com/gravitron/execution-engine/internal/docker"
	agrpc "github.com/gravitron/execution-engine/internal/grpc"
	"github.com/gravitron/execution-engine/internal/terminal"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/gravitron/proto/gen/go/execution/v1/executionv1connect"
)

func main() {
	mux := http.NewServeMux()
	
	// 1. Initialize the Runtime Abstraction (Docker)
	rt := docker.NewDockerRuntime()
	
	// 2. Initialize the Terminal Streaming Server
	termServer := terminal.NewTerminalServer(rt)
	termServer.RegisterRoutes(mux)
	
	// 3. Initialize the gRPC/Connect Service
	execServer := agrpc.NewExecutionServer(rt)
	path, handler := executionv1connect.NewExecutionServiceHandler(execServer)
	mux.Handle(path, handler)
	
	// Start Server with HTTP/2 support (required by Connect gRPC)
	log.Println("Execution Engine starting on :8083")
	if err := http.ListenAndServe(
		":8083",
		h2c.NewHandler(mux, &http2.Server{}),
	); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
