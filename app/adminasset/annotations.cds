using { AssetAdminService } from '../../srv/services';

// Explicit labels for the Admin Fiori Elements forms and tables.
// Keep these UI annotations separate from the service implementation.

annotate AssetAdminService.AssetCategories with {
  asset_category_id @Common.Label: 'Category ID';
  name              @Common.Label: 'Category Name';
  lifespan_months   @Common.Label: 'Lifespan (months)';
  is_active         @Common.Label: 'Active';
};

annotate AssetAdminService.Departments with {
  dept_id     @Common.Label: 'Department ID';
  name        @Common.Label: 'Department Name';
  cost_center @Common.Label: 'Cost Center';
  is_active   @Common.Label: 'Active';
};

annotate AssetAdminService.Employees with {
  employee_id @Common.Label: 'Employee ID';
  full_name   @Common.Label: 'Full Name';
  email       @Common.Label: 'Email Address';
  phone       @Common.Label: 'Phone Number';
  department  @Common.Label: 'Department';
  location    @Common.Label: 'Location';
  status      @Common.Label: 'Employment Status';
};

annotate AssetAdminService.Vendors with {
  vendor_id @Common.Label: 'Vendor ID';
  name      @Common.Label: 'Vendor Name';
  email     @Common.Label: 'Email Address';
  is_active @Common.Label: 'Active';
};

annotate AssetAdminService.Assets with {
  asset_id                @Common.Label: 'Asset ID';
  asset_tag               @Common.Label: 'Asset Tag';
  serial_number           @Common.Label: 'Serial Number';
  assetCategory            @Common.Label: 'Asset Category';
  vendor                   @Common.Label: 'Vendor';
  model                    @Common.Label: 'Model';
  location                 @Common.Label: 'Location';
  purchase_date            @Common.Label: 'Purchase Date';
  purchase_cost            @Common.Label: 'Purchase Cost';
  warranty_expiry          @Common.Label: 'Warranty Expiry Date';
  first_distribution_date  @Common.Label: 'First Distribution Date';
  status                   @Common.Label: 'Asset Status';
  current_holder           @Common.Label: 'Current Holder';
  retirement_reason        @Common.Label: 'Retirement Reason';
  retirement_date          @Common.Label: 'Retirement Date';
};
