#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  FW Gatekeeper — Pi Kiosk Setup Script
#  Target: Raspberry Pi 3B/4/5 with Raspberry Pi OS (64-bit)
#
#  Usage:
#    sudo KIOSK_ID=kiosk-entry-1 KIOSK_NAME="Main Entry" ./setup.sh
#
#  Environment variables:
#    KIOSK_ID     Unique kiosk identifier (default: kiosk-1)
#    KIOSK_NAME   Display name (default: FW Kiosk)
#    KIOSK_TYPE   entry | exit (default: entry)
#    SERVER_URL   Gatekeeper server (default: https://fw-gatekeeper.onrender.com)
#    KIOSK_API_KEY Shared secret for kiosk API access (required in production)
#    KIOSK_UI_KEY  Local secret for protected kiosk web routes (required)
#    KIOSK_SUPERVISOR_PIN  Supervisor-only passcode for manual attendance (required)
# ═══════════════════════════════════════════════════════════════

set -eo pipefail

KIOSK_ID="${KIOSK_ID:-kiosk-1}"
KIOSK_NAME="${KIOSK_NAME:-FW Kiosk}"
KIOSK_TYPE="${KIOSK_TYPE:-entry}"
SERVER_URL="${SERVER_URL:-https://fw-gatekeeper.onrender.com}"
KIOSK_API_KEY="${KIOSK_API_KEY:-}"
KIOSK_UI_KEY="${KIOSK_UI_KEY:-}"
KIOSK_SUPERVISOR_PIN="${KIOSK_SUPERVISOR_PIN:-}"
KIOSK_USER="${KIOSK_USER:-$(logname 2>/dev/null || echo pi)}"
INSTALL_DIR="/opt/fw-gatekeeper"

echo "╔═══════════════════════════════════════════════════╗"
echo "║   FW Gatekeeper — Pi Kiosk Setup                 ║"
echo "╠═══════════════════════════════════════════════════╣"
echo "║   Kiosk ID:   $KIOSK_ID"
echo "║   Kiosk Name: $KIOSK_NAME"
echo "║   Type:       $KIOSK_TYPE"
echo "║   Server:     $SERVER_URL"
echo "║   API Key:    ${KIOSK_API_KEY:+configured}"
echo "║   UI Key:     ${KIOSK_UI_KEY:+configured}"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

if [ "$(id -u)" -ne 0 ]; then
  echo "❌ Run with sudo: sudo KIOSK_ID=$KIOSK_ID ./setup.sh"
  exit 1
fi

if [ -z "$KIOSK_API_KEY" ]; then
  echo "❌ KIOSK_API_KEY is required. Set it to the same value configured on the Gatekeeper server, then rerun setup."
  exit 1
fi

if [ -z "$KIOSK_UI_KEY" ]; then
  echo "❌ KIOSK_UI_KEY is required. Generate a separate local secret (for example: openssl rand -hex 24), then rerun setup."
  exit 1
fi
if [ -z "$KIOSK_SUPERVISOR_PIN" ]; then
  echo "❌ KIOSK_SUPERVISOR_PIN is required for manual attendance controls."
  exit 1
fi

# ─── 1. System Update ──────────────────────────────────────────
echo "[1/7] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# ─── 2. Install Dependencies ───────────────────────────────────
echo "[2/8] Installing dependencies..."
apt-get install -y -qq \
  python3 python3-pip python3-venv python3-dev \
  cmake build-essential \
  libopenblas-dev liblapack-dev \
  gfortran \
  libjpeg-dev libpng-dev \
  libcamera-dev libcamera-apps \
  python3-picamera2 \
  sqlite3 \
  curl wget git \
  firefox-esr \
  unclutter

# ─── 3. Install Kiosk Application ──────────────────────────────
echo "[3/8] Installing FW Gatekeeper kiosk..."
mkdir -p "$INSTALL_DIR"

# Clone or update repo
if [ -d "$INSTALL_DIR/.git" ]; then
  cd "$INSTALL_DIR" && git pull origin master
else
  git clone https://github.com/nztinversive/fw-gatekeeper.git "$INSTALL_DIR"
fi

cd "$INSTALL_DIR/pi-kiosk"

# Python virtual environment
python3 -m venv venv --system-site-packages
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

# ─── 4. Download Face Models ───────────────────────────────────
echo "[4/8] Downloading face models..."
mkdir -p data/models

# dlib shape predictor (for liveness blink detection)
if [ ! -f "data/models/shape_predictor_68_face_landmarks.dat" ]; then
  echo "  Downloading shape predictor (97MB)..."
  wget -q "https://github.com/italojs/facial-landmarks-recognition/raw/master/shape_predictor_68_face_landmarks.dat" \
    -O data/models/shape_predictor_68_face_landmarks.dat
  echo "  ✅ Shape predictor downloaded"
else
  echo "  ✅ Shape predictor already exists"
fi

mkdir -p data/faces

# ─── 5. Write Kiosk Config ─────────────────────────────────────
echo "[5/8] Writing kiosk configuration..."
cat > config_local.py << CONFEOF
"""Local kiosk configuration — overrides config.py defaults."""
SERVER_URL = "$SERVER_URL"
KIOSK_ID = "$KIOSK_ID"
KIOSK_TYPE = "$KIOSK_TYPE"
KIOSK_NAME = "$KIOSK_NAME"
KIOSK_API_KEY = "$KIOSK_API_KEY"
KIOSK_UI_KEY = "$KIOSK_UI_KEY"
KIOSK_SUPERVISOR_PIN = "$KIOSK_SUPERVISOR_PIN"
CONFEOF

# Patch config.py to load local overrides. Keep this out of the tracked source
# file so existing installed repos with the generated block can still pull.
if ! grep -q "config_local" config.py; then
  cat >> config.py << 'PATCHEOF'

# Load local overrides if present
try:
    from config_local import *  # noqa: F401, F403
except ImportError:
    pass
PATCHEOF
fi

# ─── 6. Systemd Services ───────────────────────────────────────
echo "[6/8] Installing systemd services..."

# Main kiosk service (face scanner + Flask web UI)
cat > /etc/systemd/system/fw-gatekeeper-kiosk.service << EOF
[Unit]
Description=FW Gatekeeper Kiosk ($KIOSK_NAME)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$KIOSK_USER
WorkingDirectory=$INSTALL_DIR/pi-kiosk
ExecStart=$INSTALL_DIR/pi-kiosk/venv/bin/python main.py \\
  --server $SERVER_URL \\
  --kiosk-id $KIOSK_ID \\
  --camera auto
Restart=always
RestartSec=5
StartLimitBurst=0
Environment=PYTHONUNBUFFERED=1
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Firefox kiosk display — autostart on desktop login (works with Wayland/labwc)
# Systemd services can't access the Wayland display session, so we use XDG autostart instead
KIOSK_HOME=$(eval echo ~$KIOSK_USER)
mkdir -p "$KIOSK_HOME/.config/autostart"

# Create launcher script that waits for Flask then opens Firefox
cat > "$KIOSK_HOME/fw-gatekeeper-display.sh" << 'DISPLAYEOF'
#!/bin/bash
# FW Gatekeeper — wait for kiosk web server then launch Firefox fullscreen
for i in $(seq 1 60); do
  curl -sf http://localhost:5555/health >/dev/null 2>&1 && break
  sleep 2
done

# Kill any existing Firefox kiosk instances
pkill -f 'firefox.*kiosk.*localhost:5555' 2>/dev/null || true
sleep 1

exec firefox-esr --kiosk http://localhost:5555
DISPLAYEOF
chmod +x "$KIOSK_HOME/fw-gatekeeper-display.sh"
chown $KIOSK_USER:$KIOSK_USER "$KIOSK_HOME/fw-gatekeeper-display.sh"

# XDG autostart entry — runs when the user's desktop session starts
cat > "$KIOSK_HOME/.config/autostart/fw-gatekeeper-display.desktop" << EOF
[Desktop Entry]
Type=Application
Name=FW Gatekeeper Display
Exec=$KIOSK_HOME/fw-gatekeeper-display.sh
X-GNOME-Autostart-enabled=true
Hidden=false
NoDisplay=false
EOF
chown -R $KIOSK_USER:$KIOSK_USER "$KIOSK_HOME/.config/autostart"

# Remove old systemd display service if it exists
systemctl disable fw-gatekeeper-display.service 2>/dev/null || true
rm -f /etc/systemd/system/fw-gatekeeper-display.service

# Watchdog timer — restart kiosk if it dies
cat > /etc/systemd/system/fw-gatekeeper-watchdog.service << 'EOF'
[Unit]
Description=FW Gatekeeper Watchdog

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'systemctl is-active fw-gatekeeper-kiosk.service || systemctl restart fw-gatekeeper-kiosk.service'
EOF

cat > /etc/systemd/system/fw-gatekeeper-watchdog.timer << 'EOF'
[Unit]
Description=Check FW Gatekeeper Kiosk every 30s

[Timer]
OnBootSec=30
OnUnitActiveSec=30

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable fw-gatekeeper-kiosk.service
systemctl enable fw-gatekeeper-watchdog.timer

# ─── 7. Auto-login ─────────────────────────────────────────────
echo "[7/8] Configuring auto-login..."
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $KIOSK_USER --noclear %I \$TERM
EOF

# GPU memory split — give enough for Chromium rendering
CONFIG="/boot/config.txt"
if [ -f "$CONFIG" ] && ! grep -q "gpu_mem=" "$CONFIG"; then
  echo "gpu_mem=128" >> "$CONFIG"
fi

# ─── 8. Permissions & Cleanup ──────────────────────────────────
echo "[8/8] Setting permissions..."
chown -R "$KIOSK_USER:$KIOSK_USER" "$INSTALL_DIR"

# Disable screen blanking
CMDLINE="/boot/cmdline.txt"
if [ -f "$CMDLINE" ] && ! grep -q "consoleblank=0" "$CMDLINE"; then
  sed -i 's/$/ consoleblank=0/' "$CMDLINE"
fi

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║   ✅ FW Gatekeeper Kiosk Setup Complete!          ║"
echo "╠═══════════════════════════════════════════════════╣"
echo "║                                                   ║"
echo "║   Kiosk ID:   $KIOSK_ID"
echo "║   Server:     $SERVER_URL"
echo "║                                                   ║"
echo "║   Commands:                                       ║"
echo "║   Start:   sudo systemctl start fw-gatekeeper-kiosk"
echo "║   Stop:    sudo systemctl stop fw-gatekeeper-kiosk"
echo "║   Logs:    journalctl -u fw-gatekeeper-kiosk -f   ║"
echo "║   Status:  systemctl status fw-gatekeeper-kiosk   ║"
echo "║                                                   ║"
echo "║   Reboot to start automatically:                  ║"
echo "║   sudo reboot                                     ║"
echo "╚═══════════════════════════════════════════════════╝"
