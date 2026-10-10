package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/gravitron/execution-engine/internal/delegation"
	"github.com/gravitron/execution-engine/internal/docker"
	agrpc "github.com/gravitron/execution-engine/internal/grpc"
	"github.com/gravitron/execution-engine/internal/terminal"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/gravitron/proto/gen/go/execution/v1/executionv1connect"
)

type executeRequest struct {
	ExecutionID string `json:"executionId"`
	OrgID       string `json:"orgId"`
	UserID      string `json:"userId"`
	WorkspaceID string `json:"workspaceId"`
	Command     string `json:"command"`
	Prompt      string `json:"prompt"`
}

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

	// 4. Initialize the delegation verifier (verification-only, public key).
	verifier, err := delegation.NewVerifierFromEnv()
	if err != nil {
		log.Fatalf("Execution-Service cannot start: %v", err)
	}
	log.Printf("Delegation verifier initialized (issuer=%s audience=%s)", delegation.Issuer, delegation.Audience)

	mux.HandleFunc("/api/v1/execute", func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
			http.Error(w, "Unauthorized: Missing Delegation Token", http.StatusUnauthorized)
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")

		var body executeRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Bad Request: invalid request body", http.StatusBadRequest)
			return
		}
		if body.ExecutionID == "" {
			http.Error(w, "Bad Request: executionId is required", http.StatusBadRequest)
			return
		}

		// Cryptographic verification of the delegation before any execution.
		claims, err := verifier.Verify(token, body.ExecutionID)
		if err != nil {
			log.Printf("Delegation verification failed: %v", err)
			http.Error(w, "Unauthorized: Invalid Delegation Token", http.StatusUnauthorized)
			return
		}

		// Tenant/identity enforcement: client-supplied identity is never
		// authoritative. It must match the verified delegation claims.
		if err := verifier.AuthorizeExecution(claims, body.OrgID, body.UserID); err != nil {
			log.Printf("Execution rejected: %v", err)
			http.Error(w, "Forbidden: identity mismatch", http.StatusForbidden)
			return
		}

		command := body.Command
		if command == "" {
			command = "echo 'execution authorized'"
		}

		exitCode, stdout, stderr, execErr := rt.ExecuteCommand(
			context.Background(),
			body.WorkspaceID,
			"bash",
			[]string{"-c", command},
			".",
		)

		log.Printf(
			"Authorized execution executionId=%s userId=%s orgId=%s exitCode=%d",
			claims.ExecutionID, claims.UserID, claims.OrgID, exitCode,
		)

		w.Header().Set("Content-Type", "application/json")
		if execErr != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"executionId": claims.ExecutionID,
				"error": execErr.Error(),
			})
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":     true,
			"executionId": claims.ExecutionID,
			"result": map[string]interface{}{
				"exitCode": exitCode,
				"stdout":   string(stdout),
				"stderr":   string(stderr),
			},
		})
	})
	
	// Start Server with HTTP/2 support (required by Connect gRPC)
	log.Println("Execution Engine starting on :8083")
	if err := http.ListenAndServe(
		":8083",
		h2c.NewHandler(mux, &http2.Server{}),
	); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
