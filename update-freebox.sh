#!/bin/bash
# ==============================================================================
# Script de mise à jour automatique depuis GitHub pour Planning Pro
# Compatible : VM Freebox OS (Delta / Ultra), Ubuntu, Debian, VPS
# ==============================================================================

set -e

echo "=========================================================="
echo "🔄 Mise à jour de Planning Pro depuis GitHub"
echo "=========================================================="

APP_DIR=$(pwd)

# 1. Sauvegarde préventive de sécurité du fichier de base de données
if [ -f "$APP_DIR/data/planning_db.json" ]; then
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  BACKUP_FILE="$APP_DIR/data/planning_db_backup_${TIMESTAMP}.json"
  cp "$APP_DIR/data/planning_db.json" "$BACKUP_FILE"
  echo "🛡️ Sauvegarde de sécurité créée : $BACKUP_FILE"
fi

# 2. Récupération des dernières modifications du code depuis GitHub
echo "📥 Téléchargement des nouveaux fichiers depuis GitHub..."
git pull origin main || git pull

# 3. Reconstruction et relance du conteneur avec la nouvelle version
echo "🐳 Reconstruction du conteneur Docker avec les nouveaux fichiers..."
docker compose up -d --build

echo ""
echo "=========================================================="
echo "🎉 Mise à jour terminée avec succès !"
echo "=========================================================="
echo "✅ Vos données (planning, salariés, notes, PIN, clé) sont restées intactes."
echo "✅ L'application tourne désormais avec la nouvelle version de code."
echo ""
