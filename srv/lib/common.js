const cds = require('@sap/cds');
const today = () => new Date().toISOString().slice(0, 10);
const db = () => cds.entities('asset.lifecycle.db');
const idOf = p => (p && typeof p === 'object') ? p.asset_id : p;

async function getAsset(req, id) {
  const a = await SELECT.one.from(db().Asset).where({ asset_id: id });
  if (!a) req.reject(404, 'Asset not found');
  return a;
}
const reload = id => SELECT.one.from(db().Asset).where({ asset_id: id });

// FR-007: the only place that writes ledger rows
const ledger = (req, e) => INSERT.into(db().OwnershipLedger)
  .entries({ transition_date: today(), recorded_by: req.user.id, ...e });

// FR-008 (shared by the Admin action and the User request)
async function openMaintenance(req, assetId, type, description, reportedByEmployeeId = null) {
  const { MaintenanceRecord, Asset } = db();
  const a = await getAsset(req, assetId);
  if (!['AVAILABLE', 'ASSIGNED'].includes(a.status))
    req.reject(400, `Maintenance not allowed for ${a.status} assets`);
  const open = await SELECT.one.from(MaintenanceRecord)
    .where({ asset_asset_id: assetId, status: { in: ['OPEN', 'APPROVED', 'IN_PROGRESS'] } });
  if (open) req.reject(400, 'An open maintenance request already exists');
  await INSERT.into(MaintenanceRecord).entries({ asset_asset_id: assetId, type, description,
    reported_by_employee_id: reportedByEmployeeId, reported_date: today(), status: 'OPEN' });
  await UPDATE(Asset).set({ status: 'MAINTENANCE' }).where({ asset_id: assetId });
  await ledger(req, { asset_asset_id: assetId, action: 'MAINTENANCE',
    from_employee_employee_id: a.current_holder_employee_id, notes: description });
}
module.exports = { today, db, idOf, getAsset, reload, ledger, openMaintenance };
