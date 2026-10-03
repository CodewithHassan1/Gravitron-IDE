package runtime

import (
	"context"
	"io"
)

type WorkspaceConfig struct {
	WorkspaceID      string
	GitURI           string
	DefaultBranch    string
	IsPrivate        bool
	WorkingDirectory string
	ResourceLimits   ResourceLimits
}

type ResourceLimits struct {
	MemoryMB int
	CPUs     float64
}

type WorkspaceStats struct {
	Status string
	CPUUsage float64
	MemoryUsageMB float64
}

type FileInfo struct {
	Name  string
	IsDir bool
	Size  int64
}

// Runtime defines the agnostic interface for execution engines (Docker, Firecracker, etc.)
type Runtime interface {
	CreateWorkspace(ctx context.Context, config WorkspaceConfig) error
	StartWorkspace(ctx context.Context, workspaceID string) error
	StopWorkspace(ctx context.Context, workspaceID string) error
	DestroyWorkspace(ctx context.Context, workspaceID string) error

	CloneRepository(ctx context.Context, workspaceID, gitURI, branch string) error
	ExecuteCommand(ctx context.Context, workspaceID, cmd string, args []string, workingDir string) (exitCode int, stdout []byte, stderr []byte, err error)
	StreamLogs(ctx context.Context, workspaceID string) (io.ReadCloser, error)
	GetWorkspaceStats(ctx context.Context, workspaceID string) (WorkspaceStats, error)

	// File System Operations
	ReadFile(ctx context.Context, workspaceID, path string) ([]byte, error)
	WriteFile(ctx context.Context, workspaceID, path string, content []byte) error
	ListDirectory(ctx context.Context, workspaceID, path string) ([]FileInfo, error)
	DeleteFile(ctx context.Context, workspaceID, path string) error
}
