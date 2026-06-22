#!/bin/bash
# PostToolUse hook — 自动格式化代码（Edit/Write 后触发）

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_use_name":"[^"]*"' | head -1 | sed 's/.*"//')
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path":"[^"]*"' | head -1 | sed 's/.*"//')

if [ "$TOOL_NAME" != "Edit" ] && [ "$TOOL_NAME" != "Write" ]; then
    exit 0
fi

exit 0
