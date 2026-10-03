package grpc

import (
	"context"

	"connectrpc.com/connect"
	"github.com/gravitron/execution-engine/internal/runtime"

	// Generated Code
	pb "github.com/gravitron/proto/gen/go/execution/v1"
)

type ExecutionServer struct {
	runtime runtime.Runtime
}

func NewExecutionServer(rt runtime.Runtime) *ExecutionServer {
	return &ExecutionServer{runtime: rt}
}

func (s *ExecutionServer) StartWorkspace(ctx context.Context, req *connect.Request[pb.StartWorkspaceRequest]) (*connect.Response[pb.StartWorkspaceResponse], error) {
	err := s.runtime.StartWorkspace(ctx, req.Msg.WorkspaceId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&pb.StartWorkspaceResponse{Success: true}), nil
}

func (s *ExecutionServer) StopWorkspace(ctx context.Context, req *connect.Request[pb.StopWorkspaceRequest]) (*connect.Response[pb.StopWorkspaceResponse], error) {
	err := s.runtime.StopWorkspace(ctx, req.Msg.WorkspaceId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&pb.StopWorkspaceResponse{Success: true}), nil
}

func (s *ExecutionServer) DestroyWorkspace(ctx context.Context, req *connect.Request[pb.DestroyWorkspaceRequest]) (*connect.Response[pb.DestroyWorkspaceResponse], error) {
	err := s.runtime.DestroyWorkspace(ctx, req.Msg.WorkspaceId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&pb.DestroyWorkspaceResponse{Success: true}), nil
}

func (s *ExecutionServer) CloneRepository(ctx context.Context, req *connect.Request[pb.CloneRepositoryRequest]) (*connect.Response[pb.CloneRepositoryResponse], error) {
	err := s.runtime.CloneRepository(ctx, req.Msg.WorkspaceId, req.Msg.GitUri, req.Msg.Branch)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&pb.CloneRepositoryResponse{Success: true}), nil
}

func (s *ExecutionServer) ExecCommand(ctx context.Context, req *connect.Request[pb.ExecRequest]) (*connect.Response[pb.ExecResponse], error) {
	code, stdout, stderr, err := s.runtime.ExecuteCommand(ctx, req.Msg.WorkspaceId, req.Msg.Command, req.Msg.Args, req.Msg.WorkingDirectory)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&pb.ExecResponse{
		ExitCode: int32(code),
		Stdout:   stdout,
		Stderr:   stderr,
	}), nil
}

func (s *ExecutionServer) ReadFile(ctx context.Context, req *connect.Request[pb.ReadFileRequest]) (*connect.Response[pb.ReadFileResponse], error) {
	content, err := s.runtime.ReadFile(ctx, req.Msg.WorkspaceId, req.Msg.Path)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}
	return connect.NewResponse(&pb.ReadFileResponse{Content: content}), nil
}

func (s *ExecutionServer) WriteFile(ctx context.Context, req *connect.Request[pb.WriteFileRequest]) (*connect.Response[pb.WriteFileResponse], error) {
	err := s.runtime.WriteFile(ctx, req.Msg.WorkspaceId, req.Msg.Path, req.Msg.Content)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&pb.WriteFileResponse{Success: true}), nil
}

func (s *ExecutionServer) ListDirectory(ctx context.Context, req *connect.Request[pb.ListDirectoryRequest]) (*connect.Response[pb.ListDirectoryResponse], error) {
	files, err := s.runtime.ListDirectory(ctx, req.Msg.WorkspaceId, req.Msg.Path)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}

	var pbFiles []*pb.FileInfo
	for _, f := range files {
		pbFiles = append(pbFiles, &pb.FileInfo{
			Name:  f.Name,
			IsDir: f.IsDir,
			Size:  f.Size,
		})
	}

	return connect.NewResponse(&pb.ListDirectoryResponse{Files: pbFiles}), nil
}

func (s *ExecutionServer) DeleteFile(ctx context.Context, req *connect.Request[pb.DeleteFileRequest]) (*connect.Response[pb.DeleteFileResponse], error) {
	err := s.runtime.DeleteFile(ctx, req.Msg.WorkspaceId, req.Msg.Path)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&pb.DeleteFileResponse{Success: true}), nil
}
