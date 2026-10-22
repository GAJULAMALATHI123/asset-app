sap.ui.define(["sap/ui/core/mvc/Controller"], function (Controller) {
  "use strict";
  return Controller.extend("adminasset.controller.App", {
    onToggleSideNav: function () {
      var oShell = this.byId("shell");
      oShell.setSideExpanded(!oShell.getSideExpanded());
    },
    onItemSelect: function (oEvent) {
      var sRoute = oEvent.getParameter("item").getKey();
      if (sRoute) {
        this.getOwnerComponent().getRouter().navTo(sRoute);
      }
    }
  });
});