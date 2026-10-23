sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (Controller, MessageToast, MessageBox) {
  "use strict";
  return Controller.extend("userdashboard.controller.App", {
    onInit: function () {
      // Keep data loading disabled until AssetUserService applies employee-specific
      // authorization filters to Assets, AssetAssignments and MaintenanceRecords.
      // UI-side filters are not a security boundary.
    },
    onRefresh: function () {
      var oModel = this.getView().getModel();
      if (oModel) {
        oModel.refresh(true);
      }
      MessageToast.show("Refresh requested.");
    },
    onRaiseRequest: function () {
      MessageBox.information(
        "The maintenance request form will be enabled after the backend verifies that the selected asset belongs to the signed-in employee."
      );
    }
  });
});
