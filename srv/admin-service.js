const cds = require('@sap/cds');
const { today, db, idOf, getAsset, reload, ledger, openMaintenance } = require('./lib/common');

module.exports = class AssetAdminService extends cds.ApplicationService {
  init() {
    const { Assets, Departments } = this.entities;
    const { Asset, AssetAssignment, MaintenanceRecord, OwnershipLedger, Employee, Vendor, ArchiveRecord, AssetCategory, AssetRequest } = db();
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


    // FR-030: Admin reviews manager asset requests and fulfills approved requests by assigning an available asset.
    this.on('fulfillAssetRequest', async req => {
      const { requestId, assetId, distributionDate, remarks } = req.data;
      need(req, requestId && assetId && distributionDate, 'Request, asset, and distribution date are mandatory');
      const request = await SELECT.one.from(AssetRequest).where({ request_id: requestId });
      if (!request) req.reject(404, 'Asset request not found');
      need(req, request.status === 'PENDING', 'Only pending requests can be fulfilled');
      const asset = await getAsset(req, assetId);
      need(req, asset.status === 'AVAILABLE', 'Only AVAILABLE assets can be assigned');
      need(req, asset.assetCategory_asset_category_id === request.category_asset_category_id,
        'Selected asset does not match the requested category');
      const employee = await activeEmployee(req, request.employee_employee_id);
      need(req, distributionDate >= asset.purchase_date, 'Distribution date cannot be earlier than procurement date');
      await INSERT.into(AssetAssignment).entries({
        asset_asset_id: assetId, employee_employee_id: employee.employee_id,
        assigned_date: distributionDate, assigned_by: req.user.id, assignment_status: 'ACTIVE',
        remarks: remarks || request.reason
      });
      await UPDATE(Asset).set({
        status: 'ASSIGNED', current_holder_employee_id: employee.employee_id,
        first_distribution_date: asset.first_distribution_date ?? distributionDate
      }).where({ asset_id: assetId });
      await ledger(req, {
        asset_asset_id: assetId, action: 'ASSIGNED', to_employee_employee_id: employee.employee_id,
        transition_date: distributionDate, notes: remarks || ('Fulfilled request ' + requestId)
      });
      await UPDATE(AssetRequest).set({
        status: 'FULFILLED', reviewed_by: req.user.id, reviewed_at: new Date(),
        review_notes: remarks || 'Request fulfilled and asset assigned', fulfilled_asset_asset_id: assetId
      }).where({ request_id: requestId });
      return 'Request fulfilled. Asset ' + (asset.asset_tag || assetId) + ' assigned to ' + employee.full_name + '.';
    });

    this.on('rejectAssetRequest', async req => {
      const { requestId, reviewNotes } = req.data;
      need(req, requestId, 'Request ID is mandatory');
      need(req, reviewNotes && reviewNotes.trim(), 'Please provide a reason for rejection');
      const request = await SELECT.one.from(AssetRequest).where({ request_id: requestId });
      if (!request) req.reject(404, 'Asset request not found');
      need(req, request.status === 'PENDING', 'Only pending requests can be rejected');
      await UPDATE(AssetRequest).set({
        status: 'REJECTED', reviewed_by: req.user.id, reviewed_at: new Date(),
        review_notes: reviewNotes.trim()
      }).where({ request_id: requestId });
      return 'Asset request rejected.';
    });

    // FR-022/023/024: Admin dashboard report (all records visible to the Admin role).
    const createAdminReportPdf = async () => {
      const [assets, categories, employees, vendors, maintenance] = await Promise.all([
        SELECT.from(Asset).columns('asset_id', 'asset_tag', 'serial_number', 'model', 'status', 'location',
          'purchase_date', 'assetCategory_asset_category_id', 'current_holder_employee_id', 'vendor_vendor_id'),
        SELECT.from(AssetCategory).columns('asset_category_id', 'name'),
        SELECT.from(Employee).columns('employee_id', 'full_name'),
        SELECT.from(Vendor).columns('vendor_id', 'name'),
        SELECT.from(MaintenanceRecord).columns('maintenance_id', 'asset_asset_id', 'type', 'status',
          'reported_date', 'completed_date', 'description')
      ]);
      const categoryById = Object.fromEntries(categories.map(x => [x.asset_category_id, x.name]));
      const employeeById = Object.fromEntries(employees.map(x => [x.employee_id, x.full_name]));
      const vendorById = Object.fromEntries(vendors.map(x => [x.vendor_id, x.name]));
      const assetById = Object.fromEntries(assets.map(x => [x.asset_id, x]));
      const assetRows = assets.map(a => ({
        tag: a.asset_tag || '', serial: a.serial_number || '', model: a.model || '',
        category: categoryById[a.assetCategory_asset_category_id] || '',
        status: a.status || '', owner: employeeById[a.current_holder_employee_id] || '',
        location: a.location || '', vendor: vendorById[a.vendor_vendor_id] || '',
        purchased: a.purchase_date || ''
      }));
      const maintenanceRows = maintenance.map(m => ({
        asset: (assetById[m.asset_asset_id] && assetById[m.asset_asset_id].asset_tag) || 'Unknown asset',
        type: m.type || '', status: m.status || '', reported: m.reported_date || '',
        completed: m.completed_date || '', description: m.description || ''
      }));
      return new Promise((resolve, reject) => {
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), rowCount: assetRows.length + maintenanceRows.length }));
        doc.on('error', reject);
        const generated = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
        doc.fontSize(18).fillColor('#111111').text('Asset Lifecycle — Admin Dashboard Report');
        doc.moveDown(0.3).fontSize(9).fillColor('#555555')
          .text('Generated: ' + generated)
          .text('Filters: none — full Admin dashboard report');
        const counts = {};
        assetRows.forEach(row => { counts[row.status] = (counts[row.status] || 0) + 1; });
        doc.moveDown(0.5).fontSize(11).fillColor('#111111')
          .text('Asset summary: ' + assetRows.length + ' total | ' +
            Object.entries(counts).map(([status, count]) => status + ': ' + count).join(' | '));
        doc.moveDown(0.5).fontSize(13).text('Asset inventory');
        const assetCols = [
          ['Asset tag', 'tag', 70], ['Serial number', 'serial', 90], ['Model', 'model', 80],
          ['Category', 'category', 80], ['Status', 'status', 65], ['Owner', 'owner', 90],
          ['Location', 'location', 85], ['Vendor', 'vendor', 85], ['Purchase date', 'purchased', 75]
        ];
        const drawTableHeader = cols => {
          let x = 36; const y = doc.y;
          doc.fontSize(8.5).fillColor('#111111');
          cols.forEach(([label, , width]) => { doc.text(label, x, y, { width: width - 3, height: 12, ellipsis: true }); x += width; });
          doc.moveTo(36, y + 14).lineTo(806, y + 14).stroke();
          doc.y = y + 18;
        };
        drawTableHeader(assetCols);
        assetRows.forEach(row => {
          if (doc.y > 525) { doc.addPage(); doc.fontSize(12).text('Asset inventory (continued)'); doc.moveDown(0.3); drawTableHeader(assetCols); }
          let x = 36; const y = doc.y; doc.fontSize(7.5).fillColor('#222222');
          assetCols.forEach(([, key, width]) => { doc.text(String(row[key] ?? ''), x, y, { width: width - 3, height: 12, ellipsis: true }); x += width; });
          doc.y = y + 14;
        });
        doc.addPage();
        doc.fontSize(15).fillColor('#111111').text('Maintenance requests');
        doc.moveDown(0.3).fontSize(9).text('Total maintenance records: ' + maintenanceRows.length);
        const maintenanceCols = [
          ['Asset', 'asset', 100], ['Type', 'type', 95], ['Status', 'status', 85],
          ['Reported', 'reported', 85], ['Completed', 'completed', 85], ['Description', 'description', 320]
        ];
        drawTableHeader(maintenanceCols);
        maintenanceRows.forEach(row => {
          if (doc.y > 525) { doc.addPage(); doc.fontSize(12).text('Maintenance requests (continued)'); doc.moveDown(0.3); drawTableHeader(maintenanceCols); }
          let x = 36; const y = doc.y; doc.fontSize(8).fillColor('#222222');
          maintenanceCols.forEach(([, key, width]) => { doc.text(String(row[key] ?? ''), x, y, { width: width - 3, height: 12, ellipsis: true }); x += width; });
          doc.y = y + 14;
        });
        doc.end();
      });
    };
    const logAdminReport = (action, recipient, rowCount, outcome, message) =>
      INSERT.into(db().ReportLog).entries({
        action, filterText: 'Admin dashboard: full report', recipient, rowCount, outcome,
        message: (message || '').slice(0, 300)
      }).catch(() => {});

    this.on('exportPdf', async req => {
      try {
        const pdf = await createAdminReportPdf();
        await logAdminReport('PDF_DOWNLOAD', null, pdf.rowCount, 'OK', 'Admin dashboard PDF generated');
        return pdf.buffer.toString('base64');
      } catch (e) {
        await logAdminReport('PDF_DOWNLOAD', null, 0, 'FAILED', e.message);
        req.reject(500, 'Could not generate the Admin PDF report: ' + e.message);
      }
    });

    this.on('emailReport', async req => {
      const to = (req.data.to || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) req.reject(400, 'Please enter a valid email address');
      const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
      if (!SMTP_USER || !SMTP_PASS) req.reject(500, 'Email is not configured on the server (SMTP_USER / SMTP_PASS)');
      try {
        const pdf = await createAdminReportPdf();
        const mail = require('nodemailer').createTransport({
          host: SMTP_HOST || 'smtp-mail.outlook.com',
          port: Number(SMTP_PORT || 587), secure: false, requireTLS: true,
          auth: { user: SMTP_USER, pass: SMTP_PASS }
        });
        await mail.sendMail({
          from: MAIL_FROM || SMTP_USER, to,
          subject: 'Asset Lifecycle Admin Report - ' + new Date().toISOString().slice(0, 10),
          text: 'Attached is the Admin dashboard report. It includes the full asset inventory and maintenance records visible to the Admin role. Filters: none.',
          attachments: [{ filename: 'asset-admin-report.pdf', content: pdf.buffer }]
        });
        await logAdminReport('EMAIL', to, pdf.rowCount, 'OK', 'Admin dashboard report emailed');
        return 'Report sent to ' + to;
      } catch (e) {
        await logAdminReport('EMAIL', to, 0, 'FAILED', e.message);
        req.reject(502, 'Email could not be sent: ' + e.message);
      }
    });

    return super.init();
  }
};
