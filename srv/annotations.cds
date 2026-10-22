using AssetAdminService as S from './services';

annotate S.Assets with @(
  UI.HeaderInfo: { TypeName: 'Asset', TypeNamePlural: 'Assets', Title: { Value: asset_tag }, Description: { Value: model } },
  UI.SelectionFields: [ asset_tag, serial_number, assetCategory_asset_category_id, status, current_holder_employee_id, vendor_vendor_id, location ],
  UI.LineItem: [
    { Value: asset_tag }, { Value: serial_number }, { Value: model },
    { Value: assetCategory.name, Label: 'Category' },
    { Value: current_holder.full_name, Label: 'Owner' }, { Value: location },{Value :vendor_vendor_id,Label:'Vendor'}, { Value: status } ],
  UI.Identification: [
    { $Type: 'UI.DataFieldForAction', Action: 'AssetAdminService.assign', Label: 'Assign' },
    { $Type: 'UI.DataFieldForAction', Action: 'AssetAdminService.transfer', Label: 'Transfer' },
    { $Type: 'UI.DataFieldForAction', Action: 'AssetAdminService.returnAsset', Label: 'Return' },
    { $Type: 'UI.DataFieldForAction', Action: 'AssetAdminService.createMaintenance', Label: 'Send to Maintenance' },
    { $Type: 'UI.DataFieldForAction', Action: 'AssetAdminService.completeMaintenance', Label: 'Complete Maintenance' },
    { $Type: 'UI.DataFieldForAction', Action: 'AssetAdminService.retire', Label: 'Retire' },
    { $Type: 'UI.DataFieldForAction', Action: 'AssetAdminService.archive', Label: 'Archive' } ],
  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', ID: 'General', Label: 'General', Target: '@UI.FieldGroup#General' },
    { $Type: 'UI.ReferenceFacet', ID: 'Procurement', Label: 'Procurement', Target: '@UI.FieldGroup#Procurement' },
    { $Type: 'UI.ReferenceFacet', ID: 'Assignment', Label: 'Assignment', Target: 'assignments/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'Maintenance', Label: 'Maintenance', Target: 'maintenanceRecords/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'History', Label: 'History', Target: 'ownershipHistory/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'Retirement', Label: 'Retirement', Target: '@UI.FieldGroup#Retirement' },
    { $Type: 'UI.ReferenceFacet', ID: 'Archive', Label: 'Archive', Target: 'archiveRecords/@UI.LineItem' } ],
  UI.FieldGroup #General: { Data: [ { Value: asset_tag }, { Value: serial_number }, { Value: assetCategory_asset_category_id },
    { Value: model }, { Value: location }, { Value: status }, { Value: current_holder_employee_id } ] },
  UI.FieldGroup #Procurement: { Data: [ { Value: vendor_vendor_id }, { Value: purchase_date }, { Value: purchase_cost },
    { Value: warranty_expiry }, { Value: first_distribution_date } ] },
  UI.FieldGroup #Retirement: { Data: [ { Value: retirement_reason }, { Value: retirement_date } ] }
);
annotate S.Assets with {
  assetCategory @(Common.Text: assetCategory.name, Common.TextArrangement: #TextOnly,
    Common.ValueList: { CollectionPath: 'AssetCategories', Parameters: [
      { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: assetCategory_asset_category_id, ValueListProperty: 'asset_category_id' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' } ] });
  vendor @(Common.Text: vendor.name, Common.TextArrangement: #TextFirst,
    Common.ValueList: { CollectionPath: 'Vendors', Parameters: [
      { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: vendor_vendor_id, ValueListProperty: 'vendor_id' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' } ] });
  current_holder @(Common.Text: current_holder.full_name, Common.TextArrangement: #TextOnly,
    Common.ValueList: { CollectionPath: 'Employees', Parameters: [
      { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: current_holder_employee_id, ValueListProperty: 'employee_id' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'full_name' } ] });
};
annotate S.AssetAssignments with @UI.LineItem: [ { Value: employee.full_name, Label: 'Employee' }, { Value: assigned_date },
  { Value: expected_return_date }, { Value: actual_return_date }, { Value: assignment_status } ];
annotate S.MaintenanceRecords with @UI.LineItem: [ { Value: type }, { Value: reported_date }, { Value: completed_date },
  { Value: status }, { Value: outcome }, { Value: service_vendor.name, Label: 'Vendor' }, { Value: cost } ];
annotate S.OwnershipLedgers with @UI.LineItem: [ { Value: transition_date }, { Value: action },
  { Value: from_employee.full_name, Label: 'From' }, { Value: to_employee.full_name, Label: 'To' },
  { Value: recorded_by }, { Value: notes } ];
annotate S.ArchiveRecords with @UI.LineItem: [ { Value: archived_at }, { Value: reason }, { Value: disposal_method },
  { Value: compliance_ref }, { Value: archived_by } ];


annotate S.Employees with @(
  UI.HeaderInfo: { TypeName: 'Employee', TypeNamePlural: 'Employees', Title: { Value: full_name }, Description: { Value: email } },
  UI.SelectionFields: [ full_name, department_dept_id, location, status ],
  UI.LineItem: [ { Value: full_name }, { Value: email }, { Value: phone },
    { Value: department.name, Label: 'Department' }, { Value: location }, { Value: status } ],
  UI.Facets: [ { $Type: 'UI.ReferenceFacet', ID: 'Main', Label: 'Details', Target: '@UI.FieldGroup#Main' } ],
  UI.FieldGroup #Main: { Data: [ { Value: full_name }, { Value: email }, { Value: phone },
    { Value: department_dept_id }, { Value: location }, { Value: status } ] }
);
annotate S.Employees with {
  department @(Common.Label: 'Department', Common.Text: department.name, Common.TextArrangement: #TextOnly,
    Common.ValueList: { CollectionPath: 'Departments', Parameters: [
      { $Type: 'Common.ValueListParameterInOut', LocalDataProperty: department_dept_id, ValueListProperty: 'dept_id' },
      { $Type: 'Common.ValueListParameterDisplayOnly', ValueListProperty: 'name' } ] });
};

annotate S.Departments with @(
  UI.HeaderInfo: { TypeName: 'Department', TypeNamePlural: 'Departments', Title: { Value: name }, Description: { Value: cost_center } },
  UI.SelectionFields: [ name, cost_center, is_active ],
  UI.LineItem: [ { Value: name }, { Value: cost_center }, { Value: is_active } ],
  UI.Facets: [ { $Type: 'UI.ReferenceFacet', ID: 'Main', Label: 'Details', Target: '@UI.FieldGroup#Main' } ],
  UI.FieldGroup #Main: { Data: [ { Value: name }, { Value: cost_center }, { Value: is_active } ] }
);

annotate S.AssetCategories with @(
  UI.HeaderInfo: { TypeName: 'Category', TypeNamePlural: 'Categories', Title: { Value: name } },
  UI.SelectionFields: [ name, is_active ],
  UI.LineItem: [ { Value: name }, { Value: lifespan_months }, { Value: is_active } ],
  UI.Facets: [ { $Type: 'UI.ReferenceFacet', ID: 'Main', Label: 'Details', Target: '@UI.FieldGroup#Main' } ],
  UI.FieldGroup #Main: { Data: [ { Value: name }, { Value: lifespan_months }, { Value: is_active } ] }
);

annotate S.Vendors with @(
  UI.HeaderInfo: { TypeName: 'Vendor', TypeNamePlural: 'Vendors', Title: { Value: name }, Description: { Value: email } },
  UI.SelectionFields: [ name, is_active ],
  UI.LineItem: [ { Value: vendor_id, Label: 'Vendor ID' }, { Value: name }, { Value: email }, { Value: is_active } ],
  UI.Facets: [ { $Type: 'UI.ReferenceFacet', ID: 'Main', Label: 'Details', Target: '@UI.FieldGroup#Main' } ],
  UI.FieldGroup #Main: { Data: [ { Value: name }, { Value: email }, { Value: is_active } ] }
);