sap.ui.define([
  "sap/m/Dialog", "sap/m/Button", "sap/m/Label", "sap/m/DatePicker",
  "sap/m/Select", "sap/ui/core/Item", "sap/m/TextArea", "sap/m/VBox",
  "sap/m/MessageBox", "sap/m/MessageToast"
], function (Dialog, Button, Label, DatePicker, Select, Item, TextArea, VBox, MessageBox, MessageToast) {
  "use strict";

  function selectedContext(first, selected) {
    if (Array.isArray(selected) && selected.length) {
      if (selected.length !== 1) {
        MessageBox.information("Select one asset request at a time.");
        return null;
      }
      return selected[0];
    }
    if (first && typeof first.getObject === "function" && typeof first.getModel === "function") {
      return first;
    }
    if (first && typeof first.getBoundContext === "function") {
      return first.getBoundContext();
    }
    return null;
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  function refresh(context) {
    var binding = context && context.getBinding && context.getBinding();
    if (binding && typeof binding.refresh === "function") { binding.refresh(); }
  }

  function runAction(model, action, params, dialog, context) {
    var operation = model.bindContext("/" + action + "(...)");
    Object.keys(params).forEach(function (key) { operation.setParameter(key, params[key]); });
    dialog.setBusy(true);
    operation.execute().then(function () {
      var result = operation.getBoundContext().getObject();
      dialog.close();
      MessageToast.show(result && result.value ? result.value : "Request updated.");
      refresh(context);
    }).catch(function (e) {
      MessageBox.error(e && e.message ? e.message : "The request could not be updated.");
    }).finally(function () {
      dialog.setBusy(false);
    });
  }

  return {
    enabledForSingleSelect: function (_first, selected) {
      return Array.isArray(selected) && selected.length === 1 &&
        selected[0].getObject().status === "PENDING";
    },

    fulfill: function (first, selected) {
      var context = selectedContext(first, selected);
      if (!context) { MessageBox.information("Select one pending request first."); return; }
      var request = context.getObject();
      if (request.status !== "PENDING") {
        MessageBox.information("Only pending requests can be fulfilled.");
        return;
      }
      var model = context.getModel();
      var assetSelect = new Select({ width: "100%" });
      var datePicker = new DatePicker({ width: "100%", value: today(), valueFormat: "yyyy-MM-dd", displayFormat: "medium" });
      var remarks = new TextArea({ width: "100%", rows: 3, growing: true, maxLength: 1000,
        placeholder: "Optional assignment notes" });
      model.bindList("/Assets").requestContexts(0, 5000).then(function (contexts) {
        var requestedCategoryId = request.category_asset_category_id ||
          (request.category && request.category.asset_category_id);
        contexts.forEach(function (assetContext) {
          var asset = assetContext.getObject();
          if (asset.status === "AVAILABLE" && requestedCategoryId &&
              asset.assetCategory_asset_category_id === requestedCategoryId) {
            assetSelect.addItem(new Item({ key: asset.asset_id, text: (asset.asset_tag || asset.asset_id) + " — " + (asset.model || "Asset") }));
          }
        });
        if (!assetSelect.getItems().length) {
          MessageBox.warning("No available asset matches this request's category.");
          return;
        }
        assetSelect.setSelectedKey(assetSelect.getItems()[0].getKey());
        var dialog = new Dialog({
          title: "Approve request and assign asset",
          contentWidth: "32rem",
          resizable: true,
          content: [new VBox({ width: "100%", items: [
            new Label({ text: "Requested by" }), new Label({ text: request.requested_by || "Manager" }),
            new Label({ text: "Employee" }), new Label({ text: request.employee && request.employee.full_name || request.employee_employee_id || "" }),
            new Label({ text: "Asset category" }), new Label({ text: request.category && request.category.name || "" }),
            new Label({ text: "Available matching asset", required: true }), assetSelect,
            new Label({ text: "Distribution date", required: true }), datePicker,
            new Label({ text: "Assignment notes" }), remarks
          ]})],
          beginButton: new Button({ text: "Approve & assign", type: "Emphasized", press: function () {
            if (!assetSelect.getSelectedKey() || !datePicker.getValue()) {
              MessageBox.warning("Choose an available asset and distribution date.");
              return;
            }
            runAction(model, "fulfillAssetRequest", {
              requestId: request.request_id,
              assetId: assetSelect.getSelectedKey(),
              distributionDate: datePicker.getValue(),
              remarks: remarks.getValue()
            }, dialog, context);
          }}),
          endButton: new Button({ text: "Cancel", press: function () { dialog.close(); } }),
          afterClose: function () { dialog.destroy(); }
        });
        dialog.open();
      }).catch(function (e) {
        MessageBox.error("Could not load available assets. " + (e.message || ""));
      });
    },

    reject: function (first, selected) {
      var context = selectedContext(first, selected);
      if (!context) { MessageBox.information("Select one pending request first."); return; }
      var request = context.getObject();
      if (request.status !== "PENDING") {
        MessageBox.information("Only pending requests can be rejected.");
        return;
      }
      var notes = new TextArea({ width: "100%", rows: 3, growing: true, maxLength: 1000,
        placeholder: "Explain why the request is rejected" });
      var dialog = new Dialog({
        title: "Reject asset request",
        contentWidth: "28rem",
        content: [new VBox({ width: "100%", items: [
          new Label({ text: "Rejection reason", required: true }), notes
        ]})],
        beginButton: new Button({ text: "Reject request", type: "Emphasized", press: function () {
          var reason = notes.getValue().trim();
          if (!reason) { MessageBox.warning("Enter a rejection reason."); return; }
          runAction(context.getModel(), "rejectAssetRequest", {
            requestId: request.request_id, reviewNotes: reason
          }, dialog, context);
        }}),
        endButton: new Button({ text: "Cancel", press: function () { dialog.close(); } }),
        afterClose: function () { dialog.destroy(); }
      });
      dialog.open();
    }
  };
});
