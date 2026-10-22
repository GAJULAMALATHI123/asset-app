sap.ui.define(["sap/ui/core/Component"], function (Component) {
  "use strict";
  function go(route) {
    var comp = Component.registry.filter(function (c) {
      return c.getRouter && c.getRouter() && c.getRouter().getRoute(route);
    })[0];
    if (comp) { comp.getRouter().navTo(route); }
  }
  return {
    goEmployees:   function () { go("EmployeesList"); },
    goDepartments: function () { go("DepartmentsList"); },
    goCategories:  function () { go("AssetCategoriesList"); },
    goVendors:     function () { go("VendorsList"); }
  };
});