sap.ui.define([
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Label",
  "sap/m/Input",
  "sap/m/DatePicker",
  "sap/m/Select",
  "sap/ui/core/Item",
  "sap/m/TextArea",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/m/VBox"
], function (Dialog, Button, Label, Input, DatePicker, Select, Item, TextArea, MessageBox, MessageToast, VBox) {
  "use strict";

  function selectedContext(oFirstArg, aSelectedContexts) {
    if (Array.isArray(aSelectedContexts) && aSelectedContexts.length) {
      if (aSelectedContexts.length > 1) {
        MessageBox.information("Select only one asset row at a time.");
        return null;
      }
      return aSelectedContexts[0];
    }
    // Some Fiori elements handler configurations provide the selected context as the first argument.
    if (oFirstArg && typeof oFirstArg.getObject === "function" && typeof oFirstArg.getModel === "function") {
      return oFirstArg;
    }
    if (oFirstArg && typeof oFirstArg.getBoundContext === "function") {
      return oFirstArg.getBoundContext();
    }
    return null;
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function loadChoices(oModel, sPath, sKey, sText, fnDone) {
    oModel.bindList(sPath).requestContexts(0, 500).then(function (aContexts) {
      fnDone(aContexts.map(function (oContext) {
        var o = oContext.getObject();
        return { key: o[sKey], text: o[sText] || o[sKey] };
      }));
    }).catch(function (e) {
      MessageBox.error("Could not load choices: " + (e.message || e));
      fnDone([]);
    });
  }

  function openAction(oFirstArg, aSelectedContexts, sAction, aFields) {
    var oContext = selectedContext(oFirstArg, aSelectedContexts);
    if (!oContext) {
      MessageBox.information("Select one asset row first.");
      return;
    }
    var oModel = oContext.getModel();
    var mControls = {};
    var aItems = [];
    aFields.forEach(function (f) {
      aItems.push(new Label({ text: f.label, required: !!f.required }));
      if (f.kind === "select") {
        var oSelect = new Select({ width: "100%", selectedKey: "" });
        mControls[f.name] = oSelect;
        var addChoices = function (aChoices) {
          aChoices.forEach(function (choice) {
            oSelect.addItem(new Item({ key: choice.key, text: choice.text }));
          });
          if (aChoices.length) { oSelect.setSelectedKey(aChoices[0].key); }
        };
        if (f.choices) {
          addChoices(f.choices);
        } else {
          loadChoices(oModel, f.path, f.key, f.text, addChoices);
        }
        aItems.push(oSelect);
      } else if (f.kind === "date") {
        mControls[f.name] = new DatePicker({ width: "100%", value: today(), valueFormat: "yyyy-MM-dd", displayFormat: "medium" });
        aItems.push(mControls[f.name]);
      } else if (f.kind === "textarea") {
        mControls[f.name] = new TextArea({ width: "100%", rows: 3, growing: true, maxLength: 1000 });
        aItems.push(mControls[f.name]);
      } else {
        mControls[f.name] = new Input({ width: "100%", type: f.kind === "number" ? "Number" : "Text" });
        aItems.push(mControls[f.name]);
      }
    });

    var oDialog = new Dialog({
      title: aFields.length ? aFields[0].dialogTitle || "Asset action" : "Asset action",
      contentWidth: "32rem",
      resizable: true,
      content: [new VBox({ width: "100%", items: aItems })],
      beginButton: new Button({
        text: "Confirm",
        type: "Emphasized",
        press: function () {
          var mParams = {};
          var bInvalid = false;
          aFields.forEach(function (f) {
            var v = f.kind === "select" ? mControls[f.name].getSelectedKey() : mControls[f.name].getValue();
            if (f.required && !v) { bInvalid = true; }
            mParams[f.name] = v;
          });
          if (bInvalid) {
            MessageBox.warning("Please complete all required fields.");
            return;
          }
          var sQualifiedAction = "AssetAdminService." + sAction + "(...)";
          var oOperation = oModel.bindContext(sQualifiedAction, oContext);
          Object.keys(mParams).forEach(function (sName) { oOperation.setParameter(sName, mParams[sName]); });
          oDialog.setBusy(true);
          oOperation.execute().then(function () {
            oDialog.close();
            MessageToast.show("Asset action completed.");
            // Refresh the selected row's list binding (OData V4 models themselves do not expose refresh()).
            var oListBinding = oContext.getBinding && oContext.getBinding();
            if (oListBinding && oListBinding.refresh) {
              oListBinding.refresh();
            }
          }).catch(function (e) {
            MessageBox.error("The action could not be completed. " + (e.message || e));
          }).finally(function () { oDialog.setBusy(false); });
        }
      }),
      endButton: new Button({ text: "Cancel", press: function () { oDialog.close(); } }),
      afterClose: function () { oDialog.destroy(); }
    });
    oDialog.open();
  }

  return {
    enabledForSingleSelect: function (_oContext, aSelectedContexts) {
      return Array.isArray(aSelectedContexts) && aSelectedContexts.length === 1;
    },

    assign: function (oFirstArg, aSelectedContexts) {
      openAction(oFirstArg, aSelectedContexts, "assign", [
        { name: "employeeId", label: "Employee", dialogTitle: "Assign asset", required: true, kind: "select", path: "/Employees", key: "employee_id", text: "full_name" },
        { name: "distributionDate", label: "Distribution date", required: true, kind: "date" },
        { name: "remarks", label: "Remarks", kind: "textarea" }
      ]);
    },
    transfer: function (oFirstArg, aSelectedContexts) {
      openAction(oFirstArg, aSelectedContexts, "transfer", [
        { name: "toEmployeeId", label: "Transfer to employee", dialogTitle: "Transfer asset", required: true, kind: "select", path: "/Employees", key: "employee_id", text: "full_name" },
        { name: "transferDate", label: "Transfer date", required: true, kind: "date" },
        { name: "remarks", label: "Remarks", kind: "textarea" }
      ]);
    },
    returnAsset: function (oFirstArg, aSelectedContexts) {
      openAction(oFirstArg, aSelectedContexts, "returnAsset", [
        { name: "returnDate", label: "Return date", dialogTitle: "Return asset", required: true, kind: "date" },
        { name: "remarks", label: "Remarks", kind: "textarea" }
      ]);
    },
    createMaintenance: function (oFirstArg, aSelectedContexts) {
      openAction(oFirstArg, aSelectedContexts, "createMaintenance", [
        { name: "maintenanceType", label: "Maintenance type", dialogTitle: "Start maintenance", required: true, kind: "select", choices: [{ key: "PREVENTIVE", text: "Preventive" }, { key: "CORRECTIVE", text: "Corrective" }] },
        { name: "description", label: "Description", required: true, kind: "textarea" }
      ]);
    },
    retire: function (oFirstArg, aSelectedContexts) {
      openAction(oFirstArg, aSelectedContexts, "retire", [
        { name: "reason", label: "Retirement reason", dialogTitle: "Retire asset", required: true, kind: "textarea" },
        { name: "retirementDate", label: "Retirement date", required: true, kind: "date" }
      ]);
    }
  };
});
