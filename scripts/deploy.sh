#!/usr/bin/env bash

set -Eeuo pipefail

APP_NAME="${APP_NAME:-collab}"
APP_BASE="${APP_BASE:-/opt/${APP_NAME}}"
RELEASES_DIR="${APP_BASE}/releases"
CURRENT_LINK="${APP_BASE}/current"
PREVIOUS_LINK="${APP_BASE}/previous"
SHARED_DIR="${APP_BASE}/shared"
SHARED_ENV="${SHARED_DIR}/.env"
LOG_FILE="${LOG_FILE:-${APP_BASE}/deploy.log}"
REPO_URL="${REPO_URL:-}"
BRANCH="${BRANCH:-main}"
CF_CERT_DIR="${CF_CERT_DIR:-/etc/ssl/cloudflare}"
CF_CERT_FILE="${CF_CERT_FILE:-${CF_CERT_DIR}/cert.pem}"
CF_KEY_FILE="${CF_KEY_FILE:-${CF_CERT_DIR}/key.pem}"
USE_HOST_NGINX="${USE_HOST_NGINX:-0}"

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

readonly SELF_PATH="$(readlink -f "$0" 2>/dev/null || realpath "$0")"

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

die() {
  log "ERROR: $*"
  send_telegram "❌ ${APP_NAME} deploy failed: $*"
  exit 1
}

send_telegram() {
  local text="$1"
  if [[ -z "${TELEGRAM_BOT_TOKEN}" || -z "${TELEGRAM_CHAT_ID}" ]]; then
    return 0
  fi
  curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${text}" >/dev/null || true
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    die "Run as root (or with sudo)."
  fi
}

require_cmd() {
  local cmd="$1"
  command -v "${cmd}" >/dev/null 2>&1 || die "Missing required command: ${cmd}"
}

setup_logging() {
  if [[ "${DEPLOY_LOG_READY:-0}" == "1" ]]; then
    return 0
  fi
  mkdir -p "${APP_BASE}"
  touch "${LOG_FILE}"
  chmod 640 "${LOG_FILE}" || true
  exec > >(tee -a "${LOG_FILE}") 2>&1
  export DEPLOY_LOG_READY=1
}

port_free_or_allowed() {
  local port="$1"
  if ss -ltnH "( sport = :${port} )" | grep -q .; then
    if [[ "${port}" == "80" || "${port}" == "443" ]]; then
      if docker ps --format '{{.Ports}}' | grep -qE "(^|,)0.0.0.0:${port}->|(^|,):::${port}->"; then
        return 0
      fi
    fi
    return 1
  fi
  return 0
}

random_secret() {
  openssl rand -base64 48 | tr -d '\n'
}

ensure_shared_env() {
  mkdir -p "${SHARED_DIR}"
  if [[ -f "${SHARED_ENV}" ]]; then
    return 0
  fi
  local source_env=""
  if [[ -L "${CURRENT_LINK}" && -f "${CURRENT_LINK}/.env.example" ]]; then
    source_env="${CURRENT_LINK}/.env.example"
  elif [[ -f ".env.example" ]]; then
    source_env="$(pwd)/.env.example"
  else
    die "Cannot find .env.example to create ${SHARED_ENV}"
  fi

  cp "${source_env}" "${SHARED_ENV}"
  chmod 600 "${SHARED_ENV}"

  local jwt jwt_refresh db redis livekit
  jwt="$(random_secret)"
  jwt_refresh="$(random_secret)"
  db="$(random_secret)"
  redis="$(random_secret)"
  livekit="$(random_secret)"

  sed -i \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=${jwt}|" \
    -e "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${jwt_refresh}|" \
    -e "s|^WS_JWT_SECRET=.*|WS_JWT_SECRET=${jwt}|" \
    -e "s|^DB_PASSWORD=.*|DB_PASSWORD=${db}|" \
    -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=${redis}|" \
    -e "s|^LIVEKIT_API_SECRET=.*|LIVEKIT_API_SECRET=${livekit}|" \
    "${SHARED_ENV}" || true

  if ! grep -q '^DATABASE_URL=' "${SHARED_ENV}"; then
    echo "DATABASE_URL=postgresql://collab:${db}@postgres:5432/collab?sslmode=disable" >>"${SHARED_ENV}"
  fi
  if ! grep -q '^REDIS_URL=' "${SHARED_ENV}"; then
    echo "REDIS_URL=redis://redis:6379" >>"${SHARED_ENV}"
  fi

  log "Created ${SHARED_ENV} with generated secrets."
}

check_cloudflare_certs() {
  if [[ ! -f "${CF_CERT_FILE}" || ! -f "${CF_KEY_FILE}" ]]; then
    die "Cloudflare Origin CA certs not found at ${CF_CERT_FILE} and ${CF_KEY_FILE}"
  fi
}

preflight() {
  require_root
  setup_logging
  log "Running preflight checks..."

  require_cmd git
  require_cmd docker
  require_cmd ss
  require_cmd openssl
  require_cmd curl

  if ! docker compose version >/dev/null 2>&1; then
    die "docker compose plugin not available."
  fi

  port_free_or_allowed 80 || die "Port 80 is busy."
  port_free_or_allowed 443 || die "Port 443 is busy."

  ensure_shared_env
  check_cloudflare_certs
  send_telegram "✅ ${APP_NAME} preflight passed on $(hostname)"
  log "Preflight completed."
}

init_server() {
  require_root
  setup_logging
  send_telegram "🚀 ${APP_NAME} server init started on $(hostname)"
  log "Updating system packages..."
  apt update
  DEBIAN_FRONTEND=noninteractive apt upgrade -y

  log "Installing base dependencies..."
  DEBIAN_FRONTEND=noninteractive apt install -y \
    git curl jq nginx ufw fail2ban unattended-upgrades \
    ca-certificates gnupg lsb-release apt-transport-https

  if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sh
  fi
  if ! docker compose version >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt install -y docker-compose-plugin
  fi

  systemctl enable docker
  systemctl start docker
  systemctl enable fail2ban
  systemctl restart fail2ban
  dpkg-reconfigure -f noninteractive unattended-upgrades || true

  log "Configuring firewall..."
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 7880/tcp
  ufw allow 7881/tcp
  ufw allow 7882/udp
  ufw --force enable

  if ! id -u deploy >/dev/null 2>&1; then
    useradd -m -s /bin/bash deploy
    mkdir -p /home/deploy/.ssh
    chmod 700 /home/deploy/.ssh
    if [[ -n "${DEPLOY_SSH_PUBLIC_KEY:-}" ]]; then
      echo "${DEPLOY_SSH_PUBLIC_KEY}" >/home/deploy/.ssh/authorized_keys
      chmod 600 /home/deploy/.ssh/authorized_keys
      chown -R deploy:deploy /home/deploy/.ssh
    else
      log "DEPLOY_SSH_PUBLIC_KEY is empty; add deploy user key manually."
    fi
    usermod -aG docker deploy
  fi

  send_telegram "✅ ${APP_NAME} server init completed on $(hostname)"
  log "Server initialization completed."
}

resolve_repo_url() {
  if [[ -n "${REPO_URL}" ]]; then
    echo "${REPO_URL}"
    return 0
  fi
  if [[ -L "${CURRENT_LINK}" ]]; then
    git -C "${CURRENT_LINK}" remote get-url origin
    return 0
  fi
  die "REPO_URL is required for first deploy."
}

prepare_release() {
  mkdir -p "${RELEASES_DIR}" "${SHARED_DIR}"
  local ts release_dir repo_url
  ts="$(date +%Y%m%d%H%M%S)"
  release_dir="${RELEASES_DIR}/${ts}"
  repo_url="$(resolve_repo_url)"

  log "Cloning ${repo_url} (${BRANCH}) into ${release_dir}"
  git clone --depth 1 --branch "${BRANCH}" "${repo_url}" "${release_dir}"
  local commit_hash
  commit_hash="$(git -C "${release_dir}" rev-parse HEAD)"
  echo "${commit_hash}" > "${release_dir}/.deploy_commit"
  log "Prepared release commit: ${commit_hash}"

  if [[ -L "${CURRENT_LINK}" ]]; then
    ln -sfn "$(readlink -f "${CURRENT_LINK}")" "${PREVIOUS_LINK}"
  fi

  ensure_shared_env_for_release "${release_dir}"
  ln -sfn "${release_dir}" "${CURRENT_LINK}"
  echo "${release_dir}"
}

verify_release_commit() {
  local target_dir="$1"
  local commit_file="${target_dir}/.deploy_commit"
  [[ -f "${commit_file}" ]] || die "Missing release commit marker: ${commit_file}"
  local recorded_commit actual_commit
  recorded_commit="$(tr -d '[:space:]' < "${commit_file}")"
  actual_commit="$(git -C "${target_dir}" rev-parse HEAD)"
  [[ -n "${recorded_commit}" ]] || die "Empty release commit marker in ${commit_file}"
  if [[ "${recorded_commit}" != "${actual_commit}" ]]; then
    die "Release commit mismatch (${recorded_commit} != ${actual_commit})"
  fi
  log "Release commit verified: ${actual_commit}"
}

ensure_shared_env_for_release() {
  local release_dir="$1"
  mkdir -p "${SHARED_DIR}"
  if [[ ! -f "${SHARED_ENV}" ]]; then
    if [[ ! -f "${release_dir}/.env.example" ]]; then
      die "Missing .env.example in release ${release_dir}"
    fi
    cp "${release_dir}/.env.example" "${SHARED_ENV}"
    chmod 600 "${SHARED_ENV}"
    local jwt db redis livekit
    jwt="$(random_secret)"
    db="$(random_secret)"
    redis="$(random_secret)"
    livekit="$(random_secret)"
    sed -i \
      -e "s|^JWT_SECRET=.*|JWT_SECRET=${jwt}|" \
      -e "s|^WS_JWT_SECRET=.*|WS_JWT_SECRET=${jwt}|" \
      -e "s|^DB_PASSWORD=.*|DB_PASSWORD=${db}|" \
      -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=${redis}|" \
      -e "s|^LIVEKIT_API_SECRET=.*|LIVEKIT_API_SECRET=${livekit}|" \
      "${SHARED_ENV}" || true
  fi
  ln -sfn "${SHARED_ENV}" "${release_dir}/.env"
}

compose_up() {
  local target_dir="$1"
  verify_release_commit "${target_dir}"
  log "Starting docker compose stack..."
  docker compose \
    --env-file "${SHARED_ENV}" \
    -f "${target_dir}/docker-compose.yml" \
    -f "${target_dir}/docker-compose.prod.yml" \
    up -d --build
}

run_migrations() {
  local target_dir="$1"
  if [[ -f "${target_dir}/package.json" ]]; then
    log "Running database migrations..."
    (cd "${target_dir}" && npm run db:migrate) || die "Migration command failed"
  fi
}

health_check() {
  log "Running health checks..."
  curl -fsS http://127.0.0.1:3000 >/dev/null || die "Web health check failed"
  curl -fsS http://127.0.0.1:4000/health >/dev/null || die "API health check failed"
  curl -fsS http://127.0.0.1:4001/health/ready >/dev/null || die "WS health check failed"
}

smoke_next_assets() {
  log "Running Next.js HTML/assets smoke check..."

  local html
  html="$(curl -fsS http://127.0.0.1:3000/login)" || die "Failed to fetch /login HTML from web service"

  if ! printf '%s' "${html}" | grep -qi '<!DOCTYPE html>'; then
    die "Quirks risk: /login response does not contain <!DOCTYPE html>"
  fi

  local css_path js_path
  css_path="$(printf '%s' "${html}" | grep -Eo '/_next/static/[^"]+\.css' | head -n1 || true)"
  js_path="$(printf '%s' "${html}" | grep -Eo '/_next/static/[^"]+\.js' | head -n1 || true)"

  [[ -n "${css_path}" ]] || die "No Next CSS asset found in /login HTML"
  [[ -n "${js_path}" ]] || die "No Next JS asset found in /login HTML"

  local css_headers js_headers
  css_headers="$(curl -fsSI "http://127.0.0.1:3000${css_path}")" || die "Failed to fetch CSS asset: ${css_path}"
  js_headers="$(curl -fsSI "http://127.0.0.1:3000${js_path}")" || die "Failed to fetch JS asset: ${js_path}"

  if ! printf '%s' "${css_headers}" | grep -qi '^content-type:.*text/css'; then
    die "CSS asset content-type is invalid: ${css_path}"
  fi
  if ! printf '%s' "${js_headers}" | grep -qi '^content-type:.*javascript'; then
    die "JS asset content-type is invalid: ${js_path}"
  fi

  log "Next.js smoke check passed: doctype + css/js assets are valid."
}

configure_nginx() {
  local target_dir="$1"
  if docker compose \
    --env-file "${SHARED_ENV}" \
    -f "${target_dir}/docker-compose.yml" \
    -f "${target_dir}/docker-compose.prod.yml" \
    config --services | grep -qx nginx; then
    log "Nginx is containerized; ensuring nginx service is up."
    docker compose \
      --env-file "${SHARED_ENV}" \
      -f "${target_dir}/docker-compose.yml" \
      -f "${target_dir}/docker-compose.prod.yml" \
      up -d nginx
    return 0
  fi

  if [[ "${USE_HOST_NGINX}" != "1" ]]; then
    log "Host nginx setup skipped (USE_HOST_NGINX=0)."
    return 0
  fi

  local src="${target_dir}/nginx/collab.conf"
  [[ -f "${src}" ]] || die "Missing nginx config at ${src}"
  cp "${src}" /etc/nginx/sites-available/collab.conf
  ln -sfn /etc/nginx/sites-available/collab.conf /etc/nginx/sites-enabled/collab.conf
  nginx -t || die "nginx config test failed"
  systemctl reload nginx
}

install_backup_cron() {
  local target_dir="$1"
  local backup_script="/usr/local/bin/${APP_NAME}-backup.sh"
  cat >"${backup_script}" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
ts=\$(date +%Y%m%d_%H%M%S)
mkdir -p ${APP_BASE}/backups
docker compose --env-file ${SHARED_ENV} -f ${target_dir}/docker-compose.yml -f ${target_dir}/docker-compose.prod.yml exec -T postgres pg_dump -U \${DB_USER:-collab} \${DB_NAME:-collab} > ${APP_BASE}/backups/db_\${ts}.sql
find ${APP_BASE}/backups -type f -name 'db_*.sql' -mtime +7 -delete
EOF
  chmod +x "${backup_script}"
  (crontab -l 2>/dev/null | grep -v "${APP_NAME}-backup.sh" || true; echo "0 3 * * * ${backup_script} >> ${APP_BASE}/backup.log 2>&1") | crontab -
  log "Backup cron configured (daily at 03:00)."
}

cleanup_old_images() {
  log "Pruning old docker images..."
  docker system prune -f || true
}

deploy() {
  require_root
  setup_logging
  send_telegram "🚀 ${APP_NAME} deploy started on $(hostname)"
  preflight
  local release_dir
  release_dir="$(prepare_release)"
  compose_up "${release_dir}"
  run_migrations "${release_dir}"
  configure_nginx "${release_dir}"
  health_check
  smoke_next_assets
  install_backup_cron "${release_dir}"
  send_telegram "✅ ${APP_NAME} deploy succeeded on $(hostname)"
  log "Deploy completed successfully."
}

update() {
  require_root
  setup_logging
  send_telegram "🔄 ${APP_NAME} update started on $(hostname)"
  preflight
  local release_dir
  release_dir="$(prepare_release)"
  compose_up "${release_dir}"
  run_migrations "${release_dir}"
  health_check
  smoke_next_assets
  cleanup_old_images
  send_telegram "✅ ${APP_NAME} update succeeded on $(hostname)"
  log "Update completed successfully."
}

rollback() {
  require_root
  setup_logging
  send_telegram "↩️ ${APP_NAME} rollback started on $(hostname)"
  [[ -L "${PREVIOUS_LINK}" ]] || die "No previous release found."
  ln -sfn "$(readlink -f "${PREVIOUS_LINK}")" "${CURRENT_LINK}"
  local target_dir
  target_dir="$(readlink -f "${CURRENT_LINK}")"
  compose_up "${target_dir}"
  health_check
  smoke_next_assets
  send_telegram "✅ ${APP_NAME} rollback succeeded on $(hostname)"
  log "Rollback completed successfully."
}

status() {
  require_root
  setup_logging
  local target_dir
  target_dir="$(readlink -f "${CURRENT_LINK}" 2>/dev/null || true)"
  [[ -n "${target_dir}" ]] || die "No current release deployed."
  docker compose --env-file "${SHARED_ENV}" -f "${target_dir}/docker-compose.yml" -f "${target_dir}/docker-compose.prod.yml" ps
}

usage() {
  cat <<EOF
Usage: sudo ${SELF_PATH} <command>

Commands:
  preflight     Run validation checks before deploy
  init          Initialize VPS (packages, firewall, deploy user)
  deploy        First deploy (clone, env, compose up, health, backups)
  update        Deploy new release (new clone + migrate + health)
  rollback      Switch current to previous release and restart
  health        Run local health checks
  status        Show compose service status

Important environment variables:
  REPO_URL=https://your/repo.git   (required for first deploy)
  BRANCH=main
  APP_BASE=/opt/collab
  TELEGRAM_BOT_TOKEN=...
  TELEGRAM_CHAT_ID=...
  DEPLOY_SSH_PUBLIC_KEY='ssh-ed25519 AAAA...'
EOF
}

main() {
  local cmd="${1:-}"
  case "${cmd}" in
    preflight) preflight ;;
    init) init_server ;;
    deploy) deploy ;;
    update) update ;;
    rollback) rollback ;;
    health) health_check ;;
    status) status ;;
    *) usage; exit 1 ;;
  esac
}

main "${1:-}"
