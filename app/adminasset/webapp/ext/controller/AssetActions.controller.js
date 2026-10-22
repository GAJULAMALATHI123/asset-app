sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension",
  "adminasset/ext/AssetActions"
], function (ControllerExtension, AssetActions) {
  "use strict";

  return ControllerExtension.extend("adminasset.ext.controller.AssetActions", {
    _getSelectedContexts: function () {
      var oExtensionAPI = this.base.getExtensionAPI();
      return oExtensionAPI.getSelectedContexts();
    },

    assign: function () {
      AssetActions.assign(null, this._getSelectedContexts());
    },

    transfer: function () {
      AssetActions.transfer(null, this._getSelectedContexts());
    },

    returnAsset: function () {
      AssetActions.returnAsset(null, this._getSelectedContexts());
    },

    createMaintenance: function () {
      AssetActions.createMaintenance(null, this._getSelectedContexts());
    },

    retire: function () {
      AssetActions.retire(null, this._getSelectedContexts());
    }
  });
});
