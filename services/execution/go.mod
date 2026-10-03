module github.com/gravitron/execution-engine

go 1.22.0

require (
	connectrpc.com/connect v1.16.2
	github.com/gravitron/proto v0.0.0
	golang.org/x/net v0.27.0
)

require (
	golang.org/x/text v0.16.0 // indirect
	google.golang.org/protobuf v1.34.2 // indirect
)

replace github.com/gravitron/proto => ../../packages/proto
