const cds = require('@sap/cds');

module.exports = class AssetManagerService extends cds.ApplicationService {
  init() {
    const { Asset, MaintenanceRecord, AssetAssignment, Employee, AssetCategory, AssetRequest, ReportLog } = cds.entities('asset.lifecycle.db');
    const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

    // Manager asset request workflow: Managers may submit requests and view only their own requests.
    this.on('READ', 'AssetRequests', async req => {
      req.query.where({ requested_by: req.user.id });
      return cds.run(req.query);
    });

    this.on('requestAsset', async req => {
      // Authorization is enforced by AssetManagerService's requires: ['Manager','Admin'].
      // Avoid a second req.user.is('Manager') check, which can reject valid BTP role-collection users.
      const { employeeId, categoryId, reason } = req.data;
      if (!employeeId || !categoryId || !reason || !reason.trim())
        req.reject(400, 'Employee, asset category, and business reason are required');
      const employee = await SELECT.one.from(Employee).where({ employee_id: employeeId });
      if (!employee) req.reject(404, 'Employee not found');
      if (employee.status !== 'ACTIVE') req.reject(400, 'Assets can only be requested for active employees');
      const category = await SELECT.one.from(AssetCategory).where({ asset_category_id: categoryId });
      if (!category) req.reject(404, 'Asset category not found');
      if (category.is_active === false) req.reject(400, 'Selected asset category is inactive');
      const existing = await SELECT.one.from(AssetRequest).where({
        requested_by: req.user.id, employee_employee_id: employeeId,
        category_asset_category_id: categoryId, status: 'PENDING'
      });
      if (existing) req.reject(409, 'A pending request already exists for this employee and category');
      await INSERT.into(AssetRequest).entries({
        requested_by: req.user.id, employee_employee_id: employeeId,
        category_asset_category_id: categoryId, reason: reason.trim(), status: 'PENDING'
      });
      return 'Asset request submitted to Admin for review.';
    });

    // ================= Operational attention (list of real items) =================
    this.on('READ', 'AttentionItems', async () => {
      const today = day(0);
      const assets = await SELECT.from(Asset).columns('asset_id', 'asset_tag', 'model', 'status',
        'warranty_expiry', 'retirement_date', 'current_holder_employee_id');
      const emps = await SELECT.from(Employee).columns('employee_id', 'full_name');
      const A = Object.fromEntries(assets.map(a => [a.asset_id, a]));
      const E = Object.fromEntries(emps.map(e => [e.employee_id, e.full_name]));
      const holder = a => (a && E[a.current_holder_employee_id]) || '';
      const rows = [];
      const maint = await SELECT.from(MaintenanceRecord)
        .where({ status: { in: ['OPEN', 'IN_PROGRESS'] }, reported_date: { '<=': day(-7) } });
      for (const m of maint) { const a = A[m.asset_asset_id];
        rows.push({ ID: 'M-' + m.maintenance_id, category: 'Maintenance open longer than 7 days', asset_tag: a?.asset_tag,
          model: a?.model, detail: `${m.type || 'Maintenance'}, reported ${m.reported_date}`, relevant_date: m.reported_date, owner: holder(a) }); }
      for (const a of assets.filter(x => x.status === 'RETIRED'))
        rows.push({ ID: 'R-' + a.asset_id, category: 'Retired, ready to archive', asset_tag: a.asset_tag, model: a.model,
          detail: 'Retired, not yet archived', relevant_date: a.retirement_date, owner: '' });
      for (const a of assets.filter(x => x.warranty_expiry && x.warranty_expiry >= today && x.warranty_expiry <= day(30)
                                         && !['RETIRED', 'ARCHIVED'].includes(x.status)))
        rows.push({ ID: 'W-' + a.asset_id, category: 'Warranty expiring within 30 days', asset_tag: a.asset_tag, model: a.model,
          detail: `Warranty ends ${a.warranty_expiry}`, relevant_date: a.warranty_expiry, owner: holder(a) });
      const late = await SELECT.from(AssetAssignment).where({ assignment_status: 'ACTIVE', expected_return_date: { '<': today } });
      for (const s of late) { const a = A[s.asset_asset_id];
        rows.push({ ID: 'O-' + s.assignment_id, category: 'Return overdue', asset_tag: a?.asset_tag, model: a?.model,
          detail: `Expected back ${s.expected_return_date}`, relevant_date: s.expected_return_date, owner: E[s.employee_employee_id] || '' }); }
      rows.$count = rows.length;
      return rows;
    });

    // ================= Reports =================
    // turns the OData $filter text from the dashboard into a CDS condition (eq/ne/ge/le/gt/lt, and/or, brackets)
    const toCondition = (req, f) => {
      if (!f || !f.trim()) return null;
      try {
        const s = f.replace(/ eq /g, ' = ').replace(/ ne /g, ' != ').replace(/ ge /g, ' >= ')
          .replace(/ le /g, ' <= ').replace(/ gt /g, ' > ').replace(/ lt /g, ' < ')
          .replace(/(\s|\()(\d{4}-\d{2}-\d{2})(?=[\s)]|$)/g, "$1'$2'");
        const e = cds.parse.expr(s);
        return e.xpr || [e];
      } catch (err) { return req.reject(400, 'Filter could not be read: ' + f); }
    };
    const loadRows = async (req, filter) => {
      const q = SELECT.from(this.entities.AssetFacts).columns('asset_tag', 'category', 'status', 'owner', 'location',
        'department', 'vendor', 'purchase_date').orderBy('asset_tag');
      const cond = toCondition(req, filter);
      if (cond) q.SELECT.where = cond;
      return await q;
    };
    const buildPdf = (rows, filter, user) => new Promise((resolve, reject) => {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
      const chunks = []; doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
      const counts = {}; rows.forEach(r => counts[r.status] = (counts[r.status] || 0) + 1);
      doc.fontSize(18).text('Asset Lifecycle Report');
      doc.fontSize(9).fillColor('#555').text(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} by ${user}`);
      doc.text('Filters: ' + (filter && filter.trim() ? filter : 'none'));
      doc.moveDown(0.5).fillColor('#000').fontSize(11)
        .text(`Total: ${rows.length}   ` + Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join('   '));
      doc.moveDown(0.5);
      const cols = [['Asset', 'asset_tag', 80], ['Category', 'category', 90], ['Status', 'status', 90], ['Owner', 'owner', 110],
        ['Location', 'location', 90], ['Department', 'department', 90], ['Vendor', 'vendor', 90], ['Purchased', 'purchase_date', 70]];
      const header = () => { let x = 36; const y = doc.y; doc.fontSize(9).fillColor('#000');
        cols.forEach(([t, , w]) => { doc.text(t, x, y, { width: w, continued: false }); x += w; });
        doc.moveTo(36, y + 13).lineTo(806, y + 13).stroke(); doc.y = y + 17; };
      header();
      rows.forEach(r => {
        if (doc.y > 540) { doc.addPage(); header(); }
        let x = 36; const y = doc.y; doc.fontSize(8.5);
        cols.forEach(([, k, w]) => { doc.text(String(r[k] ?? ''), x, y, { width: w - 4, height: 12, ellipsis: true }); x += w; });
        doc.y = y + 14;
      });
      doc.end();
    });
    const log = (req, action, filter, recipient, rowCount, outcome, message) =>
      INSERT.into(ReportLog).entries({ action, filterText: (filter || '').slice(0, 1000), recipient, rowCount, outcome,
        message: (message || '').slice(0, 300) }).catch(() => {});

    this.on('exportPdf', async req => {                                         // FR-022, FR-026
      const rows = await loadRows(req, req.data.filter);
      const pdf = await buildPdf(rows, req.data.filter, req.user.id);
      await log(req, 'PDF_DOWNLOAD', req.data.filter, null, rows.length, 'OK');
      return pdf.toString('base64');
    });

    this.on('emailReport', async req => {                                       // FR-023, FR-026
      const to = (req.data.to || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) req.reject(400, 'Please enter a valid email address');
      const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
      if (!SMTP_USER || !SMTP_PASS) req.reject(500, 'Email is not configured on the server (SMTP_USER / SMTP_PASS)');
      const rows = await loadRows(req, req.data.filter);
      const pdf = await buildPdf(rows, req.data.filter, req.user.id);
      const counts = {}; rows.forEach(r => counts[r.status] = (counts[r.status] || 0) + 1);
      const summary = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' | ');
      try {
        const mail = require('nodemailer').createTransport({ host: SMTP_HOST || 'smtp-mail.outlook.com',
          port: Number(SMTP_PORT || 587), secure: false, requireTLS: true, auth: { user: SMTP_USER, pass: SMTP_PASS } });
        await mail.sendMail({ from: MAIL_FROM || SMTP_USER, to, subject: `Asset Lifecycle Report - ${day(0)}`,
          text: `Hello,\n\nPlease find the Asset Lifecycle report generated on ${day(0)}.\n\nFilters applied: ${req.data.filter || 'none'}\n` +
                `Total assets: ${rows.length}${summary ? ' | ' + summary : ''}\n\nGenerated by: ${req.user.id}\n`,
          attachments: [{ filename: `asset-report-${day(0)}.pdf`, content: pdf }] });
      } catch (err) { await log(req, 'EMAIL', req.data.filter, to, rows.length, 'FAILED', err.message);
        req.reject(502, 'Email could not be sent: ' + err.message); }
      await log(req, 'EMAIL', req.data.filter, to, rows.length, 'OK');
      return `Report sent to ${to}`;
    });

    return super.init();
  }
};