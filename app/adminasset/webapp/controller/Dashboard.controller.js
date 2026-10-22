sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast"
], function (Controller, JSONModel, MessageBox, MessageToast) {
  "use strict";

  return Controller.extend("adminasset.controller.Dashboard", {
    onInit: function () {
      this.getView().setModel(new JSONModel({
        total: 0, available: 0, assigned: 0, maintenance: 0, retired: 0,
        availablePercent: 0, assignedPercent: 0, maintenancePercent: 0, retiredPercent: 0,
        openRequests: []
      }), "summary");
      this.onRefresh();
    },

    onRefresh: function () {
      var oModel = this.getOwnerComponent().getModel();
      var oSummary = this.getView().getModel("summary");
      var that = this;
      Promise.all([
        oModel.bindList("/Assets").requestContexts(0, 5000).then(function (aContexts) {
          return aContexts.map(function (oContext) { return oContext.getObject(); });
        }),
        oModel.bindList("/MaintenanceRecords").requestContexts(0, 5000).then(function (aContexts) {
          return aContexts.map(function (oContext) { return oContext.getObject(); });
        })
      ]).then(function (aResults) {
        var aAssets = aResults[0];
        var aMaintenance = aResults[1];
        var count = function (sStatus) {
          return aAssets.filter(function (aAsset) { return aAsset.status === sStatus; }).length;
        };
        var total = aAssets.length;
        var percent = function (n) { return total ? Math.round(n * 100 / total) : 0; };
        var aOpen = aMaintenance.filter(function (m) {
          return m.status === "OPEN" || m.status === "IN_PROGRESS";
        }).map(function (m) {
          var aAsset = aAssets.find(function (a) {
            return a.asset_id === m.asset_asset_id || (m.asset && m.asset.asset_id === a.asset_id);
          });
          return {
            assetTag: aAsset ? (aAsset.asset_tag || "Asset") : "Asset",
            type: m.type || "—",
            description: m.description || "—",
            reportedDate: m.reported_date || "—",
            status: m.status,
            state: m.status === "OPEN" ? "Warning" : "Information"
          };
        });
        var nAvailable = count("AVAILABLE");
        var nAssigned = count("ASSIGNED");
        var nMaintenance = count("MAINTENANCE");
        var nRetired = count("RETIRED");
        oSummary.setData({
          total: total, available: nAvailable, assigned: nAssigned,
          maintenance: nMaintenance, retired: nRetired,
          availablePercent: percent(nAvailable), assignedPercent: percent(nAssigned),
          maintenancePercent: percent(nMaintenance), retiredPercent: percent(nRetired),
          openRequests: aOpen
        });
      }).catch(function (e) {
        MessageBox.error("The Admin dashboard could not load data. Check your Admin role and the /odata/v4/admin service. " +
          (e && e.message ? e.message : ""));
      });
    },

    _go: function (sRoute) {
      this.getOwnerComponent().getRouter().navTo(sRoute);
    },
    onOpenAssets: function () { this._go("AssetsList"); },
    onOpenEmployees: function () { this._go("EmployeesList"); },
    onOpenDepartments: function () { this._go("DepartmentsList"); },
    onOpenCategories: function () { this._go("AssetCategoriesList"); },
    onOpenVendors: function () { this._go("VendorsList"); },
    onOpenMaintenance: function () { this._go("MaintenanceList"); }
  });
});