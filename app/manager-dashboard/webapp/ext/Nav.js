sap.ui.define(["sap/ui/core/Component", "sap/ui/core/Element", "sap/m/Dialog", "sap/m/Button", "sap/m/Input",
  "sap/m/Label", "sap/m/MessageToast", "sap/m/MessageBox"],
function (Component, Element, Dialog, Button, Input, Label, MessageToast, MessageBox) {
  "use strict";
  var appComponent = function () {
    return Component.registry.filter(function (c) { return c.getRouter && c.getRouter() && c.getModel && c.getModel(); })[0];
  };
  // the filters currently applied to the dashboard table (filter bar + chart selection)
  var currentFilter = function () {
    try {
      var table = Element.registry.filter(function (e) { return e.isA && e.isA("sap.ui.mdc.Table") && e.getRowBinding && e.getRowBinding(); })[0];
      if (!table) { return null; }
      var binding = table.getRowBinding();
      if (!binding || typeof binding.getDownloadUrl !== "function") { return null; }
      var url = binding.getDownloadUrl();
      if (typeof url !== "string") { return null; }
      return new URLSearchParams(url.split("?")[1] || "").get("$filter") || "";
    } catch (e) { return null; }
  };
  var callOp = function (path, params) {
    var op = appComponent().getModel().bindContext(path);
    Object.keys(params).forEach(function (k) { op.setParameter(k, params[k]); });
    return op.execute().then(function () { return op.getBoundContext().getObject(); });
  };

  return {
    goAttention: function () {
      var comp = Component.registry.filter(function (c) { return c.getRouter && c.getRouter() && c.getRouter().getRoute("AttentionList"); })[0];
      if (comp) { comp.getRouter().navTo("AttentionList"); }
    },
    downloadPdf: function () {
      var filter = currentFilter();
      if (filter === null) {
        MessageBox.error("Could not read the current dashboard filters. Please wait for the asset table to load and try again.");
        return;
      }
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
      if (filter === null) {
        MessageBox.error("Could not read the current dashboard filters. Please wait for the asset table to load and try again.");
        return;
      }
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