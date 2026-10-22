namespace asset.lifecycle.db;
using { cuid,managed } from '@sap/cds/common';
using { asset.lifecycle.db.EmployeeStatus, asset.lifecycle.db.AssetStatus, asset.lifecycle.db.AssignmentStatus, asset.lifecycle.db.LedgerAction, asset.lifecycle.db.MaintenanceType,
        asset.lifecycle.db.MaintenanceStatus, asset.lifecycle.db.MaintenanceOutcome, asset.lifecycle.db.ArchiveReason, asset.lifecycle.db.DisposalMethod, asset.lifecycle.db.AssetRequestStatus } from './types';

entity Department : managed {
  key dept_id : UUID;
  name        : String(80) @mandatory;
  cost_center : String(20);
  is_active   : Boolean default true;                       // FR-027: deactivate instead of delete
  employees   : Association to many Employee on employees.department = $self;
}
entity Employee : managed {
  key employee_id : UUID;
  full_name  : String(100) @mandatory;
  email      : String(100);
  phone      : String(20);
  department : Association to Department;
  location   : String(100);
  status     : EmployeeStatus default #ACTIVE;
  assets              : Association to many Asset on assets.current_holder = $self;
  reportedMaintenance : Association to many MaintenanceRecord on reportedMaintenance.reported_by = $self;
  assignments         : Association to many AssetAssignment on assignments.employee = $self;
}
entity AssetCategory : managed {
  key asset_category_id : UUID;
  name            : String(50) @mandatory;
  lifespan_months : Integer;
  is_active       : Boolean default true;
  assets          : Association to many Asset on assets.assetCategory = $self;
}
entity Vendor : managed {
  key vendor_id : UUID;
  name      : String(100) @mandatory;
  email     : String(100);
  is_active : Boolean default true;
  suppliedAssets     : Association to many Asset on suppliedAssets.vendor = $self;
  maintenanceRecords : Association to many MaintenanceRecord on maintenanceRecords.service_vendor = $self;
}
@assert.unique: { tag: [asset_tag], serial: [serial_number] }   // FR-001
entity Asset : managed {
  key asset_id : UUID;
  asset_tag     : String(20) @mandatory;
  serial_number : String(50) @mandatory;
  assetCategory : Association to AssetCategory @mandatory;
  vendor        : Association to Vendor;
  model         : String(100);
  location      : String(100);
  purchase_date : Date not null;
  purchase_cost : Decimal(10,2);
  warranty_expiry         : Date;
  first_distribution_date : Date;
  status         : AssetStatus default #AVAILABLE;
  current_holder : Association to Employee;
  retirement_reason : String(255);
  retirement_date   : Date;
  assignments        : Composition of many AssetAssignment  on assignments.asset = $self;
  ownershipHistory   : Composition of many OwnershipLedger  on ownershipHistory.asset = $self;
  maintenanceRecords : Composition of many MaintenanceRecord on maintenanceRecords.asset = $self;
  archiveRecords     : Composition of many ArchiveRecord    on archiveRecords.asset = $self;
}
entity AssetAssignment : managed {
  key assignment_id : UUID;
  asset      : Association to Asset;
  employee   : Association to Employee;
  assigned_by          : String(100);                     // XSUAA user id
  assigned_date        : Date;
  expected_return_date : Date;
  actual_return_date   : Date;
  assignment_status    : AssignmentStatus;
  remarks              : LargeString;
}
entity OwnershipLedger : managed {                          // immutable (FR-007)
  key ledger_id : UUID;
  asset         : Association to Asset;
  from_employee : Association to Employee;
  to_employee   : Association to Employee;
  action        : LedgerAction;
  transition_date : Date;
  recorded_by   : String(100);
  notes         : LargeString;
}
entity MaintenanceRecord : managed {
  key maintenance_id : UUID;
  asset          : Association to Asset;
  type           : MaintenanceType;
  reported_by    : Association to Employee;
  service_vendor : Association to Vendor;
  reported_date  : Date;
  completed_date : Date;
  status         : MaintenanceStatus;
  outcome        : MaintenanceOutcome;
  cost           : Decimal(10,2);
  covered_by_warranty : Boolean;
  next_due_date  : Date;
  description    : LargeString;
}
entity ArchiveRecord : managed {
  key archive_id : UUID;
  asset            : Association to Asset;
  archived_at      : Timestamp;
  archived_by      : String(100);
  reason           : ArchiveReason;
  disposal_method  : DisposalMethod;
  disposal_cert_no : String(40);
  compliance_ref   : String(60);
}

entity AssetRequest : managed {
  key request_id : UUID;
  requested_by : String(100) @mandatory;
  employee : Association to Employee @mandatory;
  category : Association to AssetCategory @mandatory;
  reason : LargeString @mandatory;
  status : AssetRequestStatus default #PENDING;
  reviewed_by : String(100);
  reviewed_at : Timestamp;
  review_notes : LargeString;
  fulfilled_asset : Association to Asset;
}

entity ReportLog : cuid, managed {
  action     : String(20);     // PDF_DOWNLOAD | EMAIL
  filterText : String(1000);   // the filters that were applied
  recipient  : String(120);
  rowCount   : Integer;
  outcome    : String(20);     // OK | FAILED
  message    : String(300);
}
