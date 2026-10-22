sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Input",
  "sap/m/Label"
], function (Controller, JSONModel, MessageBox, MessageToast, Dialog, Button, Input, Label) {
  "use strict";

  return Controller.extend("adminasset.controller.Dashboard", {
    onInit: function () {
      this.getView().setModel(new JSONModel({
        total: 0, available: 0, assigned: 0, maintenance: 0, retired: 0,
        availablePercent: 0, assignedPercent: 0, maintenancePercent: 0, retiredPercent: 0,
        openRequests: [], maintenanceStatus: []
      }), "summary");
      this.onRefresh();
      var that = this;
      this._refreshTimer = setInterval(function () {
        that.onRefresh();
      }, 30000);
    },

    onExit: function () {
      if (this._refreshTimer) {
        clearInterval(this._refreshTimer);
        this._refreshTimer = null;
      }
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
        var maintenanceTotal = aMaintenance.length;
        var maintenancePercent = function (n) {
          return maintenanceTotal ? Math.round(n * 100 / maintenanceTotal) : 0;
        };
        var nOpenRequests = aMaintenance.filter(function (m) { return m.status === "OPEN"; }).length;
        var nInProgressRequests = aMaintenance.filter(function (m) { return m.status === "IN_PROGRESS"; }).length;
        var nCompletedRequests = aMaintenance.filter(function (m) { return m.status === "COMPLETED"; }).length;
        var aMaintenanceStatus = [
          { label: "Open", count: nOpenRequests, percent: maintenancePercent(nOpenRequests), state: "Warning" },
          { label: "In progress", count: nInProgressRequests, percent: maintenancePercent(nInProgressRequests), state: "Information" },
          { label: "Completed", count: nCompletedRequests, percent: maintenancePercent(nCompletedRequests), state: "Success" }
        ];
        oSummary.setData({
          total: total, available: nAvailable, assigned: nAssigned,
          maintenance: nMaintenance, retired: nRetired,
          availablePercent: percent(nAvailable), assignedPercent: percent(nAssigned),
          maintenancePercent: percent(nMaintenance), retiredPercent: percent(nRetired),
          openRequests: aOpen, maintenanceStatus: aMaintenanceStatus
        });
      }).catch(function (e) {
        MessageBox.error("The Admin dashboard could not load data. Check your Admin role and the /odata/v4/admin service. " +
          (e && e.message ? e.message : ""));
      });
    },

    onDownloadReport: function () {
      // Use the OData function endpoint directly. This avoids differences in how
      // UI5 versions expose primitive LargeString function results.
      fetch("/odata/v4/admin/exportPdf()", {
        method: "GET",
        headers: { "Accept": "application/json" },
        credentials: "same-origin"
      }).then(function (oResponse) {
        return oResponse.text().then(function (sBody) {
          var oPayload = null;
          try { oPayload = sBody ? JSON.parse(sBody) : null; } catch (ignore) {}
          if (!oResponse.ok) {
            var sError = oPayload && oPayload.error && oPayload.error.message;
            throw new Error(sError || ("PDF request failed with HTTP " + oResponse.status));
          }
          if (typeof oPayload === "string") { return oPayload; }
          if (oPayload && typeof oPayload.value === "string") { return oPayload.value; }
          if (oPayload && typeof oPayload.exportPdf === "string") { return oPayload.exportPdf; }
          throw new Error("The Admin service returned no PDF data. Check the BAS terminal for the server error.");
        });
      }).then(function (sBase64) {
        var sBinary;
        try {
          sBinary = atob(sBase64);
        } catch (decodeError) {
          throw new Error("The server response was not valid Base64 PDF data.");
        }
        if (sBinary.slice(0, 5) !== "%PDF-") {
          throw new Error("The server response did not contain a valid PDF file.");
        }
        var aBytes = new Uint8Array(sBinary.length);
        for (var i = 0; i < sBinary.length; i++) { aBytes[i] = sBinary.charCodeAt(i); }
        var oUrl = URL.createObjectURL(new Blob([aBytes], { type: "application/pdf" }));
        var oLink = document.createElement("a");
        oLink.href = oUrl;
        oLink.download = "asset-admin-report.pdf";
        document.body.appendChild(oLink);
        oLink.click();
        oLink.remove();
        // Keep the URL alive briefly so the browser can start the download.
        setTimeout(function () { URL.revokeObjectURL(oUrl); }, 1500);
        MessageToast.show("Admin report download started");
      }).catch(function (e) {
        MessageBox.error(e && e.message ? e.message : "Could not download the Admin report");
      });
    },
    onEmailReport: function () {
      var oInput = new Input({ placeholder: "name@company.com", type: "Email", width: "100%" });
      var oDialog;
      oDialog = new Dialog({
        title: "Email Admin report",
        contentWidth: "22rem",
        content: [new Label({ text: "Send the PDF report to" }), oInput],
        beginButton: new Button({
          text: "Send", type: "Emphasized",
          press: function () {
            var oOperation = this.getOwnerComponent().getModel().bindContext("/emailReport(...)");
            oOperation.setParameter("to", oInput.getValue());
            oDialog.setBusy(true);
            oOperation.execute().then(function () {
              var oResult = oOperation.getBoundContext().getObject();
              oDialog.close();
              MessageToast.show(oResult && oResult.value ? oResult.value : "Report sent");
            }).catch(function (e) {
              oDialog.setBusy(false);
              MessageBox.error(e && e.message ? e.message : "Could not email the Admin report");
            });
          }.bind(this)
        }),
        endButton: new Button({ text: "Cancel", press: function () { oDialog.close(); } }),
        afterClose: function () { oDialog.destroy(); }
      });
      oDialog.open();
    },

    _go: function (sRoute) {
      this.getOwnerComponent().getRouter().navTo(sRoute);
    },
    onOpenAssets: function () { this._go("AssetsList"); },
    onOpenEmployees: function () { this._go("EmployeesList"); },
    onOpenDepartments: function () { this._go("DepartmentsList"); },
    onOpenCategories: function () { this._go("AssetCategoriesList"); },
    onOpenVendors: function () { this._go("VendorsList"); },
    onOpenMaintenance: function () { this._go("MaintenanceList"); },
    onOpenRequests: function () { this._go("AssetRequestsList"); }
  });
});