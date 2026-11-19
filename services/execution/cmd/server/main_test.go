package main

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gravitron/execution-engine/internal/delegation"
	"github.com/gravitron/execution-engine/internal/runtime"
)

// mockRuntime satisfies runtime.Runtime for isolated HTTP handler tests.
type mockRuntime struct {
	executed        bool
	lastWorkspaceID string
	lastCmd         string
	lastArgs        []string
	lastWorkingDir  string
	exitCode        int
	stdout          []byte
	stderr          []byte
	execErr         error
}

func (m *mockRuntime) CreateWorkspace(ctx context.Context, config runtime.WorkspaceConfig) error { return nil }
func (m *mockRuntime) StartWorkspace(ctx context.Context, workspaceID string) error              { return nil }
func (m *mockRuntime) StopWorkspace(ctx context.Context, workspaceID string) error               { return nil }
func (m *mockRuntime) DestroyWorkspace(ctx context.Context, workspaceID string) error            { return nil }
func (m *mockRuntime) CloneRepository(ctx context.Context, workspaceID, gitURI, branch string) error {
	return nil
}
func (m *mockRuntime) StreamLogs(ctx context.Context, workspaceID string) (io.ReadCloser, error) {
	return nil, nil
}
func (m *mockRuntime) GetWorkspaceStats(ctx context.Context, workspaceID string) (runtime.WorkspaceStats, error) {
	return runtime.WorkspaceStats{Status: "READY"}, nil
}
func (m *mockRuntime) ReadFile(ctx context.Context, workspaceID, path string) ([]byte, error) {
	return nil, nil
}
func (m *mockRuntime) WriteFile(ctx context.Context, workspaceID, path string, content []byte) error {
	return nil
}
func (m *mockRuntime) ListDirectory(ctx context.Context, workspaceID, path string) ([]runtime.FileInfo, error) {
	return nil, nil
}
func (m *mockRuntime) DeleteFile(ctx context.Context, workspaceID, path string) error {
	return nil
}

func (m *mockRuntime) ExecuteCommand(ctx context.Context, workspaceID, cmd string, args []string, workingDir string) (int, []byte, []byte, error) {
	m.executed = true
	m.lastWorkspaceID = workspaceID
	m.lastCmd = cmd
	m.lastArgs = args
	m.lastWorkingDir = workingDir
	return m.exitCode, m.stdout, m.stderr, m.execErr
}

func testKeyPair(t *testing.T) (*ecdsa.PrivateKey, *ecdsa.PublicKey) {
	t.Helper()
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	return priv, &priv.PublicKey
}

func testSignToken(t *testing.T, key *ecdsa.PrivateKey, claims jwt.Claims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	s, err := tok.SignedString(key)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return s
}

func testValidClaims(execID, orgID, userID string) *delegation.Claims {
	now := time.Now()
	return &delegation.Claims{
		Purpose:     delegation.Purpose,
		UserID:      userID,
		OrgID:       orgID,
		ExecutionID: execID,
		Scope:       "agent:execute",
		JTI:         "jti-boundary-test",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    delegation.Issuer,
			Audience:  jwt.ClaimStrings{delegation.Audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        "jti-boundary-test",
		},
	}
}

// 1. Missing Authorization header -> 401 Unauthorized
func TestExecute_MissingAuthorizationHeader(t *testing.T) {
	_, pub := testKeyPair(t)
	mockRT := &mockRuntime{}
	handler := NewExecuteHandler(mockRT, delegation.NewVerifier(pub))

	reqBody := `{"executionId":"exec-1","command":"echo hi"}`
	req := httptest.NewRequest("POST", "/api/v1/execute", bytes.NewBufferString(reqBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Unauthorized: Missing Delegation Token") {
		t.Errorf("unexpected response body: %q", rec.Body.String())
	}
	if mockRT.executed {
		t.Error("command execution must NOT occur when authorization is missing")
	}
}

// 2. Malformed or invalid Bearer token -> 401 Unauthorized
func TestExecute_MalformedBearerToken(t *testing.T) {
	_, pub := testKeyPair(t)
	mockRT := &mockRuntime{}
	handler := NewExecuteHandler(mockRT, delegation.NewVerifier(pub))

	reqBody := `{"executionId":"exec-1","command":"echo hi"}`
	req := httptest.NewRequest("POST", "/api/v1/execute", bytes.NewBufferString(reqBody))
	req.Header.Set("Authorization", "Bearer invalid.compact.jws")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Unauthorized: Invalid Delegation Token") {
		t.Errorf("unexpected response body: %q", rec.Body.String())
	}
	if mockRT.executed {
		t.Error("command execution must NOT occur for malformed bearer token")
	}
}

// 3. Missing execution ID in request body -> 400 Bad Request
func TestExecute_MissingExecutionID(t *testing.T) {
	priv, pub := testKeyPair(t)
	mockRT := &mockRuntime{}
	handler := NewExecuteHandler(mockRT, delegation.NewVerifier(pub))

	token := testSignToken(t, priv, testValidClaims("exec-1", "org-1", "user-1"))
	reqBody := `{"command":"echo hi"}`
	req := httptest.NewRequest("POST", "/api/v1/execute", bytes.NewBufferString(reqBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Bad Request: executionId is required") {
		t.Errorf("unexpected response body: %q", rec.Body.String())
	}
	if mockRT.executed {
		t.Error("command execution must NOT occur when executionId is missing")
	}
}

// 4. Empty execution ID in request body -> 400 Bad Request
func TestExecute_EmptyExecutionID(t *testing.T) {
	priv, pub := testKeyPair(t)
	mockRT := &mockRuntime{}
	handler := NewExecuteHandler(mockRT, delegation.NewVerifier(pub))

	token := testSignToken(t, priv, testValidClaims("exec-1", "org-1", "user-1"))
	reqBody := `{"executionId":"","command":"echo hi"}`
	req := httptest.NewRequest("POST", "/api/v1/execute", bytes.NewBufferString(reqBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Bad Request: executionId is required") {
		t.Errorf("unexpected response body: %q", rec.Body.String())
	}
	if mockRT.executed {
		t.Error("command execution must NOT occur when executionId is empty")
	}
}

// 5. Mismatched execution ID (Token for exec-AAA, request body for exec-BBB) -> 401 Unauthorized
func TestExecute_ExecutionIDMismatch(t *testing.T) {
	priv, pub := testKeyPair(t)
	mockRT := &mockRuntime{}
	handler := NewExecuteHandler(mockRT, delegation.NewVerifier(pub))

	token := testSignToken(t, priv, testValidClaims("exec-AAA", "org-1", "user-1"))
	reqBody := `{"executionId":"exec-BBB","command":"echo hi"}`
	req := httptest.NewRequest("POST", "/api/v1/execute", bytes.NewBufferString(reqBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized on execution binding mismatch, got %d", rec.Code)
	}
	if mockRT.executed {
		t.Error("command execution must NOT occur on execution binding mismatch")
	}
}

// 6. Mismatched organization identity (Token for org-alpha, body claims org-beta) -> 403 Forbidden
func TestExecute_OrgMismatch(t *testing.T) {
	priv, pub := testKeyPair(t)
	mockRT := &mockRuntime{}
	handler := NewExecuteHandler(mockRT, delegation.NewVerifier(pub))

	token := testSignToken(t, priv, testValidClaims("exec-1", "org-alpha", "user-1"))
	reqBody := `{"executionId":"exec-1","orgId":"org-beta","userId":"user-1","command":"echo hi"}`
	req := httptest.NewRequest("POST", "/api/v1/execute", bytes.NewBufferString(reqBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden on org mismatch, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Forbidden: identity mismatch") {
		t.Errorf("unexpected response body: %q", rec.Body.String())
	}
	if mockRT.executed {
		t.Error("command execution must NOT occur on organization mismatch")
	}
}

// 7. Mismatched user identity (Token for user-alice, body claims user-bob) -> 403 Forbidden
func TestExecute_UserMismatch(t *testing.T) {
	priv, pub := testKeyPair(t)
	mockRT := &mockRuntime{}
	handler := NewExecuteHandler(mockRT, delegation.NewVerifier(pub))

	token := testSignToken(t, priv, testValidClaims("exec-1", "org-1", "user-alice"))
	reqBody := `{"executionId":"exec-1","orgId":"org-1","userId":"user-bob","command":"echo hi"}`
	req := httptest.NewRequest("POST", "/api/v1/execute", bytes.NewBufferString(reqBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden on user mismatch, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "Forbidden: identity mismatch") {
		t.Errorf("unexpected response body: %q", rec.Body.String())
	}
	if mockRT.executed {
		t.Error("command execution must NOT occur on user mismatch")
	}
}

// 8. Valid delegation with matching claims and payload -> 200 OK
func TestExecute_ValidDelegationSuccess(t *testing.T) {
	priv, pub := testKeyPair(t)
	mockRT := &mockRuntime{
		exitCode: 0,
		stdout:   []byte("output data"),
		stderr:   nil,
	}
	handler := NewExecuteHandler(mockRT, delegation.NewVerifier(pub))

	token := testSignToken(t, priv, testValidClaims("exec-100", "org-prime", "user-prime"))
	reqBody := `{"executionId":"exec-100","orgId":"org-prime","userId":"user-prime","workspaceId":"ws-42","command":"echo test-pass"}`
	req := httptest.NewRequest("POST", "/api/v1/execute", bytes.NewBufferString(reqBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d. Body: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Header().Get("Content-Type"), "application/json") {
		t.Errorf("expected Content-Type application/json, got %q", rec.Header().Get("Content-Type"))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatalf("decode response JSON: %v", err)
	}

	if result["success"] != true {
		t.Errorf("expected success: true, got %v", result["success"])
	}
	if result["executionId"] != "exec-100" {
		t.Errorf("expected executionId: exec-100, got %v", result["executionId"])
	}

	if !mockRT.executed {
		t.Fatal("expected command execution to be called in runtime")
	}
	if mockRT.lastWorkspaceID != "ws-42" {
		t.Errorf("expected workspaceId 'ws-42', got %q", mockRT.lastWorkspaceID)
	}
	if mockRT.lastCmd != "bash" {
		t.Errorf("expected command 'bash', got %q", mockRT.lastCmd)
	}
	if len(mockRT.lastArgs) != 2 || mockRT.lastArgs[1] != "echo test-pass" {
		t.Errorf("expected args [-c 'echo test-pass'], got %v", mockRT.lastArgs)
	}
}

// 9. Runtime execution error -> 200 OK with success: false and error message
func TestExecute_RuntimeExecutionError(t *testing.T) {
	priv, pub := testKeyPair(t)
	mockRT := &mockRuntime{
		execErr: errors.New("container crashed with code 137"),
	}
	handler := NewExecuteHandler(mockRT, delegation.NewVerifier(pub))

	token := testSignToken(t, priv, testValidClaims("exec-err", "org-prime", "user-prime"))
	reqBody := `{"executionId":"exec-err","orgId":"org-prime","userId":"user-prime","command":"faulty-cmd"}`
	req := httptest.NewRequest("POST", "/api/v1/execute", bytes.NewBufferString(reqBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 OK at HTTP layer, got %d", rec.Code)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatalf("decode response JSON: %v", err)
	}

	if result["success"] != false {
		t.Errorf("expected success: false on runtime error, got %v", result["success"])
	}
	if result["error"] != "container crashed with code 137" {
		t.Errorf("expected container error message, got %v", result["error"])
	}
	if !mockRT.executed {
		t.Fatal("runtime ExecuteCommand should have been invoked")
	}
}
