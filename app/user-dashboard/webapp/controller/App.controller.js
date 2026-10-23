sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Dialog",
  "sap/m/Label",
  "sap/m/Select",
  "sap/ui/core/Item",
  "sap/m/TextArea",
  "sap/m/Button",
  "sap/m/VBox"
], function (Controller, MessageToast, MessageBox, Dialog, Label, Select, Item, TextArea, Button, VBox) {
  "use strict";

  return Controller.extend("userdashboard.controller.App", {
    onInit: function () {
      this._loadDashboardData();
    },

    _readCollection: async function (sPath) {
      var oModel = this.getView().getModel();
      var oBinding = oModel.bindList(sPath);
      try {
        var aContexts = await oBinding.requestContexts(0, 500);
        return aContexts.map(function (oContext) { return oContext.getObject(); });
      } finally {
        oBinding.destroy();
      }
    },

    _loadDashboardData: async function () {
      try {
        var results = await Promise.all([
          this._readCollection("/Assets"),
          this._readCollection("/MaintenanceRecords")
        ]);
        var assets = results[0];
        var maintenance = results[1];

        this.byId("assetsKpi").setText(String(assets.length));
        this.byId("openKpi").setText(String(maintenance.filter(function (r) {
          return r.status === "OPEN";
        }).length));
        this.byId("progressKpi").setText(String(maintenance.filter(function (r) {
          return r.status === "IN_PROGRESS";
        }).length));
        this.byId("completedKpi").setText(String(maintenance.filter(function (r) {
          return r.status === "COMPLETED";
        }).length));

        this._assets = assets;
        this._maintenance = maintenance;
      } catch (error) {
        MessageBox.warning(
          "We couldn't load your dashboard data. Make sure your login is linked to an employee record and that the User service is running.\n\n" +
          (error && error.message ? error.message : "Unknown service error")
        );
      }
    },

    onRefresh: async function () {
      ["assetsTable", "maintenanceTable"].forEach(function (id) {
        var table = this.byId(id);
        var binding = table && table.getBinding("items");
        if (binding) binding.refresh();
      }, this);
      await this._loadDashboardData();
      MessageToast.show("Dashboard refresh completed.");
    },

    onRaiseRequest: async function () {
      try {
        var aAssets = await this._readCollection("/Assets");
        if (!aAssets.length) {
          MessageBox.information("You don't have any assigned assets available for a maintenance request.");
          return;
        }

        var oSelect = new Select({ width: "100%", selectedKey: aAssets[0].asset_id });
        aAssets.forEach(function (asset) {
          oSelect.addItem(new Item({
            key: asset.asset_id,
            text: (asset.asset_tag || asset.asset_id) + " — " + (asset.model || "Asset")
          }));
        });

        var oDescription = new TextArea({
          width: "100%",
          rows: 4,
          maxLength: 2000,
          placeholder: "Describe the issue you are experiencing"
        });

        var oDialog = new Dialog({
          title: "Raise Maintenance Request",
          contentWidth: "32rem",
          content: [
            new VBox({
              width: "100%",
              items: [
                new Label({ text: "Select asset", labelFor: oSelect }),
                oSelect,
                new Label({ text: "Describe the issue", labelFor: oDescription }).addStyleClass("sapUiSmallMarginTop"),
                oDescription
              ]
            }).addStyleClass("sapUiResponsiveContentPadding")
          ],
          beginButton: new Button({
            text: "Submit Request",
            type: "Emphasized",
            press: async function () {
              var description = (oDescription.getValue() || "").trim();
              if (!description) {
                MessageBox.error("Please describe the maintenance issue.");
                return;
              }

              var oModel = this.getView().getModel();
              var oAction = oModel.bindContext("/RaiseMaintenanceRequest(...)");
              oAction.setParameter("assetId", oSelect.getSelectedKey());
              oAction.setParameter("description", description);
              try {
                await oAction.execute();
                oDialog.close();
                MessageToast.show("Maintenance request submitted.");
                await this._loadDashboardData();
              } catch (error) {
                MessageBox.error("The maintenance request could not be submitted.\n" +
                  (error && error.message ? error.message : "Please try again or contact support."));
              } finally {
                oAction.destroy();
              }
            }.bind(this)
          }),
          endButton: new Button({
            text: "Cancel",
            press: function () { oDialog.close(); }
          }),
          afterClose: function () { oDialog.destroy(); }
        });
        this.getView().addDependent(oDialog);
        oDialog.open();
      } catch (error) {
        MessageBox.error("Your assigned assets could not be loaded. Please check your login and the User service.");
      }
    }
  });
});
