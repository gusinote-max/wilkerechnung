#!/bin/bash
# Patch zustand ESM middleware to replace import.meta.env with process.env.NODE_ENV
# This is needed because Metro bundler doesn't support import.meta in classic scripts
ZUSTAND_FILE="node_modules/zustand/esm/middleware.mjs"
if [ -f "$ZUSTAND_FILE" ]; then
  sed -i 's/import\.meta\.env ? import\.meta\.env\.MODE : void 0/typeof process !== "undefined" \&\& process.env \&\& process.env.NODE_ENV || void 0/g' "$ZUSTAND_FILE"
  echo "Patched zustand ESM middleware for Metro compatibility"
fi
