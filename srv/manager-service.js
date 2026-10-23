const cds = require('@sap/cds');

module.exports = class AssetManagerService extends cds.ApplicationService {
  init() {
    const { Employee, AssetCategory, AssetRequest, ReportLog } = cds.entities('asset.lifecycle.db');
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
    const log = async (req, action, filter, recipient, rowCount, outcome, message) => {
      // CAP INSERT builders are executed with cds.run; the builder itself has no .catch().
      // Report logging is best-effort and must not fail the PDF/email request.
      try {
        await cds.run(INSERT.into(ReportLog).entries({
          action, filterText: (filter || '').slice(0, 1000), recipient, rowCount, outcome,
          message: (message || '').slice(0, 300)
        }));
      } catch (err) {
        console.warn('[AssetManagerService] Could not write report log:', err.message);
      }
    };

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