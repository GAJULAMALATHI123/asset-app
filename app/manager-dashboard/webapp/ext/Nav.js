sap.ui.define(["sap/ui/core/Component", "sap/ui/core/Element", "sap/m/Dialog", "sap/m/Button", "sap/m/Input",
  "sap/m/Label", "sap/m/MessageToast", "sap/m/MessageBox", "sap/m/Select", "sap/ui/core/Item", "sap/m/TextArea", "sap/m/VBox"],
function (Component, Element, Dialog, Button, Input, Label, MessageToast, MessageBox, Select, Item, TextArea, VBox) {
  "use strict";
  var appComponent = function () {
    return Component.registry.filter(function (c) { return c.getRouter && c.getRouter() && c.getModel && c.getModel(); })[0];
  };
  // the filters currently applied to the dashboard table (filter bar + chart selection)
  var currentFilter = function () {
    try {
      var table = Element.registry.filter(function (e) { return e.isA && e.isA("sap.ui.mdc.Table") && e.getRowBinding && e.getRowBinding(); })[0];
      if (!table) { return ""; }
      var binding = table.getRowBinding();
      if (!binding || typeof binding.getDownloadUrl !== "function") { return ""; }
      var url = binding.getDownloadUrl();
      if (typeof url !== "string") { return ""; }
      return new URLSearchParams(url.split("?")[1] || "").get("$filter") || "";
    } catch (e) { return ""; }
  };
  var callOp = function (path, params) {
    var op = appComponent().getModel().bindContext(path);
    Object.keys(params).forEach(function (k) { op.setParameter(k, params[k]); });
    return op.execute().then(function () { return op.getBoundContext().getObject(); });
  };

  return {
    goRequests: function () {
      var comp = Component.registry.filter(function (c) { return c.getRouter && c.getRouter() && c.getRouter().getRoute("AssetRequestsList"); })[0];
      if (comp) { comp.getRouter().navTo("AssetRequestsList"); }
    },
    requestAsset: function () {
      var comp = appComponent();
      if (!comp) { MessageBox.error("The Manager application is not ready yet."); return; }
      var model = comp.getModel();
      var employeeSelect = new Select({ width: "100%" });
      var categorySelect = new Select({ width: "100%" });
      var reasonInput = new TextArea({ width: "100%", rows: 3, growing: true, maxLength: 1000, placeholder: "Explain why this asset is needed" });
      var dialog;
      Promise.all([
        model.bindList("/Employees").requestContexts(0, 500),
        model.bindList("/AssetCategories").requestContexts(0, 500)
      ]).then(function (results) {
        results[0].forEach(function (ctx) {
          var employee = ctx.getObject();
          if (employee.status === "ACTIVE") {
            employeeSelect.addItem(new Item({ key: employee.employee_id, text: employee.full_name || employee.employee_id }));
          }
        });
        results[1].forEach(function (ctx) {
          var category = ctx.getObject();
          if (category.is_active !== false) {
            categorySelect.addItem(new Item({ key: category.asset_category_id, text: category.name || category.asset_category_id }));
          }
        });
        if (employeeSelect.getItems().length) { employeeSelect.setSelectedKey(employeeSelect.getItems()[0].getKey()); }
        if (categorySelect.getItems().length) { categorySelect.setSelectedKey(categorySelect.getItems()[0].getKey()); }
        dialog = new Dialog({
          title: "Request an asset",
          contentWidth: "32rem",
          resizable: true,
          content: [new VBox({ width: "100%", items: [
            new Label({ text: "Employee", required: true }), employeeSelect,
            new Label({ text: "Asset category", required: true }), categorySelect,
            new Label({ text: "Business reason", required: true }), reasonInput
          ]})],
          beginButton: new Button({ text: "Submit request", type: "Emphasized", press: function () {
            var employeeId = employeeSelect.getSelectedKey();
            var categoryId = categorySelect.getSelectedKey();
            var reason = reasonInput.getValue().trim();
            if (!employeeId || !categoryId || !reason) {
              MessageBox.warning("Select an employee and category, and enter a business reason.");
              return;
            }
            dialog.setBusy(true);
            callOp("/requestAsset(...)", { employeeId: employeeId, categoryId: categoryId, reason: reason }).then(function (res) {
              dialog.close();
              MessageToast.show(res && res.value ? res.value : "Asset request submitted to Admin.");
              var router = comp.getRouter && comp.getRouter();
              if (router && router.getRoute("AssetRequestsList")) { router.navTo("AssetRequestsList"); }
            }).catch(function (e) {
              dialog.setBusy(false);
              MessageBox.error(e.message || "Could not submit the asset request.");
            });
          }}),
          endButton: new Button({ text: "Cancel", press: function () { dialog.close(); } }),
          afterClose: function () { dialog.destroy(); }
        });
        dialog.open();
      }).catch(function (e) {
        MessageBox.error("Could not load employees or asset categories. " + (e.message || ""));
      });
    },
    goMaintenance: function () {
      var comp = Component.registry.filter(function (c) { return c.getRouter && c.getRouter() && c.getRouter().getRoute("MaintenanceRecordsList"); })[0];
      if (comp) { comp.getRouter().navTo("MaintenanceRecordsList"); }
      else { MessageBox.error("The Maintenance Tracking page is not available."); }
    },
    goAttention: function () {
      var comp = Component.registry.filter(function (c) { return c.getRouter && c.getRouter() && c.getRouter().getRoute("AttentionList"); })[0];
      if (comp) { comp.getRouter().navTo("AttentionList"); }
    },
    downloadPdf: function () {
      var filter = currentFilter();
      callOp("/exportPdf(...)", { filter: filter }).then(function (res) {
        var bin = atob(res.value), bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        a.download = "asset-report.pdf"; document.body.appendChild(a); a.click(); a.remove();
        MessageToast.show("Report downloaded");
      }).catch(function (e) { MessageBox.error(e.message || "Download failed"); });
    },
    emailReport: function () {
      var filter = currentFilter();
      var input = new Input({ placeholder: "name@company.com", type: "Email", width: "100%" });
      var dlg = new Dialog({ title: "Email report", contentWidth: "22rem",
        content: [new Label({ text: "Send the report to" }), input],
        beginButton: new Button({ text: "Send", type: "Emphasized", press: function () {
          dlg.setBusy(true);
          callOp("/emailReport(...)", { filter: filter, to: input.getValue() }).then(function (res) {
            dlg.close(); MessageToast.show(res.value || "Report sent");
          }).catch(function (e) { dlg.setBusy(false); MessageBox.error(e.message || "Email failed"); });
        } }),
        endButton: new Button({ text: "Cancel", press: function () { dlg.close(); } }),
        afterClose: function () { dlg.destroy(); } });
      dlg.open();
    }
  };
});