const cds = require('@sap/cds');
const { today, db, idOf, getAsset, reload, ledger, openMaintenance } = require('./lib/common');

module.exports = class AssetAdminService extends cds.ApplicationService {
  init() {
    const { Assets, Departments } = this.entities;
    const { Asset, AssetAssignment, MaintenanceRecord, OwnershipLedger, Employee, Vendor, ArchiveRecord, AssetCategory } = db();
    const need = (req, cond, msg) => { if (!cond) req.reject(400, msg); };
    const activeEmployee = async (req, id) => {
      const e = id && await SELECT.one.from(Employee).where({ employee_id: id });
      if (!e) req.reject(404, 'Employee not found');
      if (e.status !== 'ACTIVE') req.reject(400, 'Employee must be ACTIVE');
      return e;
    };

    // ---- master data rules ----
    this.before('SAVE', Assets, async req => {                       // FR-001 / FR-016
      const c = req.data.assetCategory_asset_category_id;
      if (c) { const cat = await SELECT.one.from(AssetCategory).where({ asset_category_id: c });
        if (cat && cat.is_active === false) req.reject(400, 'Category is inactive'); }
    });
    // Only unused assets may be deleted. Preserve assignment, maintenance, archive and
    // ownership history; the Admin role is enforced by AssetAdminService at the service boundary.
    this.before('DELETE', Assets, async req => {
      // Deleting an unsaved draft must not be blocked by the active asset's history.
      if (req.data && req.data.IsActiveEntity === false) return;
      const id = (req.data && req.data.asset_id) || idOf(req.params && req.params[0]);
      if (!id) req.reject(400, 'Could not identify the asset to delete');
      const a = await SELECT.one.from(Asset).where({ asset_id: id });
      if (!a) return; // Let CAP return its normal not-found response.
      need(req, a.status === 'AVAILABLE' && !a.current_holder_employee_id,
        'Only AVAILABLE assets that are not assigned can be deleted. Retire or archive assets that have been used.');

      const [assignments, maintenance, history, archives] = await Promise.all([
        SELECT.one.from(AssetAssignment).columns('count(*) as c').where({ asset_asset_id: id }),
        SELECT.one.from(MaintenanceRecord).columns('count(*) as c').where({ asset_asset_id: id }),
        SELECT.one.from(OwnershipLedger).columns('count(*) as c').where({ asset_asset_id: id }),
        SELECT.one.from(ArchiveRecord).columns('count(*) as c').where({ asset_asset_id: id })
      ]);
      need(req, Number(assignments.c) === 0 && Number(maintenance.c) === 0 && Number(history.c) === 0 && Number(archives.c) === 0,
        'This asset has lifecycle records and cannot be deleted. Keep its audit history and use Retire/Archive instead.');
    });
    this.before('DELETE', Departments, async req => {                // FR-027
      const n = await SELECT.one.from(Employee).columns('count(*) as c').where({ department_dept_id: req.data.dept_id });
      if (n.c) req.reject(400, 'Department is used by employees; deactivate it instead');
    });

    // ---- FR-003 / FR-004 ----
    this.on('assign', Assets, async req => {
      const id = idOf(req.params[0]); const { employeeId, distributionDate, remarks } = req.data;
      const a = await getAsset(req, id);
      need(req, a.status === 'AVAILABLE', 'Only AVAILABLE assets can be assigned');
      await activeEmployee(req, employeeId);
      need(req, distributionDate, 'Distribution date is mandatory');
      need(req, distributionDate >= a.purchase_date, 'Distribution date cannot be earlier than procurement date');
      await INSERT.into(AssetAssignment).entries({ asset_asset_id: id, employee_employee_id: employeeId,
        assigned_date: distributionDate, assigned_by: req.user.id, assignment_status: 'ACTIVE', remarks });
      await UPDATE(Asset).set({ status: 'ASSIGNED', current_holder_employee_id: employeeId,
        first_distribution_date: a.first_distribution_date ?? distributionDate }).where({ asset_id: id });
      await ledger(req, { asset_asset_id: id, action: 'ASSIGNED', to_employee_employee_id: employeeId,
        transition_date: distributionDate, notes: remarks });
      return reload(id);
    });

    // ---- FR-005 ----
    this.on('transfer', Assets, async req => {
      const id = idOf(req.params[0]); const { toEmployeeId, transferDate, remarks } = req.data;
      const a = await getAsset(req, id);
      need(req, a.status === 'ASSIGNED', 'Only ASSIGNED assets can be transferred');
      need(req, toEmployeeId !== a.current_holder_employee_id, 'Cannot transfer to the current holder');
      await activeEmployee(req, toEmployeeId);
      const cur = await SELECT.one.from(AssetAssignment).where({ asset_asset_id: id, assignment_status: 'ACTIVE' });
      need(req, cur, 'No active assignment found');
      need(req, transferDate && transferDate >= cur.assigned_date, 'Transfer date cannot be before the current assignment date');
      await UPDATE(AssetAssignment).set({ assignment_status: 'CLOSED', actual_return_date: transferDate })
        .where({ assignment_id: cur.assignment_id });
      await INSERT.into(AssetAssignment).entries({ asset_asset_id: id, employee_employee_id: toEmployeeId,
        assigned_date: transferDate, assigned_by: req.user.id, assignment_status: 'ACTIVE', remarks });
      await UPDATE(Asset).set({ current_holder_employee_id: toEmployeeId }).where({ asset_id: id });
      await ledger(req, { asset_asset_id: id, action: 'TRANSFERRED', from_employee_employee_id: a.current_holder_employee_id,
        to_employee_employee_id: toEmployeeId, transition_date: transferDate, notes: remarks });
      return reload(id);
    });

    // ---- FR-006 ----
    this.on('returnAsset', Assets, async req => {
      const id = idOf(req.params[0]); const { returnDate, remarks } = req.data;
      const a = await getAsset(req, id);
      need(req, a.status === 'ASSIGNED', 'Only ASSIGNED assets can be returned (complete maintenance first)');
      const cur = await SELECT.one.from(AssetAssignment).where({ asset_asset_id: id, assignment_status: 'ACTIVE' });
      need(req, cur, 'No active assignment found');
      const d = returnDate || today();
      need(req, d >= cur.assigned_date, 'Return date cannot be before the assignment date');
      await UPDATE(AssetAssignment).set({ assignment_status: 'RETURNED', actual_return_date: d, remarks })
        .where({ assignment_id: cur.assignment_id });
      await UPDATE(Asset).set({ status: 'AVAILABLE', current_holder_employee_id: null }).where({ asset_id: id });
      await ledger(req, { asset_asset_id: id, action: 'RETURNED', from_employee_employee_id: a.current_holder_employee_id,
        transition_date: d, notes: remarks });
      return reload(id);
    });

    // ---- FR-008 / FR-009 ----
    this.on('createMaintenance', Assets, async req => {
      const id = idOf(req.params[0]);
      await openMaintenance(req, id, req.data.maintenanceType, req.data.description);
      return reload(id);
    });
    this.on('completeMaintenance', Assets, async req => {
      const id = idOf(req.params[0]); const { outcome, vendorId, cost } = req.data;
      const a = await getAsset(req, id);
      need(req, a.status === 'MAINTENANCE', 'Asset is not in maintenance');
      const m = await SELECT.one.from(MaintenanceRecord)
        .where({ asset_asset_id: id, status: { in: ['OPEN', 'IN_PROGRESS'] } });
      need(req, m, 'No open maintenance record');
      need(req, outcome, 'Outcome is mandatory');
      need(req, cost == null || cost >= 0, 'Cost cannot be negative');
      const v = await SELECT.one.from(Vendor).where({ vendor_id: vendorId });
      if (!v) req.reject(404, 'Vendor not found');
      need(req, v.is_active !== false, 'Vendor is inactive');
      await UPDATE(MaintenanceRecord).set({ status: 'COMPLETED', completed_date: today(),
        service_vendor_vendor_id: vendorId, outcome, cost }).where({ maintenance_id: m.maintenance_id });
      // keep the holder: back to ASSIGNED if someone still holds it, else AVAILABLE
      await UPDATE(Asset).set({ status: a.current_holder_employee_id ? 'ASSIGNED' : 'AVAILABLE' }).where({ asset_id: id });
      await ledger(req, { asset_asset_id: id, action: 'MAINTENANCE_COMPLETED',
        to_employee_employee_id: a.current_holder_employee_id, notes: outcome });
      return reload(id);
    });

    // ---- FR-010 ----
    this.on('retire', Assets, async req => {
      const id = idOf(req.params[0]); const { reason, retirementDate } = req.data;
      const a = await getAsset(req, id);
      need(req, a.status !== 'ASSIGNED' && !a.current_holder_employee_id, 'Assigned asset cannot be retired');
      need(req, a.status === 'AVAILABLE', `Asset in status ${a.status} cannot be retired`);
      need(req, reason, 'Reason is mandatory');
      const d = retirementDate || today();
      need(req, d >= a.purchase_date, 'Retirement date cannot be before purchase date');
      await UPDATE(Asset).set({ status: 'RETIRED', retirement_reason: reason, retirement_date: d }).where({ asset_id: id });
      await ledger(req, { asset_asset_id: id, action: 'RETIRED', transition_date: d, notes: reason });
      return reload(id);
    });

    // ---- FR-011 / FR-012 ----
    this.on('archive', Assets, async req => {
      const id = idOf(req.params[0]); const { archiveReason, disposalMethod, certNo, complianceRef } = req.data;
      const a = await getAsset(req, id);
      need(req, a.status !== 'ASSIGNED' && !a.current_holder_employee_id, 'Assigned asset cannot be archived; return it first');
      need(req, a.status === 'RETIRED', 'Only RETIRED assets can be archived');
      need(req, archiveReason && disposalMethod, 'Reason and disposal method are mandatory');
      await INSERT.into(ArchiveRecord).entries({ asset_asset_id: id, archived_at: new Date(), archived_by: req.user.id,
        reason: archiveReason, disposal_method: disposalMethod, disposal_cert_no: certNo, compliance_ref: complianceRef });
      await UPDATE(Asset).set({ status: 'ARCHIVED' }).where({ asset_id: id });
      await ledger(req, { asset_asset_id: id, action: 'ARCHIVED', notes: archiveReason });
      return reload(id);
    });

    return super.init();
  }
};
