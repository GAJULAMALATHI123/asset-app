sap.ui.define(["sap/fe/core/rootView/NavContainer.controller"], function (NavContainerController) {
  "use strict";
  return NavContainerController.extend("adminasset.controller.App", {
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
