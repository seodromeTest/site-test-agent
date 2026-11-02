#!/bin/bash
# Testi çalıştırır. Proxy arkasındaki ortamlarda Node'un fetch'i de proxy'yi kullansın.
cd "$(dirname "$0")"
export NODE_USE_ENV_PROXY=1 NODE_NO_WARNINGS=1
exec node run.js "$@"
