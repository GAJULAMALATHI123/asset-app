const cds = require('@sap/cds');
const { openMaintenance } = require('./lib/common');
module.exports = class AssetUserService extends cds.ApplicationService {
  init() {
    this.on('RaiseMaintenanceRequest', async req => {
      await openMaintenance(req, req.data.assetId, 'CORRECTIVE', req.data.description);
      return 'Maintenance request raised';
    });
    return super.init();
  }
};
