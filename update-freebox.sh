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

# 1. Sauvegarde préventive de sécurité de la base de données actuelle
if [ -f "$APP_DIR/data/planning_db.json" ]; then
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  BACKUP_FILE="$APP_DIR/data/planning_db_backup_${TIMESTAMP}.json"
  cp "$APP_DIR/data/planning_db.json" "$BACKUP_FILE"
  cp "$APP_DIR/data/planning_db.json" /tmp/planning_db_restore_temp.json
  echo "🛡️ Sauvegarde de sécurité créée : $BACKUP_FILE"
fi

# 2. Débloquer Git en cas de conflit sur le fichier de base de données
git checkout -- data/planning_db.json 2>/dev/null || git stash 2>/dev/null || true

# 3. Récupération des dernières modifications du code depuis GitHub
echo "📥 Téléchargement des nouveaux fichiers depuis GitHub..."
git pull origin main || git pull

# 4. Restauration de vos vraies données locales
if [ -f /tmp/planning_db_restore_temp.json ]; then
  cp /tmp/planning_db_restore_temp.json "$APP_DIR/data/planning_db.json"
  rm -f /tmp/planning_db_restore_temp.json
fi

# 5. Reconstruction et relance du conteneur avec la nouvelle version
echo "🐳 Reconstruction du conteneur Docker avec les nouveaux fichiers..."
docker compose up -d --build

echo ""
echo "=========================================================="
echo "🎉 Mise à jour terminée avec succès !"
echo "=========================================================="
echo "✅ Vos données (planning, salariés, notes, PIN, clé) sont restées intactes."
echo "✅ L'application tourne désormais avec la nouvelle version de code."
echo ""
