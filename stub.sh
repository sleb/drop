#!/bin/bash
set -euo pipefail
curl -fsSL https://github.com/sleb/drop/releases/latest/download/drop-linux-x64 -o /usr/local/bin/drop
chmod +x /usr/local/bin/drop
/usr/local/bin/drop 2>&1 | tee /var/log/drop.log
