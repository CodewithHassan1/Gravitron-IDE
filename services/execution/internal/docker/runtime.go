package docker

import (
	"context"
	"errors"
	"io"

	"github.com/gravitron/execution-engine/internal/runtime"
)

// DockerRuntime implements runtime.Runtime using local Docker containers
type DockerRuntime struct {
	// dockerClient *client.Client (Omitted for compilation mock in this phase)
}

func NewDockerRuntime() *DockerRuntime {
	return &DockerRuntime{}
}

func (d *DockerRuntime) CreateWorkspace(ctx context.Context, config runtime.WorkspaceConfig) error {
	// 1. Create a Docker Volume named workspace-{id}
	// 2. Create an isolated Docker Network
	// 3. Define the container using the secure context (non-root, drop caps, seccomp)
	// 4. Do not start it yet
	return nil
}

func (d *DockerRuntime) StartWorkspace(ctx context.Context, workspaceID string) error {
	// Start the container
	return nil
}

func (d *DockerRuntime) StopWorkspace(ctx context.Context, workspaceID string) error {
	return nil
}

func (d *DockerRuntime) DestroyWorkspace(ctx context.Context, workspaceID string) error {
	// Stop container, remove container, remove volume, remove network
	return nil
}

func (d *DockerRuntime) CloneRepository(ctx context.Context, workspaceID, gitURI, branch string) error {
	// Exec `git clone` inside the container targeting the volume
	return nil
}

func (d *DockerRuntime) ExecuteCommand(ctx context.Context, workspaceID, cmd string, args []string, workingDir string) (int, []byte, []byte, error) {
	// Exec a raw process inside the container. Return exit code and buffers
	return 0, []byte("stdout mock"), []byte("stderr mock"), nil
}

func (d *DockerRuntime) StreamLogs(ctx context.Context, workspaceID string) (io.ReadCloser, error) {
	return nil, errors.New("not implemented")
}

func (d *DockerRuntime) GetWorkspaceStats(ctx context.Context, workspaceID string) (runtime.WorkspaceStats, error) {
	return runtime.WorkspaceStats{Status: "READY", CPUUsage: 0.0, MemoryUsageMB: 0.0}, nil
}

// File System Operations

func (d *DockerRuntime) ReadFile(ctx context.Context, workspaceID, path string) ([]byte, error) {
	// Read file from the shared volume or via docker cp stream
	return []byte("file content mock"), nil
}

func (d *DockerRuntime) WriteFile(ctx context.Context, workspaceID, path string, content []byte) error {
	return nil
}

func (d *DockerRuntime) ListDirectory(ctx context.Context, workspaceID, path string) ([]runtime.FileInfo, error) {
	return []runtime.FileInfo{}, nil
}

func (d *DockerRuntime) DeleteFile(ctx context.Context, workspaceID, path string) error {
	return nil
}
