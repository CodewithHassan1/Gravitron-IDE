package terminal

import (
	"log"
	"net/http"

	"github.com/gravitron/execution-engine/internal/runtime"
	"golang.org/x/net/websocket"
)

type TerminalServer struct {
	runtime runtime.Runtime
}

func NewTerminalServer(rt runtime.Runtime) *TerminalServer {
	return &TerminalServer{runtime: rt}
}

func (s *TerminalServer) HandleWebSocket(ws *websocket.Conn) {
	// 1. Read Authentication / Workspace ID from WebSocket handshake or first frame
	// 2. Map Workspace ID to local sandbox (Docker container)
	// 3. Exec `/bin/bash` with a pseudo-terminal (PTY) attached
	// 4. Bi-directional stream:
	//      ws -> stdin
	//      stdout/stderr -> ws
	// 5. Handle special control frames (resize Window, Ctrl+C)
	log.Println("New terminal WebSocket connection")
	
	// Mock stream close
	ws.Close()
}

func (s *TerminalServer) RegisterRoutes(mux *http.ServeMux) {
	mux.Handle("/terminal", websocket.Handler(s.HandleWebSocket))
}
