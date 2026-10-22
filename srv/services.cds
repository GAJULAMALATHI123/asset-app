using { asset.lifecycle.db as db } from '../db/schema';

/** ADMIN: lifecycle + master data (FR-013/014/025) */
service AssetAdminService @(path: '/odata/v4/admin', requires: 'Admin', impl: './admin-service.js') {
  entity Departments     as projection on db.Department;
  entity Employees       as projection on db.Employee;
  entity AssetCategories as projection on db.AssetCategory;
  entity Vendors         as projection on db.Vendor;

  entity Assets as projection on db.Asset actions {
    action assign(employeeId : UUID, distributionDate : Date, remarks : String) returns Assets;
    action transfer(toEmployeeId : UUID, transferDate : Date, remarks : String) returns Assets;
    action returnAsset(returnDate : Date, remarks : String) returns Assets;
    action createMaintenance(maintenanceType : db.MaintenanceType, description : String) returns Assets;
    action completeMaintenance(outcome : db.MaintenanceOutcome, vendorId : UUID, cost : Decimal(10,2)) returns Assets;
    action retire(reason : String, retirementDate : Date) returns Assets;
    action archive(archiveReason : db.ArchiveReason, disposalMethod : db.DisposalMethod,
                   certNo : String, complianceRef : String) returns Assets;
  };
  @readonly entity AssetAssignments   as projection on db.AssetAssignment;
  @readonly entity OwnershipLedgers   as projection on db.OwnershipLedger;   // FR-007
  @readonly entity MaintenanceRecords as projection on db.MaintenanceRecord;
  @readonly entity ArchiveRecords     as projection on db.ArchiveRecord;
  @readonly entity AssetRequests      as projection on db.AssetRequest;
  action fulfillAssetRequest(requestId : UUID, assetId : UUID, distributionDate : Date, remarks : String) returns String;
  action rejectAssetRequest(requestId : UUID, reviewNotes : String) returns String;
  function exportPdf() returns LargeString;
  action emailReport(to : String) returns String;
  //@readonly entity KPIs as select from db.Asset {
    //key status, count(*) as total : Integer, sum(purchase_cost) as value : Decimal(15,2) } group by status;
}

/** MANAGER: dashboards, reports, read-only (FR-014/021/025). No lifecycle actions. */
service AssetManagerService @(path: '/odata/v4/manager', requires: ['Manager','Admin'], impl: './manager-service.js') {
  @readonly entity Employees          as projection on db.Employee;
  @readonly entity AssetCategories   as projection on db.AssetCategory;
  @readonly entity AssetRequests      as projection on db.AssetRequest;
  action requestAsset(employeeId : UUID, categoryId : UUID, reason : String) returns String;
  @readonly entity Assets             as projection on db.Asset;
  @readonly entity AssetAssignments   as projection on db.AssetAssignment;
  @readonly entity OwnershipLedgers   as projection on db.OwnershipLedger;
  @readonly entity MaintenanceRecords as projection on db.MaintenanceRecord;
  //@readonly entity KPIs as select from db.Asset {
   // key status, count(*) as total : Integer, sum(purchase_cost) as value : Decimal(15,2) } group by status;
}

/** USER: read-only + raise maintenance request */
service AssetUserService @(path: '/odata/v4/user', requires: ['User','Manager','Admin'], impl: './user-service.js') {
  @readonly entity Assets             as projection on db.Asset;
  @readonly entity AssetAssignments   as projection on db.AssetAssignment;
  @readonly entity OwnershipLedgers   as projection on db.OwnershipLedger;
  @readonly entity MaintenanceRecords as projection on db.MaintenanceRecord;
  action RaiseMaintenanceRequest(assetId : UUID, description : String) returns String;
}

annotate AssetAdminService.Assets with @odata.draft.enabled {
  status @readonly; current_holder @readonly; first_distribution_date @readonly;
  retirement_reason @readonly; retirement_date @readonly;
};
annotate AssetAdminService.Departments     with @odata.draft.enabled;
annotate AssetAdminService.Employees       with @odata.draft.enabled;
annotate AssetAdminService.AssetCategories with @odata.draft.enabled;
annotate AssetAdminService.Vendors         with @odata.draft.enabled;


annotate AssetAdminService.AssetRequests with @(
  UI.HeaderInfo: { TypeName: 'Asset request', TypeNamePlural: 'Manager asset requests',
    Title: { Value: status }, Description: { Value: reason } },
  UI.SelectionFields: [ status, requested_by, employee_employee_id, category_asset_category_id, createdAt ],
  UI.LineItem: [
    { Value: createdAt, Label: 'Requested on' },
    { Value: requested_by, Label: 'Requested by' },
    { Value: employee.full_name, Label: 'Employee' },
    { Value: category.name, Label: 'Asset category' },
    { Value: reason, Label: 'Business reason' },
    { Value: status, Label: 'Request status' },
    { Value: fulfilled_asset.asset_tag, Label: 'Assigned asset' },
    { Value: review_notes, Label: 'Admin notes' }
  ]
);
