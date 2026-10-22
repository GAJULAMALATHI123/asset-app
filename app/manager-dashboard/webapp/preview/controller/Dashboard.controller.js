sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
  "use strict";

  function statusOf(row) {
    return String(row.status || "").toUpperCase().replace(/[ -]/g, "_");
  }

  return Controller.extend("managerdashboard.preview.controller.Dashboard", {
    onInit: function () {
      this.getView().setModel(new JSONModel({
        total: "—",
        available: "—",
        assigned: "—",
        maintenance: "—",
        retired: "—",
        archived: "—",
        message: "Loading inventory from the Manager OData service…"
      }), "dash");
      this.loadKpis();
    },

    loadKpis: function () {
      var view = this.getView();
      var model = this.getOwnerComponent().getModel();
      view.setBusy(true);

      return model.bindList("/AssetFacts").requestContexts(0, 5000).then(function (contexts) {
        var rows = contexts.map(function (context) { return context.getObject(); });
        var counts = { available: 0, assigned: 0, maintenance: 0, retired: 0, archived: 0 };
        rows.forEach(function (row) {
          var status = statusOf(row);
          if (status === "AVAILABLE") { counts.available += 1; }
          else if (status === "ASSIGNED") { counts.assigned += 1; }
          else if (status === "MAINTENANCE" || status === "IN_MAINTENANCE") { counts.maintenance += 1; }
          else if (status === "RETIRED") { counts.retired += 1; }
          else if (status === "ARCHIVED") { counts.archived += 1; }
        });
        this.getView().getModel("dash").setData({
          total: String(rows.length),
          available: String(counts.available),
          assigned: String(counts.assigned),
          maintenance: String(counts.maintenance),
          retired: String(counts.retired),
          archived: String(counts.archived),
          message: "Live KPI totals loaded • Updated " + new Date().toLocaleTimeString()
        });
      }.bind(this)).catch(function (error) {
        this.getView().getModel("dash").setProperty("/message", "Could not load live totals. Check that the Manager OData service is running and that you are signed in as a permitted user.");
        MessageBox.error("Manager KPI preview could not load AssetFacts. " +
          (error && error.message ? error.message : "Check the Manager OData service."));
      }.bind(this)).finally(function () {
        view.setBusy(false);
      });
    },

    onRefresh: function () {
      this.loadKpis().then(function () { MessageToast.show("Manager KPI preview refreshed"); });
    },

    onOpenExisting: function () {
      window.open("./index.html?sap-ui-xx-viewCache=false", "_blank", "noopener");
    }
  });
});