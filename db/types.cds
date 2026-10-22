namespace asset.lifecycle.db;
type EmployeeStatus : String enum { ACTIVE; INACTIVE; }
type AssetStatus : String enum { AVAILABLE; ASSIGNED; MAINTENANCE; RETIRED; ARCHIVED; }
type AssignmentStatus : String enum { ACTIVE; RETURNED; CLOSED; }
type LedgerAction : String enum { ASSIGNED; TRANSFERRED; RETURNED; MAINTENANCE; MAINTENANCE_COMPLETED; RETIRED; ARCHIVED; }
type MaintenanceType : String enum { PREVENTIVE; CORRECTIVE; }
type MaintenanceStatus : String enum { OPEN; IN_PROGRESS; COMPLETED; }
type MaintenanceOutcome : String enum { REPAIRED; REPLACED; SCRAPPED; }
type ArchiveReason : String enum { END_OF_LIFE; DAMAGED; OBSOLETE; }
type DisposalMethod : String enum { RECYCLED; SOLD; DESTROYED; RETURNED_TO_VENDOR; }
type AssetRequestStatus : String enum { PENDING; FULFILLED; REJECTED; }
