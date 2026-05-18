BINARY  := overra-agent
OUT_DIR := ../agents

# -trimpath removes local file system paths from the binary.
# -s -w strips the symbol table and DWARF debug info (smaller binary).
BUILD_FLAGS := -trimpath -ldflags "-s -w"

.PHONY: all linux darwin windows clean tidy test test-contract

all: linux darwin windows

linux:   $(OUT_DIR)/$(BINARY)-linux-amd64   $(OUT_DIR)/$(BINARY)-linux-arm64
darwin:  $(OUT_DIR)/$(BINARY)-darwin-amd64  $(OUT_DIR)/$(BINARY)-darwin-arm64
windows: $(OUT_DIR)/$(BINARY)-windows-amd64.exe

# Order-only prerequisite: create OUT_DIR if missing, but don't treat it as
# a stale dependency after creation.
$(OUT_DIR):
	mkdir -p $(OUT_DIR)

$(OUT_DIR)/$(BINARY)-linux-amd64: | $(OUT_DIR)
	GOOS=linux   GOARCH=amd64 go build $(BUILD_FLAGS) -o $@ .

$(OUT_DIR)/$(BINARY)-linux-arm64: | $(OUT_DIR)
	GOOS=linux   GOARCH=arm64 go build $(BUILD_FLAGS) -o $@ .

$(OUT_DIR)/$(BINARY)-darwin-amd64: | $(OUT_DIR)
	GOOS=darwin  GOARCH=amd64 go build $(BUILD_FLAGS) -o $@ .

$(OUT_DIR)/$(BINARY)-darwin-arm64: | $(OUT_DIR)
	GOOS=darwin  GOARCH=arm64 go build $(BUILD_FLAGS) -o $@ .

$(OUT_DIR)/$(BINARY)-windows-amd64.exe: | $(OUT_DIR)
	GOOS=windows GOARCH=amd64 go build $(BUILD_FLAGS) -o $@ .

# Download dependencies and generate go.sum before building.
tidy:
	go mod tidy

clean:
	rm -f $(OUT_DIR)/$(BINARY)-*

# Unit + in-process tests (no portal required).
test:
	go test -cover ./...

# Contract test against a live Next.js portal. The wrapper script boots the
# portal, seeds a device + JWT, and exports the required env vars.
test-contract:
	bash ../tests/agent-contract/run.sh
