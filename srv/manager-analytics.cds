// Put this file in srv/  (next to services.cds). No other file needs editing.
using { asset.lifecycle.db as db } from '../db/schema';
using AssetManagerService from './services';

// One flat row per asset so filters (category, location, department, ...) and charts work together
extend service AssetManagerService with {
  @readonly @cds.redirection.target: false
  entity AssetFacts as select from db.Asset as a
    mixin {
      assignments        : Association to many AssetManagerService.AssetAssignments on assignments.asset.asset_id = $projection.asset_id;
      maintenanceRecords : Association to many AssetManagerService.MaintenanceRecords
                             on maintenanceRecords.asset.asset_id = $projection.asset_id;
      ownershipHistory   : Association to many AssetManagerService.OwnershipLedgers
                             on ownershipHistory.asset.asset_id = $projection.asset_id;
    }
    into {
      key a.asset_id,
      a.asset_tag,
      a.serial_number,
      a.model,
      a.assetCategory.name             as category,
      a.status,
      a.location,
      a.current_holder.full_name       as owner,
      a.current_holder.department.name as department,
      a.vendor.name                    as vendor,
      a.vendor.vendor_id as vendor_id,
      assignments,
      maintenanceRecords,
      ownershipHistory,
      a.purchase_date,
      a.purchase_cost,
      1 as assetCount : Integer,
      100.0/(select from db.Asset{count(*)}) as assetPercent :Decimal(9,2)
    };
}

annotate AssetManagerService.AssetFacts with @(
  // ---- analytics: lets the ALP group and count ----
  Aggregation.ApplySupported: {
    Transformations: [ 'aggregate', 'groupby', 'filter', 'search', 'identity' ],
    GroupableProperties: [ category, status, location, owner, department, vendor, purchase_date, asset_tag ],
    AggregatableProperties: [ { Property: assetCount }, { Property: purchase_cost } ]
  },
  Aggregation.CustomAggregate #assetCount : 'Edm.Int32',
  Aggregation.CustomAggregate #purchase_cost : 'Edm.Decimal',
  Aggregation.CustomAggregate #assetPercent: 'Edm.Decimal',
  // ---- filter bar (from the Manager slide) ----
  UI.SelectionFields: [ purchase_date, status, category, location, department ],

  // ---- main chart: assets by lifecycle status ----
  UI.Chart #Status: {
    Title: 'Assets by lifecycle status', ChartType: #Donut,
    Dimensions: [ status ],
    DimensionAttributes: [ { Dimension: status, Role: #Category } ],
    Measures: [ assetCount ],
    MeasureAttributes: [ { Measure: assetCount, Role: #Axis1, DataPoint: '@UI.DataPoint#Count' } ]
  },
  UI.DataPoint #Count: { Value: assetCount, Title: 'Assets' },

  UI.PresentationVariant: {
    Visualizations: [ '@UI.Chart#Status', '@UI.LineItem' ],
    SortOrder: [ { Property: asset_tag, Descending: false } ]
  },

  // ---- table ----
  UI.LineItem: [
    { Value: asset_tag, Label: 'Asset Tag' },
    { Value: serial_number, Label: 'Serial Number' },
    { Value: model, Label: 'Model' },
    { Value: category, Label: 'Category' },
    { Value: status, Label: 'Lifecycle Status' },
    { Value: owner, Label: 'Assigned To' },
    { Value: department, Label: 'Department' },
    { Value: location, Label: 'Location' },
    { Value: vendor, Label: 'Vendor' },
    { Value: vendor_id, Label: 'Vendor ID' },
    { Value: purchase_date, Label: 'Purchase Date' },
    { Value: purchase_cost, Label: 'Purchase Cost' }
  ]
);

annotate AssetManagerService.AssetFacts with {
  asset_id      @UI.Hidden;
  assetCount    @Common.Label: 'Assets' @Aggregation.default:#SUM @Analytics.Measure:true;
  category      @Common.Label: 'Category';
  status        @Common.Label: 'Status';
  location      @Common.Label: 'Location';
  department    @Common.Label: 'Department';
  owner         @Common.Label: 'Owner';
  vendor        @Common.Label: 'Vendor';
  purchase_date @Common.Label: 'Purchase date';
  purchase_cost @Aggregation.default: #SUM @Analytics.Measure:true;
  assetPercent @Common.Label: 'Share of inventory' @Measures.Unit:'%' @Aggregation.default: #SUM @Analytics.Measure:true;
};

extend service AssetManagerService with {
  @readonly entity Vendors as projection on db.Vendor;
}

annotate AssetManagerService.MaintenanceRecords with @(
  UI.HeaderInfo: { TypeName: 'Maintenance record', TypeNamePlural: 'Maintenance records',
    Title: { Value: asset.asset_tag }, Description: { Value: type } },
  UI.SelectionFields: [ status, type, reported_date, service_vendor_vendor_id, covered_by_warranty ],
  UI.LineItem: [
    { Value: asset.asset_tag, Label: 'Asset' }, { Value: type }, { Value: status },
    { Value: reported_date }, { Value: completed_date },
    { Value: service_vendor.name, Label: 'Vendor' },
    { Value: outcome }, { Value: cost }, { Value: covered_by_warranty }
  ]
);

annotate AssetManagerService.AssetAssignments with @(
  UI.HeaderInfo: { TypeName: 'Assignment', TypeNamePlural: 'Assignments',
    Title: { Value: asset.asset_tag }, Description: { Value: employee.full_name } },
  UI.SelectionFields: [ assignment_status, assigned_date, employee_employee_id ],
  UI.LineItem: [
    { Value: asset.asset_tag, Label: 'Asset' }, { Value: employee.full_name, Label: 'Employee' },
    { Value: assigned_date }, { Value: expected_return_date }, { Value: actual_return_date },
    { Value: assignment_status }, { Value: assigned_by }
  ]
);
annotate AssetManagerService.AssetFacts with @(
  UI.HeaderInfo: { TypeName: 'Asset', TypeNamePlural: 'Assets',
    Title: { Value: asset_tag }, Description: { Value: model } },
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', ID: 'General',     Label: 'General',     Target: '@UI.FieldGroup#General' },
    { $Type: 'UI.ReferenceFacet', ID: 'Assignments', Label: 'Assignments', Target: 'assignments/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'Maintenance', Label: 'Maintenance', Target: 'maintenanceRecords/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'History',     Label: 'History',     Target: 'ownershipHistory/@UI.LineItem' }
  ],
  UI.FieldGroup #General: { Data: [
    { Value: asset_tag }, { Value: serial_number }, { Value: model }, { Value: category },
    { Value: status }, { Value: owner }, { Value: location }, { Value: department },
    { Value: vendor }, { Value: purchase_date }, { Value: purchase_cost }
  ] }
);

annotate AssetManagerService.OwnershipLedgers with @UI.LineItem: [
  { Value: transition_date }, { Value: action },
  { Value: from_employee.full_name, Label: 'From' }, { Value: to_employee.full_name, Label: 'To' },
  { Value: recorded_by }, { Value: notes }
];

annotate AssetManagerService.AssetFacts with @(
  
  UI.KPI #Total: {
    DataPoint: { Title: 'Total assets ', Value:assetCount },
    Detail: { DefaultPresentationVariant: { Visualizations: ['@UI.Chart#Status'] } }
  },
  UI.KPI #Available: {
    DataPoint: { Title: 'Available ', Value: assetCount },
    SelectionVariant: { SelectOptions: [ { PropertyName: status, Ranges: [ { Sign: #I, Option: #EQ, Low: 'AVAILABLE' } ] } ] },
    Detail: { DefaultPresentationVariant: { Visualizations: ['@UI.Chart#Status'] } }
  },
  UI.KPI #Assigned: {
    DataPoint: { Title: 'Assigned ', Value: assetCount },
    SelectionVariant: { SelectOptions: [ { PropertyName: status, Ranges: [ { Sign: #I, Option: #EQ, Low: 'ASSIGNED' } ] } ] },
    Detail: { DefaultPresentationVariant: { Visualizations: ['@UI.Chart#Status'] } }
  },
  UI.KPI #Maintenance: {
    DataPoint: { Title: 'In maintenance ', Value: assetCount},
    SelectionVariant: { SelectOptions: [ { PropertyName: status, Ranges: [ { Sign: #I, Option: #EQ, Low: 'MAINTENANCE' } ] } ] },
    Detail: { DefaultPresentationVariant: { Visualizations: ['@UI.Chart#Status'] } }
  },
  UI.KPI #Retired: {
    DataPoint: { Title: 'Retired ', Value: assetCount},
    SelectionVariant: { SelectOptions: [ { PropertyName: status, Ranges: [ { Sign: #I, Option: #EQ, Low: 'RETIRED' } ] } ] },
    Detail: { DefaultPresentationVariant: { Visualizations: ['@UI.Chart#Status'] } }
  }
);


annotate AssetManagerService.AssetFacts with @(
  UI.KPI #Archived: {
    DataPoint: { Title: 'Archived assets', Value: assetCount },
    SelectionVariant: { SelectOptions: [ { PropertyName: status, Ranges: [ { Sign: #I, Option: #EQ, Low: 'ARCHIVED' } ] } ] },
    Detail: { DefaultPresentationVariant: { Visualizations: ['@UI.Chart#Status'] } }
  },
  UI.PresentationVariant #ByStatus: {
    Text: 'By status',
    Visualizations: [ '@UI.Chart#Status', '@UI.LineItem' ]
  },
  UI.Chart #Location: {
    Title: 'Assets by location', ChartType: #Bar,
    Dimensions: [ location ],
    DimensionAttributes: [ { Dimension: location, Role: #Category } ],
    Measures: [ assetCount ],
    MeasureAttributes: [ { Measure: assetCount, Role: #Axis1, DataPoint: '@UI.DataPoint#Count' } ]
  },
  UI.PresentationVariant #ByLocation: {
    Text: 'By location',
    Visualizations: [ '@UI.Chart#Location', '@UI.LineItem' ]
  }
);

extend service AssetManagerService with {
  @readonly entity ReportLogs as projection on db.ReportLog;
  function exportPdf(filter : String) returns LargeString;                     // base64 PDF (FR-022)
  action   emailReport(filter : String, to : String) returns String;           // PDF by email (FR-023)
}

annotate AssetManagerService.AssetRequests with @(
  UI.HeaderInfo: { TypeName: 'Asset request', TypeNamePlural: 'My asset requests',
    Title: { Value: status }, Description: { Value: reason } },
  UI.SelectionFields: [ status, category_asset_category_id, employee_employee_id, createdAt ],
  UI.LineItem: [
    { Value: createdAt, Label: 'Requested on' },
    { Value: category.name, Label: 'Asset category' },
    { Value: employee.full_name, Label: 'Employee' },
    { Value: reason, Label: 'Business reason' },
    { Value: status, Label: 'Request status' },
    { Value: fulfilled_asset.asset_tag, Label: 'Assigned asset' },
    { Value: reviewed_by, Label: 'Reviewed by' },
    { Value: review_notes, Label: 'Admin notes' }
  ]
);
