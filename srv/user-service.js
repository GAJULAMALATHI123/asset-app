const cds = require('@sap/cds');
const { openMaintenance } = require('./lib/common');

module.exports = class AssetUserService extends cds.ApplicationService {
  init() {
    const employeeFor = async req => {
      const identities = [
        req.user && req.user.id,
        req.user && req.user.attr && req.user.attr.email,
        req.user && req.user.attr && req.user.attr.mail
      ].filter(Boolean).map(value => String(value).trim().toLowerCase());

      if (!identities.length) return null;

      const employees = await cds.tx(req).run(
        SELECT.from('asset.lifecycle.db.Employee')
          .columns('employee_id', 'email')
          .where({ email: { in: identities } })
      );
      return employees && employees[0] || null;
    };

    const restrictToEmployee = async (req, foreignKey) => {
      // Manager/Admin may use this service for operational visibility.
      if (req.user && (req.user.is('Admin') || req.user.is('Manager'))) return;

      const employee = await employeeFor(req);
      if (!employee) {
        return req.reject(403, 'Your login is not linked to an employee record. Contact your administrator.');
      }
      req.query.where({ [foreignKey]: employee.employee_id });
    };

    this.before('READ', 'Assets', req => restrictToEmployee(req, 'current_holder_employee_id'));
    this.before('READ', 'AssetAssignments', req => restrictToEmployee(req, 'employee_employee_id'));
    this.before('READ', 'OwnershipLedgers', async req => {
      if (req.user && (req.user.is('Admin') || req.user.is('Manager'))) return;
      const employee = await employeeFor(req);
      if (!employee) return req.reject(403, 'Your login is not linked to an employee record. Contact your administrator.');
      req.query.where([
        { ref: ['from_employee_employee_id'] }, '=', { val: employee.employee_id },
        'or',
        { ref: ['to_employee_employee_id'] }, '=', { val: employee.employee_id }
      ]);
    });
    this.before('READ', 'MaintenanceRecords', req => restrictToEmployee(req, 'reported_by_employee_id'));

    this.on('RaiseMaintenanceRequest', async req => {
      const employee = await employeeFor(req);
      if (!employee) {
        return req.reject(403, 'Your login is not linked to an employee record. Contact your administrator.');
      }

      const asset = await cds.tx(req).run(
        SELECT.one.from('asset.lifecycle.db.Asset')
          .columns('asset_id')
          .where({
            asset_id: req.data.assetId,
            current_holder_employee_id: employee.employee_id
          })
      );
      if (!asset) {
        return req.reject(403, 'You can raise a maintenance request only for an asset assigned to you.');
      }

      await openMaintenance(req, req.data.assetId, 'CORRECTIVE', req.data.description, employee.employee_id);
      return 'Maintenance request raised';
    });

    return super.init();
  }
};
