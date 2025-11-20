#!/bin/bash
# Download Porcupine model file required for wake word detection
# This is the engine model (.pv), separate from keyword files (.ppn)

set -e

MODEL_URL="https://github.com/Picovoice/porcupine/raw/master/lib/common/porcupine_params.pv"
PUBLIC_DIR="public"
MODEL_FILE="$PUBLIC_DIR/porcupine_params.pv"

echo "📥 Downloading Porcupine engine model file..."
echo "URL: $MODEL_URL"
echo "Destination: $MODEL_FILE"

# Create public directory if it doesn't exist
mkdir -p "$PUBLIC_DIR"

# Download the model file
if command -v curl >/dev/null 2>&1; then
    curl -L -o "$MODEL_FILE" "$MODEL_URL"
elif command -v wget >/dev/null 2>&1; then
    wget -O "$MODEL_FILE" "$MODEL_URL"
else
    echo "❌ Error: Neither curl nor wget found. Please install one of them."
    exit 1
fi

# Check if download was successful
if [ -f "$MODEL_FILE" ]; then
    FILE_SIZE=$(stat -f%z "$MODEL_FILE" 2>/dev/null || stat -c%s "$MODEL_FILE" 2>/dev/null || echo "unknown")
    echo "✅ Successfully downloaded Porcupine model file"
    echo "   File: $MODEL_FILE"
    echo "   Size: $FILE_SIZE bytes"
else
    echo "❌ Error: Failed to download model file"
    exit 1
fi

echo ""
echo "✅ Porcupine model file is ready!"
echo "   You can now use Porcupine wake word detection."
